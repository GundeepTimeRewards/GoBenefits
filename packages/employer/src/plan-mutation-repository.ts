/**
 * Plans & Rates mutation repository (Phase D-6). SQL against a ROUTED customer-DB
 * pool only — it never resolves tenancy itself (the service does that via
 * getCustomerDb). Read models stay in plan-catalog-repository; this file is writes.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";

export type PlanMeta = {
  id: string;
  planYearId: string;
  planYearStatus: string;
  planName: string;
  benefitTypeKey: string;
};

/** Minimal plan row for mutation guards (existence, plan-year status, name). */
export async function getPlanMeta(db: Pool, planId: string): Promise<PlanMeta | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(bp.id) AS id, BIN_TO_UUID(bp.plan_year_id) AS planYearId,
            py.status AS planYearStatus, bp.plan_name AS planName, bp.benefit_type_key AS benefitTypeKey
     FROM benefit_plan bp
     JOIN plan_year py ON py.id = bp.plan_year_id
     WHERE bp.id = UUID_TO_BIN(:planId) LIMIT 1`,
    { planId }
  );
  return ((rows as any[])[0] as PlanMeta) ?? null;
}

/** Plan-year status by id (null when not found). */
export async function planYearStatus(db: Pool, planYearId: string): Promise<string | null> {
  const [rows] = await db.query(`SELECT status FROM plan_year WHERE id = UUID_TO_BIN(:id) LIMIT 1`, {
    id: planYearId,
  });
  return (rows as any[])[0]?.status ?? null;
}

/** Insert a new draft plan for a line. Returns the new plan id. */
export async function insertPlan(
  db: Pool,
  args: { planYearId: string; benefitTypeKey: string; planName: string; carrierName: string | null }
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO benefit_plan (id, plan_year_id, benefit_type_key, plan_name, carrier_name, setup_status, status)
     VALUES (UUID_TO_BIN(:id), UUID_TO_BIN(:planYearId), :benefitTypeKey, :planName, :carrierName, 'not_started', 'draft')`,
    { id, ...args }
  );
  return id;
}

/**
 * Deep-copy a plan WITHIN its own plan year (options + rates, same INSERT…SELECT
 * approach as the D-5 renewal copy): the copy lands as `draft`/`in_progress` needing
 * review, legacy_id is not copied, rate effective dates stay as-is (same year).
 */
