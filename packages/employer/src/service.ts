/**
 * Employer + plan-year service. Same control as census/dependents: every method
 * authorizes (permission x scope) AND routes to the right customer DB via
 * getCustomerDb(ctx, permission, employerId) BEFORE any DB access. Unknown/disabled
 * user, unauthorized/unknown/archived employer, or a missing permission fails closed
 * inside getCustomerDb — never in the repository.
 */
import { getCustomerDb, controlPlanePool, AuthError, type AuthContext } from "@goben/data-access";
import * as repo from "./plan-year-repository.js";
import * as setupRepo from "./plan-year-setup-repository.js";
import * as catalogRepo from "./plan-catalog-repository.js";
import * as enrollmentRepo from "./enrollment-repository.js";
import { deriveChecklist, type PlanYearSetupStatus } from "./plan-year-checklist.js";
import {
  buildPlanCatalog,
  buildPlanDetail,
  coverageLineOf,
  type PlanCatalog,
  type BenefitPlanDetail,
} from "./plan-catalog.js";
import {
  buildEnrollmentProgress,
  buildEnrollmentCenter,
  type EnrollmentProgress,
  type EnrollmentCenter,
} from "./enrollment.js";
import { buildEmployerOverview, type EmployerOverview } from "./overview.js";
import type { Employer, PlanYear } from "./types.js";

/** All plan years for an employer (top-bar plan-year selector + Plan Years overview). */
export async function listPlanYears(ctx: AuthContext, employerId: string): Promise<PlanYear[]> {
  const { db } = await getCustomerDb(ctx, "plan_year.read", employerId);
  return repo.listPlanYears(db);
}

/**
 * Plan Year Setup checklist (Phase D-1) — a DERIVED aggregate read model. Authorizes +
 * routes exactly like the other plan-year reads (`plan_year.read`, fail-closed inside
 * getCustomerDb), then combines the control-plane step catalog with per-plan-year
 * overrides + current domain state. completionPct/blockers are computed server-side
 * (see deriveChecklist). No new permission is introduced.
 */
export async function planYearSetupStatus(
  ctx: AuthContext,
  employerId: string,
  planYearId: string
): Promise<PlanYearSetupStatus> {
  const { db } = await getCustomerDb(ctx, "plan_year.read", employerId);
  const cp = await controlPlanePool();
  const [defs, overrides, domain] = await Promise.all([
    setupRepo.listStepDefinitions(cp),
    setupRepo.listStepOverrides(db, planYearId),
    setupRepo.planYearSetupState(db, planYearId),
  ]);
  return deriveChecklist(employerId, planYearId, defs, overrides, domain);
}

/** The UI-default plan year for an employer (or null if none exists yet). */
export async function currentPlanYear(ctx: AuthContext, employerId: string): Promise<PlanYear | null> {
  const { db } = await getCustomerDb(ctx, "plan_year.read", employerId);
  return repo.currentPlanYear(db);
}

/**
 * Plans & Rates catalog (Phase D-2) — server-computed aggregate read model over
 * benefit_plan / plan_rate / contribution_rule. Authorizes on `benefit_plan.read`
 * (broker gained this in 0004; employer_admin already had it), fail-closed inside
 * getCustomerDb. benefit_type is control-plane reference data. No mutation, no new
 * permission beyond the approved broker read co-grant.
 */
export async function planCatalog(ctx: AuthContext, employerId: string, planYearId: string): Promise<PlanCatalog> {
  const { db } = await getCustomerDb(ctx, "benefit_plan.read", employerId);
  const cp = await controlPlanePool();
  const [plans, benefitTypes, rule, planYearStatus] = await Promise.all([
    catalogRepo.listCatalogPlans(db, planYearId),
    catalogRepo.listBenefitTypes(cp),
    catalogRepo.getContributionRule(db),
    planYearStatusOf(db, planYearId),
  ]);
  return buildPlanCatalog(employerId, planYearId, planYearStatus, plans, benefitTypes, rule);
}

/**
 * Plan detail (Phase D-2) — one plan's benefits/rates/contributions/eligibility.
 * Same authorization + routing as the catalog. Throws Unauthorized-shaped NotFound if
 * the plan isn't in this employer's plan year, or has a benefit type with no
 * CoverageLine (out of D-2 scope).
 */
export async function benefitPlanDetail(
  ctx: AuthContext,
  employerId: string,
  planYearId: string,
  planId: string
): Promise<BenefitPlanDetail> {
  const { db } = await getCustomerDb(ctx, "benefit_plan.read", employerId);
  const plan = await catalogRepo.getCatalogPlan(db, planYearId, planId);
  if (!plan) throw new AuthError("Plan not found for this employer / plan year");
  const line = coverageLineOf(plan.benefitTypeKey);
  if (line == null) throw new AuthError("Plan type is not supported by Plans & Rates");
  const [rates, rule, classes] = await Promise.all([
    catalogRepo.listPlanRates(db, planId),
    catalogRepo.getContributionRule(db),
    catalogRepo.listEligibilityClasses(db),
  ]);
  return buildPlanDetail(plan, line, rates, rule, classes);
}

/** Plan-year status for the routed customer DB (small helper; null if not found). */
async function planYearStatusOf(db: import("mysql2/promise").Pool, planYearId: string): Promise<string | null> {
  const [rows] = await db.query(`SELECT status FROM plan_year WHERE id = UUID_TO_BIN(:planYearId) LIMIT 1`, { planYearId });
  return (rows as any[])[0]?.status ?? null;
}

