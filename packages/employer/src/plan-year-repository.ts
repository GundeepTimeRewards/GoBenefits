/**
 * Plan-year + employer-tenant repository. SQL against a ROUTED customer-DB pool
 * only — it never resolves tenancy itself (the service does that via getCustomerDb).
 */
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