export async function duplicatePlanDeep(db: Pool, planId: string, newName: string): Promise<string> {
  const newPlanId = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO benefit_plan
         (id, plan_year_id, benefit_type_key, carrier_name, plan_name, plan_code, subtype,
          network, hsa_eligible, setup_status, setup_issue_count,
          deductible_single, deductible_family, oop_single, oop_family,
          pcp_copay, specialist_copay, attributes_json, status, legacy_id)
       SELECT UUID_TO_BIN(:newPlanId), plan_year_id, benefit_type_key, carrier_name,
              :newName, plan_code, subtype, network, hsa_eligible, 'in_progress', 0,
              deductible_single, deductible_family, oop_single, oop_family,
              pcp_copay, specialist_copay, attributes_json, 'draft', NULL
       FROM benefit_plan WHERE id = UUID_TO_BIN(:oldPlanId)`,
      { newPlanId, newName, oldPlanId: planId }
    );

    const [optionRows] = await conn.query(
      `SELECT BIN_TO_UUID(id) AS id FROM plan_option WHERE benefit_plan_id = UUID_TO_BIN(:oldPlanId)`,
      { oldPlanId: planId }
    );
    const optionIdMap = new Map<string, string>();
    for (const opt of optionRows as { id: string }[]) {
      const newOptionId = randomUUID();
      optionIdMap.set(opt.id, newOptionId);
      await conn.query(
        `INSERT INTO plan_option (id, benefit_plan_id, name, eligibility_class_id)
         SELECT UUID_TO_BIN(:newOptionId), UUID_TO_BIN(:newPlanId), name, eligibility_class_id
         FROM plan_option WHERE id = UUID_TO_BIN(:oldOptionId)`,
        { newOptionId, newPlanId, oldOptionId: opt.id }
      );
    }

    const RATE_COPY = `
      INSERT INTO plan_rate (benefit_plan_id, plan_option_id, age,
                             rate_ee, rate_ee_spouse, rate_ee_child, rate_family, effective_date)
      SELECT UUID_TO_BIN(:newPlanId), %OPTION%, age,
             rate_ee, rate_ee_spouse, rate_ee_child, rate_family, effective_date
      FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN(:oldPlanId) AND %WHERE%`;
    for (const [oldOptionId, newOptionId] of optionIdMap) {
      await conn.query(
        RATE_COPY.replace("%OPTION%", "UUID_TO_BIN(:newOptionId)").replace(
          "%WHERE%",
          "plan_option_id = UUID_TO_BIN(:oldOptionId)"
        ),
        { newPlanId, newOptionId, oldPlanId: planId, oldOptionId }
      );
    }
    await conn.query(RATE_COPY.replace("%OPTION%", "NULL").replace("%WHERE%", "plan_option_id IS NULL"), {
      newPlanId,
      oldPlanId: planId,
    });

    await conn.commit();
    return newPlanId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type RateBand = {
  age: number | null;
  rateEe: number;
  rateEeSpouse: number | null;
  rateEeChild: number | null;
  rateFamily: number | null;
};

/**
 * Replace the plan's ENTIRE rate table with these bands at one effective date, in one
 * transaction (documented import semantics: an import is the new authoritative table,
 * not a merge). Imported bands are plan-level — no plan_option link.
 */
export async function replacePlanRates(
  db: Pool,
  planId: string,
  effectiveDate: string,
  rows: RateBand[]
): Promise<void> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN(:planId)`, { planId });
    for (const r of rows) {
      await conn.query(
        `INSERT INTO plan_rate (benefit_plan_id, plan_option_id, age,
                                rate_ee, rate_ee_spouse, rate_ee_child, rate_family, effective_date)
         VALUES (UUID_TO_BIN(:planId), NULL, :age, :rateEe, :rateEeSpouse, :rateEeChild, :rateFamily, :effectiveDate)`,
        { planId, effectiveDate, ...r }
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type ContributionRulePatch = {
  name?: string;
  displayName?: string;
  pctEmployeeHealth?: number;
  pctEmployeeDental?: number;
  pctEmployeeVision?: number;
  pctDependentHealth?: number;
  pctDependentDental?: number;
  pctDependentVision?: number;
  fixedBasicLife?: number;
};

const PCT_COLUMNS: Record<string, string> = {
  pctEmployeeHealth: "pct_employee_health",
  pctEmployeeDental: "pct_employee_dental",
  pctEmployeeVision: "pct_employee_vision",
  pctDependentHealth: "pct_dependent_health",
  pctDependentDental: "pct_dependent_dental",
  pctDependentVision: "pct_dependent_vision",
};

/**
 * Upsert the employer's single contribution rule (same single-rule read model as
 * getContributionRule: first row by name). Only provided fields change; a missing
 * rule row is created with 0% defaults per the table's column defaults.
 */
export async function upsertContributionRule(db: Pool, patch: ContributionRulePatch): Promise<string> {
  const [rows] = await db.query(`SELECT BIN_TO_UUID(id) AS id FROM contribution_rule ORDER BY name LIMIT 1`);
  const existing = (rows as { id: string }[])[0]?.id ?? null;

  const sets: string[] = [];
  const params: Record<string, unknown> = {};
  if (patch.name !== undefined) { sets.push("name = :name"); params.name = patch.name; }
  if (patch.displayName !== undefined) { sets.push("display_name = :displayName"); params.displayName = patch.displayName; }
  for (const [field, column] of Object.entries(PCT_COLUMNS)) {
    const v = (patch as Record<string, number | undefined>)[field];
    if (v !== undefined) { sets.push(`${column} = :${field}`); params[field] = v; }
  }
  if (patch.fixedBasicLife !== undefined) { sets.push("fixed_basic_life = :fixedBasicLife"); params.fixedBasicLife = patch.fixedBasicLife; }

  if (existing) {
    if (sets.length > 0) {
      await db.query(`UPDATE contribution_rule SET ${sets.join(", ")} WHERE id = UUID_TO_BIN(:id)`, {
        ...params,
        id: existing,
      });
    }
    return existing;
  }
  const id = randomUUID();
  await db.query(
    `INSERT INTO contribution_rule (id, name, display_name,
        pct_employee_health, pct_employee_dental, pct_employee_vision,
        pct_dependent_health, pct_dependent_dental, pct_dependent_vision, fixed_basic_life)
     VALUES (UUID_TO_BIN(:id), :name, :displayName,
        :pctEmployeeHealth, :pctEmployeeDental, :pctEmployeeVision,
        :pctDependentHealth, :pctDependentDental, :pctDependentVision, :fixedBasicLife)`,
    {
      id,
      name: patch.name ?? "Standard",
      displayName: patch.displayName ?? null,
      pctEmployeeHealth: patch.pctEmployeeHealth ?? 0,
      pctEmployeeDental: patch.pctEmployeeDental ?? 0,
      pctEmployeeVision: patch.pctEmployeeVision ?? 0,
      pctDependentHealth: patch.pctDependentHealth ?? 0,
      pctDependentDental: patch.pctDependentDental ?? 0,
      pctDependentVision: patch.pctDependentVision ?? 0,
      fixedBasicLife: patch.fixedBasicLife ?? null,
    }
  );
  return id;
}
