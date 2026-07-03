/**
 * Plan-year + employer-tenant repository. SQL against a ROUTED customer-DB pool
 * only — it never resolves tenancy itself (the service does that via getCustomerDb).
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { Employer, PlanYear } from "./types.js";

const PLAN_YEAR_SELECT = `
  SELECT BIN_TO_UUID(py.id)  AS id,
         py.label            AS label,
         py.year             AS year,
         py.status           AS status,
         py.period_start     AS periodStart,
         py.period_end       AS periodEnd,
         (SELECT COUNT(*) FROM benefit_plan bp WHERE bp.plan_year_id = py.id) AS planCount
  FROM plan_year py`;

function toPlanYear(row: any): PlanYear {
  return {
    id: row.id,
    label: row.label,
    year: Number(row.year),
    status: row.status,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    oeStart: null,
    oeEnd: null,
    oeWindowLabel: null,
    planCount: row.planCount == null ? null : Number(row.planCount),
    completionPct: null,
    eligibleCount: null,
    enrollmentPct: null,
    launchBlockers: null,
    oeDaysLeft: null,
    needsActionCount: null,
    plans: [],
  };
}

/** All plan years for this employer, newest first. */
export async function listPlanYears(db: Pool): Promise<PlanYear[]> {
  const [rows] = await db.query(`${PLAN_YEAR_SELECT} ORDER BY py.year DESC`);
  return (rows as any[]).map(toPlanYear);
}

/**
 * The UI-default plan year: prefer the `active` one; otherwise the most recent by
 * year. Returns null if the employer has no plan years yet.
 */
export async function currentPlanYear(db: Pool): Promise<PlanYear | null> {
  const [rows] = await db.query(
    `${PLAN_YEAR_SELECT}
     ORDER BY (py.status = 'active') DESC, py.year DESC
     LIMIT 1`
  );
  const row = (rows as any[])[0];
  return row ? toPlanYear(row) : null;
}

/** One plan year by id (same read model as the list). Null if not found. */
export async function getPlanYearById(db: Pool, id: string): Promise<PlanYear | null> {
  const [rows] = await db.query(`${PLAN_YEAR_SELECT} WHERE py.id = UUID_TO_BIN(:id) LIMIT 1`, { id });
  const row = (rows as any[])[0];
  return row ? toPlanYear(row) : null;
}

/** Id of the plan year with this calendar year, or null (uq_plan_year backs this). */
export async function findPlanYearIdByYear(db: Pool, year: number): Promise<string | null> {
  const [rows] = await db.query(`SELECT BIN_TO_UUID(id) AS id FROM plan_year WHERE year = :year LIMIT 1`, { year });
  return (rows as { id: string }[])[0]?.id ?? null;
}

/** Insert an empty plan year in `setup`. Returns the new id. */
export async function insertPlanYear(
  db: Pool,
  args: { label: string; year: number; periodStart: string; periodEnd: string }
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO plan_year (id, label, year, period_start, period_end, status)
     VALUES (UUID_TO_BIN(:id), :label, :year, :periodStart, :periodEnd, 'setup')`,
    { id, ...args }
  );
  return id;
}

/**
 * Make this plan year the single `active` one: any OTHER active year is archived in
 * the same transaction (the product invariant is at most one active year — the UI
 * default and enrollment flows key off it).
 */
export async function setPlanYearActive(db: Pool, id: string): Promise<void> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE plan_year SET status = 'archived' WHERE status = 'active' AND id <> UUID_TO_BIN(:id)`,
      { id }
    );
    await conn.query(`UPDATE plan_year SET status = 'active' WHERE id = UUID_TO_BIN(:id)`, { id });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Archive a plan year (read-only in the UI from then on). */
export async function setPlanYearArchived(db: Pool, id: string): Promise<void> {
  await db.query(`UPDATE plan_year SET status = 'archived' WHERE id = UUID_TO_BIN(:id)`, { id });
}

/**
 * Renewal copy-forward: one transaction that creates the target plan year (dates =
 * source dates shifted by `yearDelta`, status `setup`) and deep-copies the source
 * year's benefit plans, their options, and their rates.
 *
 * Copy semantics (renewal, not clone):
 * - benefit_plan: carrier/name/network/comparison attrs copied VERBATIM, but
 *   `status='draft'` + `setup_status='in_progress'` + `setup_issue_count=0` — a
 *   renewed year must be re-confirmed (rates re-quoted, plans re-launched) before it
 *   can go live, so copied plans surface in Plan Readiness as needing review.
 * - legacy_id is NOT copied — legacy traceability belongs to the original row only.
 * - plan_option: copied with the eligibility_class link preserved (classes are
 *   employer-level, not year-scoped).
 * - plan_rate: values copied verbatim as the renewal starting point; effective_date
 *   is shifted by `yearDelta` via DATE_ADD (clamps Feb-29 correctly). New rate rows
 *   take DB-default UUIDs (nothing references them during the copy).
 *
 * INSERT…SELECT is used throughout so column values never round-trip through JS.
 */
