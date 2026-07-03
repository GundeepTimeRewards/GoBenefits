/**
 * Deduction-generation repository (Phase E-2). SQL against a ROUTED customer-DB
 * pool only — the service authorizes + routes via getCustomerDb. The math itself
 * lives in @goben/rate-engine; this file is data in / rows out.
 */
import type { Pool } from "mysql2/promise";
import type { RateBand } from "@goben/rate-engine";

export type GenerationElection = {
  electionId: string;
  employeeId: string;
  planId: string;
  benefitTypeKey: string;
  tier: string; // ee | ee_spouse | ee_child | family | waived
  effectiveDate: string | null;
  dateOfBirth: string | null;
  /** employee_payroll.pay_frequency ('12'|'24'|'26'|'52') or null when unset. */
  payFrequency: string | null;
};

/** Approved, non-waived elections for the plan year — the deduction-generation set. */
export async function listApprovedElections(db: Pool, planYearId: string): Promise<GenerationElection[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(el.id) AS electionId,
            BIN_TO_UUID(el.employee_id) AS employeeId,
            BIN_TO_UUID(el.benefit_plan_id) AS planId,
            bp.benefit_type_key AS benefitTypeKey,
            el.coverage_tier AS tier,
            DATE_FORMAT(el.effective_date, '%Y-%m-%d') AS effectiveDate,
            DATE_FORMAT(e.date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            ep.pay_frequency AS payFrequency
     FROM employee_election el
     JOIN benefit_plan bp ON bp.id = el.benefit_plan_id
     JOIN enrollment_event ev ON ev.id = el.enrollment_event_id
     JOIN employee e ON e.id = el.employee_id
     LEFT JOIN employee_payroll ep ON ep.employee_id = el.employee_id
     WHERE ev.plan_year_id = UUID_TO_BIN(:planYearId)
       AND el.status = 'approved'
       AND el.coverage_tier <> 'waived'`,
    { planYearId }
  );
  return rows as GenerationElection[];
}

/**
 * The rate band for a plan: an exact age-band match when `age` is known, else the
 * composite (age IS NULL) band; within a group the most recent effective_date wins.
 * Null when the plan has no usable rate.
 */
export async function getRateBand(db: Pool, planId: string, age: number | null): Promise<RateBand | null> {
  const [rows] = await db.query(
    `SELECT rate_ee AS rateEe, rate_ee_spouse AS rateEeSpouse,
            rate_ee_child AS rateEeChild, rate_family AS rateFamily
     FROM plan_rate
     WHERE benefit_plan_id = UUID_TO_BIN(:planId)
       AND (age = :age OR age IS NULL)
     ORDER BY (age = :age) DESC, effective_date DESC
     LIMIT 1`,
    { planId, age }
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    rateEe: Number(r.rateEe),
    rateEeSpouse: r.rateEeSpouse == null ? null : Number(r.rateEeSpouse),
    rateEeChild: r.rateEeChild == null ? null : Number(r.rateEeChild),
    rateFamily: r.rateFamily == null ? null : Number(r.rateFamily),
  };
}

/** All six contribution percentages (the catalog read only needs the employee side). */
export async function getFullContributionRule(db: Pool): Promise<{
  pctEmployeeHealth: number; pctEmployeeDental: number; pctEmployeeVision: number;
  pctDependentHealth: number; pctDependentDental: number; pctDependentVision: number;
} | null> {
  const [rows] = await db.query(
    `SELECT pct_employee_health AS pctEmployeeHealth, pct_employee_dental AS pctEmployeeDental,
            pct_employee_vision AS pctEmployeeVision, pct_dependent_health AS pctDependentHealth,
            pct_dependent_dental AS pctDependentDental, pct_dependent_vision AS pctDependentVision
     FROM contribution_rule ORDER BY name LIMIT 1`
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    pctEmployeeHealth: Number(r.pctEmployeeHealth),
    pctEmployeeDental: Number(r.pctEmployeeDental),
    pctEmployeeVision: Number(r.pctEmployeeVision),
    pctDependentHealth: Number(r.pctDependentHealth),
    pctDependentDental: Number(r.pctDependentDental),
    pctDependentVision: Number(r.pctDependentVision),
  };
}

/**
 * Persist one election's generated deduction, idempotently: prior rate_engine rows
 * for the election are replaced, and the election's cost columns are updated in the
 * same transaction (clearing the review queue's "missing cost" issue). Amounts are
 * PER-PAYCHECK — that is what payroll consumes; the monthly figures live on the
 * election (premium_total / employer_contribution / employee_cost are per-pay too,
 * matching what the enrollment UI shows next to each pay period).
 */
export async function replaceEngineDeduction(
  db: Pool,
  args: {
    electionId: string;
    employeeId: string;
    perPayEe: number;
    perPayEr: number;
    perPayTotal: number;
    effectiveDate: string | null;
  }
): Promise<void> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `DELETE FROM payroll_deduction WHERE election_id = UUID_TO_BIN(:electionId) AND source = 'rate_engine'`,
      { electionId: args.electionId }
    );
    await conn.query(
      `INSERT INTO payroll_deduction (employee_id, election_id, pre_post_tax, cost_ee, cost_er, cost_total, effective_date, source)
       VALUES (UUID_TO_BIN(:employeeId), UUID_TO_BIN(:electionId), 'pre', :perPayEe, :perPayEr, :perPayTotal, :effectiveDate, 'rate_engine')`,
      args
    );
    await conn.query(
      `UPDATE employee_election
          SET employee_cost = :perPayEe, employer_contribution = :perPayEr, premium_total = :perPayTotal
        WHERE id = UUID_TO_BIN(:electionId)`,
      args
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