async function planYearLabelStatus(db: import("mysql2/promise").Pool, planYearId: string): Promise<{ label: string | null; status: string | null }> {
  const [rows] = await db.query(`SELECT label, status FROM plan_year WHERE id = UUID_TO_BIN(:planYearId) LIMIT 1`, { planYearId });
  const r = (rows as any[])[0];
  return { label: r?.label ?? null, status: r?.status ?? null };
}

/**
 * Employer Overview rollup (Phase D-4) — a compact dashboard read model that COMPOSES the
 * D-1 checklist, D-2 catalog, and D-3 enrollment counts. Authorizes on `employer.read`
 * (both broker and employer_admin already hold it — no new grant), fail-closed inside
 * getCustomerDb. Read-only; aggregate counts only (no row-level data). Reuses the existing
 * repositories rather than re-deriving.
 */
export async function employerOverview(ctx: AuthContext, employerId: string, planYearId: string): Promise<EmployerOverview> {
  const { db } = await getCustomerDb(ctx, "employer.read", employerId);
  const cp = await controlPlanePool();
  const event = await enrollmentRepo.getOeEvent(db, planYearId);
  const [py, defs, overrides, domain, catalogPlans, benefitTypes, rule, { counts }] = await Promise.all([
    planYearLabelStatus(db, planYearId),
    setupRepo.listStepDefinitions(cp),
    setupRepo.listStepOverrides(db, planYearId),
    setupRepo.planYearSetupState(db, planYearId),
    catalogRepo.listCatalogPlans(db, planYearId),
    catalogRepo.listBenefitTypes(cp),
    catalogRepo.getContributionRule(db),
    enrollmentRepo.getEnrollmentCounts(db, cp, planYearId, event),
  ]);
  const checklist = deriveChecklist(employerId, planYearId, defs, overrides, domain);
  const catalog = buildPlanCatalog(employerId, planYearId, py.status, catalogPlans, benefitTypes, rule);
  return buildEmployerOverview({
    employerId, planYearId,
    planYearLabel: py.label, planYearStatus: py.status,
    checklist, catalogPlans: catalog.plans, counts,
  });
}

/**
 * Enrollment Progress (Phase D-3) — server-computed live progress for the plan year's
 * open-enrollment event. Authorizes on `enrollment.read` (broker gained this in 0005;
 * employer_admin already had it), fail-closed inside getCustomerDb. Read-only.
 */
export async function enrollmentProgress(ctx: AuthContext, employerId: string, planYearId: string): Promise<EnrollmentProgress> {
  const { db } = await getCustomerDb(ctx, "enrollment.read", employerId);
  const cp = await controlPlanePool();
  const event = await enrollmentRepo.getOeEvent(db, planYearId);
  const { counts } = await enrollmentRepo.getEnrollmentCounts(db, cp, planYearId, event);
  return buildEnrollmentProgress(employerId, planYearId, counts);
}

/**
 * Enrollment Center (Phase D-3) — the aggregate: launchState + launchReadiness (reuses
 * the D-1 checklist) + openEnrollmentSummary + windows + ongoingWork. Same authorization
 * (`enrollment.read`) and routing. Backend-ready in D-3; its FE consolidation is D-3b.
 */
export async function enrollmentCenter(ctx: AuthContext, employerId: string, planYearId: string): Promise<EnrollmentCenter> {
  const { db } = await getCustomerDb(ctx, "enrollment.read", employerId);
  const cp = await controlPlanePool();
  const event = await enrollmentRepo.getOeEvent(db, planYearId);
  const [{ counts }, defs, overrides, domain] = await Promise.all([
    enrollmentRepo.getEnrollmentCounts(db, cp, planYearId, event),
    setupRepo.listStepDefinitions(cp),
    setupRepo.listStepOverrides(db, planYearId),
    setupRepo.planYearSetupState(db, planYearId),
  ]);
  const checklist = deriveChecklist(employerId, planYearId, defs, overrides, domain);
  return buildEnrollmentCenter(employerId, planYearId, event?.eventId ?? null, counts, checklist);
}

/**
 * Employer detail read model. Registry fields come from the control-plane row that
 * getCustomerDb already resolved+authorized; per-tenant fields (counts, current plan
 * year, ein) come from the employer's OWN DB — a single routed read, not a fan-out.
 */
export async function getEmployer(ctx: AuthContext, employerId: string): Promise<Employer> {
  const { db, employer } = await getCustomerDb(ctx, "employer.read", employerId);
  const stats = await repo.employerTenantStats(db);
  const current = await repo.currentPlanYear(db);
  return {
    employerId: employer.id,
    name: employer.legalName,
    legalName: employer.legalName,
    ein: stats.ein,
    // industry / renewalMonth / agency+broker display names are not sourced in C1
    // (nullable in the contract); populated when the org read model lands.
    industry: null,
    employeeCount: stats.employeeCount,
    activeCount: stats.activeCount,
    locations: stats.locations,
    renewalMonth: null,
    agency: null,
    broker: null,
    currentPlanYearId: current?.id ?? null,
    currentPlanYearLabel: current?.label ?? null,
    status: employer.status,
  };
}
