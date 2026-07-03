/**
 * Plans & Rates repository (Phase D-2). SQL against a ROUTED customer-DB pool only
 * (the service authorizes + routes via getCustomerDb) plus the control-plane pool for
 * the shared benefit_type reference. Never resolves tenancy itself.
 */
import type { Pool } from "mysql2/promise";
import type {
  BenefitPlanRow,
  ContributionRuleRow,
  PlanRateRow,
  EligibilityClassRow,
  BenefitTypeRef,
} from "./plan-catalog.js";

/** Control-plane benefit_type reference (key → label). Shared, read-only. */
export async function listBenefitTypes(cp: Pool): Promise<BenefitTypeRef[]> {
  const [rows] = await cp.query(`SELECT key_name AS keyName, label FROM benefit_type`);
  return (rows as any[]).map((r) => ({ keyName: r.keyName, label: r.label }));
}

/** The single employer-level contribution rule (or null). D-2 uses one rule for the split. */
export async function getContributionRule(db: Pool): Promise<ContributionRuleRow | null> {
  const [rows] = await db.query(
    `SELECT name, display_name AS displayName,
            pct_employee_health AS pctEmployeeHealth,
            pct_employee_dental AS pctEmployeeDental,
            pct_employee_vision AS pctEmployeeVision
     FROM contribution_rule ORDER BY name LIMIT 1`
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    name: r.name,
    displayName: r.displayName ?? null,
    pctEmployeeHealth: Number(r.pctEmployeeHealth),
    pctEmployeeDental: Number(r.pctEmployeeDental),
    pctEmployeeVision: Number(r.pctEmployeeVision),
  };
}

/** All eligibility classes (names/waiting) for the tenant. */
export async function listEligibilityClasses(db: Pool): Promise<EligibilityClassRow[]> {
  const [rows] = await db.query(
    `SELECT name, waiting_period_days AS waitingPeriodDays, min_hours_weekly AS minHoursWeekly
     FROM eligibility_class ORDER BY name`
  );
  return (rows as any[]).map((r) => ({
    name: r.name,
    waitingPeriodDays: r.waitingPeriodDays == null ? null : Number(r.waitingPeriodDays),
    minHoursWeekly: r.minHoursWeekly == null ? null : Number(r.minHoursWeekly),
  }));
}

const PLAN_SELECT = `
  bp.benefit_type_key, bp.carrier_name, bp.plan_name, bp.subtype, bp.network,
  bp.setup_status, bp.status,
  bp.deductible_single, bp.deductible_family, bp.oop_single, bp.oop_family,
  bp.pcp_copay, bp.specialist_copay,
  (SELECT COUNT(*) FROM plan_option po WHERE po.benefit_plan_id = bp.id) AS optionCount,
  (SELECT COUNT(*) FROM plan_rate pr WHERE pr.benefit_plan_id = bp.id) AS rateRowCount,
  (SELECT COUNT(*) FROM document_link dl WHERE dl.entity_type = 'benefit_plan' AND dl.entity_id = bp.id) AS documentCount,
  (SELECT MIN(pr.effective_date) FROM plan_rate pr WHERE pr.benefit_plan_id = bp.id) AS effective`;

/** Count distinct tiers that carry a rate value across a plan's rate rows. */
async function rateTierCount(db: Pool, planId: string): Promise<number> {
  const [rows] = await db.query(
    `SELECT
        MAX(rate_ee IS NOT NULL)        AS ee,
        MAX(rate_ee_spouse IS NOT NULL) AS es,
        MAX(rate_ee_child IS NOT NULL)  AS ec,
        MAX(rate_family IS NOT NULL)    AS fam
     FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN(:planId)`,
    { planId }
  );
  const r = (rows as any[])[0] ?? {};
  return Number(!!r.ee) + Number(!!r.es) + Number(!!r.ec) + Number(!!r.fam);
}

