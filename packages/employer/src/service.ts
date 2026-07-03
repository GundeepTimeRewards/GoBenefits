/**
 * Employer + plan-year service. Same control as census/dependents: every method
 * authorizes (permission x scope) AND routes to the right customer DB via
 * getCustomerDb(ctx, permission, employerId) BEFORE any DB access. Unknown/disabled
 * user, unauthorized/unknown/archived employer, or a missing permission fails closed
 * inside getCustomerDb — never in the repository.
 */
import { getCustomerDb, controlPlanePool, type AuthContext } from "@goben/data-access";
import * as repo from "./plan-year-repository.js";
import * as setupRepo from "./plan-year-setup-repository.js";
import { deriveChecklist, type PlanYearSetupStatus } from "./plan-year-checklist.js";
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