export async function copyPlanYearDeep(
  db: Pool,
  args: { fromId: string; toYear: number; label: string; yearDelta: number }
): Promise<string> {
  const newPlanYearId = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO plan_year (id, label, year, period_start, period_end, status)
       SELECT UUID_TO_BIN(:newId), :label, :toYear,
              DATE_ADD(period_start, INTERVAL :delta YEAR),
              DATE_ADD(period_end,   INTERVAL :delta YEAR), 'setup'
       FROM plan_year WHERE id = UUID_TO_BIN(:fromId)`,
      { newId: newPlanYearId, label: args.label, toYear: args.toYear, delta: args.yearDelta, fromId: args.fromId }
    );

    const [planRows] = await conn.query(
      `SELECT BIN_TO_UUID(id) AS id FROM benefit_plan WHERE plan_year_id = UUID_TO_BIN(:fromId)`,
      { fromId: args.fromId }
    );

    for (const plan of planRows as { id: string }[]) {
      const newPlanId = randomUUID();
      await conn.query(
        `INSERT INTO benefit_plan
           (id, plan_year_id, benefit_type_key, carrier_name, plan_name, plan_code, subtype,
            network, hsa_eligible, setup_status, setup_issue_count,
            deductible_single, deductible_family, oop_single, oop_family,
            pcp_copay, specialist_copay, attributes_json, status, legacy_id)
         SELECT UUID_TO_BIN(:newPlanId), UUID_TO_BIN(:newPlanYearId), benefit_type_key, carrier_name,
                plan_name, plan_code, subtype, network, hsa_eligible, 'in_progress', 0,
                deductible_single, deductible_family, oop_single, oop_family,
                pcp_copay, specialist_copay, attributes_json, 'draft', NULL
         FROM benefit_plan WHERE id = UUID_TO_BIN(:oldPlanId)`,
        { newPlanId, newPlanYearId, oldPlanId: plan.id }
      );

      // Options need KNOWN new ids so their rates can be remapped below.
      const [optionRows] = await conn.query(
        `SELECT BIN_TO_UUID(id) AS id FROM plan_option WHERE benefit_plan_id = UUID_TO_BIN(:oldPlanId)`,
        { oldPlanId: plan.id }
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

      // Rates: one set-based copy per option (remapped) + one for option-less rows.
      const RATE_COPY = `
        INSERT INTO plan_rate (benefit_plan_id, plan_option_id, age,
                               rate_ee, rate_ee_spouse, rate_ee_child, rate_family, effective_date)
        SELECT UUID_TO_BIN(:newPlanId), %OPTION%, age,
               rate_ee, rate_ee_spouse, rate_ee_child, rate_family,
               DATE_ADD(effective_date, INTERVAL :delta YEAR)
        FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN(:oldPlanId) AND %WHERE%`;
      for (const [oldOptionId, newOptionId] of optionIdMap) {
        await conn.query(
          RATE_COPY.replace("%OPTION%", "UUID_TO_BIN(:newOptionId)").replace(
            "%WHERE%",
            "plan_option_id = UUID_TO_BIN(:oldOptionId)"
          ),
          { newPlanId, newOptionId, oldPlanId: plan.id, oldOptionId, delta: args.yearDelta }
        );
      }
      await conn.query(
        RATE_COPY.replace("%OPTION%", "NULL").replace("%WHERE%", "plan_option_id IS NULL"),
        { newPlanId, oldPlanId: plan.id, delta: args.yearDelta }
      );
    }

    await conn.commit();
    return newPlanYearId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Cheap single-tenant employer stats for the `employer` detail read model. One
 * routed read against the employer's OWN DB — NOT a cross-tenant fan-out.
 */
export async function employerTenantStats(
  db: Pool
): Promise<Pick<Employer, "employeeCount" | "activeCount" | "locations" | "ein">> {
  const [rows] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM employee) AS employeeCount,
      (SELECT COUNT(*) FROM employee_employment WHERE status = 'active') AS activeCount,
      (SELECT COUNT(*) FROM employer_location) AS locations,
      (SELECT ein FROM employer_profile LIMIT 1) AS ein`);
  const r = (rows as any[])[0];
  return {
    employeeCount: Number(r.employeeCount),
    activeCount: Number(r.activeCount),
    locations: Number(r.locations),
    ein: r.ein ?? null,
  };
}
