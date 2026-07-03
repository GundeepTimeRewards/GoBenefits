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
 * Persist one election's generated deduction, idempotently: prior UNPROCESSED
 * rate_engine rows for the election are replaced, while already-EXPORTED rows are
 * superseded (end_date = today) rather than deleted — export batch lines reference
 * them by FK, and the superseded amount is what "changed since last export" diffs
 * against. The election's cost columns update in the same transaction (clearing
 * the review queue's "missing cost" issue). Amounts are PER-PAYCHECK — that is
 * what payroll consumes.
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
      `DELETE FROM payroll_deduction
        WHERE election_id = UUID_TO_BIN(:electionId) AND source = 'rate_engine' AND processed = 0`,
      { electionId: args.electionId }
    );
    await conn.query(
      `UPDATE payroll_deduction SET end_date = CURDATE()
        WHERE election_id = UUID_TO_BIN(:electionId) AND source = 'rate_engine' AND processed = 1 AND end_date IS NULL`,
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

// --- Deductions workspace reads + export/reconcile writes (Phase E-2b) -----------

import type { DeductionRepoRow } from "./deduction-workspace.js";

/**
 * Current deduction set for the plan year's elections: unprocessed rows plus
 * still-current exported rows (end_date IS NULL). priorEe joins the most recent
 * SUPERSEDED exported row for the same election — the "since last export" diff.
 */
export async function listWorkspaceDeductions(db: Pool, planYearId: string): Promise<DeductionRepoRow[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(pd.id) AS id,
            BIN_TO_UUID(pd.election_id) AS electionId,
            CONCAT(e.first_name, ' ', e.last_name) AS employee,
            bp.plan_name AS plan,
            el.coverage_tier AS tier,
            DATE_FORMAT(pd.effective_date, '%Y-%m-%d') AS effective,
            dc.payroll_code AS code,
            pd.cost_ee AS ee, pd.cost_er AS er, pd.processed AS processed,
            (SELECT prior.cost_ee FROM payroll_deduction prior
              WHERE prior.election_id = pd.election_id AND prior.source = 'rate_engine'
                AND prior.processed = 1 AND prior.end_date IS NOT NULL
              ORDER BY prior.end_date DESC LIMIT 1) AS priorEe
     FROM payroll_deduction pd
     JOIN employee e ON e.id = pd.employee_id
     JOIN employee_election el ON el.id = pd.election_id
     JOIN benefit_plan bp ON bp.id = el.benefit_plan_id
     JOIN enrollment_event ev ON ev.id = el.enrollment_event_id
     LEFT JOIN deduction_code dc ON dc.id = pd.deduction_code_id
     WHERE ev.plan_year_id = UUID_TO_BIN(:planYearId)
       AND pd.source = 'rate_engine' AND pd.end_date IS NULL
     ORDER BY employee, plan`,
    { planYearId }
  );
  return (rows as any[]).map((r) => ({
    id: r.id,
    electionId: r.electionId,
    employee: r.employee,
    plan: r.plan,
    tier: r.tier,
    effective: r.effective ?? null,
    code: r.code ?? null,
    ee: Number(r.ee),
    er: Number(r.er),
    processed: Boolean(Number(r.processed)),
    priorEe: r.priorEe == null ? null : Number(r.priorEe),
  }));
}

/** Assign a payroll code to a deduction: reuse a code row by (plan, code) or create one. */
export async function assignDeductionCode(db: Pool, deductionId: string, code: string): Promise<void> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [planRows] = await conn.query(
      `SELECT BIN_TO_UUID(el.benefit_plan_id) AS planId, bp.benefit_type_key AS btk
       FROM payroll_deduction pd
       JOIN employee_election el ON el.id = pd.election_id
       JOIN benefit_plan bp ON bp.id = el.benefit_plan_id
       WHERE pd.id = UUID_TO_BIN(:deductionId) LIMIT 1`,
      { deductionId }
    );
    const plan = (planRows as any[])[0];
    if (!plan) throw new Error("deduction not found");
    const [existing] = await conn.query(
      `SELECT BIN_TO_UUID(id) AS id FROM deduction_code
        WHERE benefit_plan_id = UUID_TO_BIN(:planId) AND payroll_code = :code LIMIT 1`,
      { planId: plan.planId, code }
    );
    let codeId = (existing as { id: string }[])[0]?.id ?? null;
    if (!codeId) {
      const { randomUUID } = await import("node:crypto");
      codeId = randomUUID();
      await conn.query(
        `INSERT INTO deduction_code (id, benefit_type_key, benefit_plan_id, payroll_code, pre_post_tax)
         VALUES (UUID_TO_BIN(:codeId), :btk, UUID_TO_BIN(:planId), :code, 'pre')`,
        { codeId, btk: plan.btk, planId: plan.planId, code }
      );
    }
    await conn.query(
      `UPDATE payroll_deduction SET deduction_code_id = UUID_TO_BIN(:codeId) WHERE id = UUID_TO_BIN(:deductionId)`,
      { codeId, deductionId }
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** One workspace row by deduction id (for the mapDeductionCode return). */
export async function getWorkspaceDeduction(db: Pool, planYearId: string, deductionId: string): Promise<DeductionRepoRow | null> {
  const all = await listWorkspaceDeductions(db, planYearId);
  return all.find((r) => r.id === deductionId) ?? null;
}

/**
 * Export every READY (code-assigned, unprocessed) deduction into a new batch:
 * one transaction creating the batch + lines (change_type from the same
 * since-last-export diff the workspace shows), then marking the deductions
 * processed. Returns the batch id and line count (0 lines still returns a batch —
 * an empty export is a no-op the caller reports, not an error).
 */
export async function exportReadyDeductions(
  db: Pool,
  planYearId: string,
  destination: string
): Promise<{ batchId: string; lineCount: number }> {
  const { randomUUID } = await import("node:crypto");
  const batchId = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO payroll_export_batch (id, plan_year_id, status, generated_at, destination, line_count)
       VALUES (UUID_TO_BIN(:batchId), UUID_TO_BIN(:planYearId), 'generated', NOW(3), :destination, 0)`,
      { batchId, planYearId, destination }
    );
    await conn.query(
      `INSERT INTO payroll_export_line (payroll_export_batch_id, employee_id, payroll_deduction_id, change_type, amount, status)
       SELECT UUID_TO_BIN(:batchId), pd.employee_id, pd.id,
              CASE
                WHEN prior.cost_ee IS NULL THEN 'add'
                WHEN prior.cost_ee <> pd.cost_ee THEN 'change'
                ELSE 'none'
              END,
              pd.cost_ee, 'ok'
       FROM payroll_deduction pd
       JOIN employee_election el ON el.id = pd.election_id
       JOIN enrollment_event ev ON ev.id = el.enrollment_event_id
       LEFT JOIN payroll_deduction prior
         ON prior.election_id = pd.election_id AND prior.source = 'rate_engine'
        AND prior.processed = 1 AND prior.end_date IS NOT NULL
        AND prior.end_date = (SELECT MAX(p2.end_date) FROM payroll_deduction p2
                               WHERE p2.election_id = pd.election_id AND p2.source = 'rate_engine'
                                 AND p2.processed = 1 AND p2.end_date IS NOT NULL)
       WHERE ev.plan_year_id = UUID_TO_BIN(:planYearId)
         AND pd.source = 'rate_engine' AND pd.processed = 0 AND pd.end_date IS NULL
         AND pd.deduction_code_id IS NOT NULL`,
      { batchId, planYearId }
    );
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS n FROM payroll_export_line WHERE payroll_export_batch_id = UUID_TO_BIN(:batchId)`,
      { batchId }
    );
    const lineCount = Number((countRows as any[])[0].n);
    if (lineCount === 0) {
      // Nothing was ready: don't leave an empty batch record behind — the no-op is
      // reported by the caller, not persisted as history.
      await conn.rollback();
      return { batchId: "", lineCount: 0 };
    }
    await conn.query(`UPDATE payroll_export_batch SET line_count = :lineCount WHERE id = UUID_TO_BIN(:batchId)`, {
      lineCount,
      batchId,
    });
    await conn.query(
      `UPDATE payroll_deduction pd
         JOIN payroll_export_line pel ON pel.payroll_deduction_id = pd.id
          SET pd.processed = 1
        WHERE pel.payroll_export_batch_id = UUID_TO_BIN(:batchId)`,
      { batchId }
    );
    await conn.commit();
    return { batchId, lineCount };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type ExportBatchRow = {
  id: string;
  batchDate: string | null;
  payPeriod: string;
  employees: number;
  totalEe: number;
  totalEr: number;
  status: string;
  file: string | null;
  errorCount: number;
};

/** Batches for the plan year, newest first, with line aggregates. */
export async function listExportBatches(db: Pool, planYearId: string): Promise<ExportBatchRow[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(b.id) AS id,
            DATE_FORMAT(b.generated_at, '%Y-%m-%d') AS batchDate,
            DATE_FORMAT(b.generated_at, '%b %Y') AS payPeriod,
            b.status AS status, b.destination AS file,
            COUNT(DISTINCT l.employee_id) AS employees,
            COALESCE(SUM(l.amount), 0) AS totalEe,
            COALESCE(SUM(pd.cost_er), 0) AS totalEr,
            SUM(l.status = 'error') AS errorCount
     FROM payroll_export_batch b
     LEFT JOIN payroll_export_line l ON l.payroll_export_batch_id = b.id
     LEFT JOIN payroll_deduction pd ON pd.id = l.payroll_deduction_id
     WHERE b.plan_year_id = UUID_TO_BIN(:planYearId)
     GROUP BY b.id
     ORDER BY b.generated_at DESC`,
    { planYearId }
  );
  return (rows as any[]).map((r) => ({
    id: r.id,
    batchDate: r.batchDate ?? null,
    payPeriod: r.payPeriod ?? "—",
    employees: Number(r.employees),
    totalEe: Number(r.totalEe),
    totalEr: Number(r.totalEr),
    status: r.status,
    file: r.file ?? null,
    errorCount: Number(r.errorCount ?? 0),
  }));
}

export async function getBatchMeta(db: Pool, batchId: string): Promise<{ id: string; status: string; planYearId: string | null } | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(id) AS id, status, BIN_TO_UUID(plan_year_id) AS planYearId
     FROM payroll_export_batch WHERE id = UUID_TO_BIN(:batchId) LIMIT 1`,
    { batchId }
  );
  return ((rows as any[])[0] as { id: string; status: string; planYearId: string | null }) ?? null;
}

/** Reconcile: generated/sent → approved (the local path has no transmitter; 'sent' is prod). */
export async function approveBatch(db: Pool, batchId: string): Promise<void> {
  await db.query(`UPDATE payroll_export_batch SET status = 'approved' WHERE id = UUID_TO_BIN(:batchId)`, { batchId });
}