/** Class names available to a plan (via plan_option.eligibility_class_id). */
async function planEligibleClasses(db: Pool, planId: string): Promise<string[]> {
  const [rows] = await db.query(
    `SELECT DISTINCT ec.name AS name
     FROM plan_option po JOIN eligibility_class ec ON ec.id = po.eligibility_class_id
     WHERE po.benefit_plan_id = UUID_TO_BIN(:planId) AND po.eligibility_class_id IS NOT NULL
     ORDER BY ec.name`,
    { planId }
  );
  return (rows as any[]).map((r) => r.name);
}

function toPlanRow(r: any, rateTierCountN: number, eligibleClasses: string[]): BenefitPlanRow {
  return {
    planId: r.id,
    planName: r.plan_name,
    carrierName: r.carrier_name ?? null,
    benefitTypeKey: r.benefit_type_key,
    subtype: r.subtype ?? null,
    network: r.network ?? null,
    setupStatus: r.setup_status,
    status: r.status,
    deductibleSingle: r.deductible_single == null ? null : Number(r.deductible_single),
    deductibleFamily: r.deductible_family == null ? null : Number(r.deductible_family),
    oopSingle: r.oop_single == null ? null : Number(r.oop_single),
    oopFamily: r.oop_family == null ? null : Number(r.oop_family),
    pcpCopay: r.pcp_copay ?? null,
    specialistCopay: r.specialist_copay ?? null,
    effective: r.effective ?? null,
    rateTierCount: rateTierCountN,
    optionCount: Number(r.optionCount),
    documentCount: Number(r.documentCount),
    enrolled: 0, // no elections in D-2 — Phase E
    eligibleClasses,
  };
}

/** All benefit plans for a plan year, with aggregate child counts, for the catalog. */
export async function listCatalogPlans(db: Pool, planYearId: string): Promise<BenefitPlanRow[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(bp.id) AS id, ${PLAN_SELECT}
     FROM benefit_plan bp
     WHERE bp.plan_year_id = UUID_TO_BIN(:planYearId)
     ORDER BY bp.plan_name`,
    { planYearId }
  );
  const out: BenefitPlanRow[] = [];
  for (const r of rows as any[]) {
    const [tiers, classes] = await Promise.all([rateTierCount(db, r.id), planEligibleClasses(db, r.id)]);
    out.push(toPlanRow(r, tiers, classes));
  }
  return out;
}

/** One benefit plan scoped to the plan year (null if not found in this tenant/PY). */
export async function getCatalogPlan(db: Pool, planYearId: string, planId: string): Promise<BenefitPlanRow | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(bp.id) AS id, ${PLAN_SELECT}
     FROM benefit_plan bp
     WHERE bp.id = UUID_TO_BIN(:planId) AND bp.plan_year_id = UUID_TO_BIN(:planYearId)
     LIMIT 1`,
    { planId, planYearId }
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  const [tiers, classes] = await Promise.all([rateTierCount(db, r.id), planEligibleClasses(db, r.id)]);
  return toPlanRow(r, tiers, classes);
}

/** Rate rows for a plan (for the detail tier pivot). */
export async function listPlanRates(db: Pool, planId: string): Promise<PlanRateRow[]> {
  const [rows] = await db.query(
    `SELECT rate_ee AS rateEe, rate_ee_spouse AS rateEeSpouse, rate_ee_child AS rateEeChild,
            rate_family AS rateFamily, effective_date AS effectiveDate
     FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN(:planId)
     ORDER BY effective_date, age`,
    { planId }
  );
  return (rows as any[]).map((r) => ({
    rateEe: Number(r.rateEe),
    rateEeSpouse: r.rateEeSpouse == null ? null : Number(r.rateEeSpouse),
    rateEeChild: r.rateEeChild == null ? null : Number(r.rateEeChild),
    rateFamily: r.rateFamily == null ? null : Number(r.rateFamily),
    effectiveDate: r.effectiveDate,
  }));
}
