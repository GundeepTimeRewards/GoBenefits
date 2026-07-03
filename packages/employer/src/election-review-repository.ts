/**
 * Elections Review repository (Phase E-1). SQL against a ROUTED customer-DB pool
 * only — the service authorizes + routes via getCustomerDb.
 */
import type { Pool } from "mysql2/promise";
import type { ReviewRepoRow } from "./election-review.js";

const REVIEW_SELECT = `
  SELECT BIN_TO_UUID(el.id) AS id,
         CONCAT(e.first_name, ' ', e.last_name) AS employeeName,
         ev.type AS eventType,
         bp.plan_name AS planName,
         el.coverage_tier AS tier,
         (SELECT COUNT(*) FROM dependent_election de WHERE de.election_id = el.id) AS dependents,
         el.employee_cost AS eeCost,
         DATE_FORMAT(el.submitted_at, '%Y-%m-%d') AS submittedAt,
         el.status AS status,
         el.review_flag AS reviewFlag,
         el.review_note AS reviewNote
  FROM employee_election el
  JOIN employee e         ON e.id = el.employee_id
  JOIN benefit_plan bp    ON bp.id = el.benefit_plan_id
  JOIN enrollment_event ev ON ev.id = el.enrollment_event_id`;

function toRow(r: any): ReviewRepoRow {
  return {
    id: r.id,
    employeeName: r.employeeName,
    eventType: r.eventType,
    planName: r.planName,
    tier: r.tier,
    dependents: Number(r.dependents),
    eeCost: r.eeCost == null ? null : Number(r.eeCost),
    submittedAt: r.submittedAt ?? null,
    status: r.status,
    reviewFlag: r.reviewFlag,
    reviewNote: r.reviewNote ?? null,
  };
}

/**
 * Review rows for a plan year: everything an HR admin acts on or recently acted
 * on — submitted + approved elections, and sent-back ones (in_progress WITH a
 * review note; untouched in-progress elections are the employee's business).
 */
export async function listReviewRows(db: Pool, planYearId: string): Promise<ReviewRepoRow[]> {
  const [rows] = await db.query(
    `${REVIEW_SELECT}
     WHERE ev.plan_year_id = UUID_TO_BIN(:planYearId)
       AND (el.status IN ('submitted','approved') OR (el.status = 'in_progress' AND el.review_note IS NOT NULL))
     ORDER BY (el.status = 'submitted') DESC, el.submitted_at, employeeName`,
    { planYearId }
  );
  return (rows as any[]).map(toRow);
}

/** One review row by election id (null when it isn't in this plan year). */
export async function getReviewRow(db: Pool, planYearId: string, electionId: string): Promise<ReviewRepoRow | null> {
  const [rows] = await db.query(
    `${REVIEW_SELECT}
     WHERE el.id = UUID_TO_BIN(:electionId) AND ev.plan_year_id = UUID_TO_BIN(:planYearId) LIMIT 1`,
    { electionId, planYearId }
  );
  const r = (rows as any[])[0];
  return r ? toRow(r) : null;
}

/** One election's review fields by id, employer-scope already routed (any plan year). */
export async function getElectionMeta(
  db: Pool,
  electionId: string
): Promise<{ id: string; status: string; reviewFlag: string; planYearId: string } | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(el.id) AS id, el.status AS status, el.review_flag AS reviewFlag,
            BIN_TO_UUID(ev.plan_year_id) AS planYearId
     FROM employee_election el JOIN enrollment_event ev ON ev.id = el.enrollment_event_id
     WHERE el.id = UUID_TO_BIN(:electionId) LIMIT 1`,
    { electionId }
  );
  return ((rows as any[])[0] as { id: string; status: string; reviewFlag: string; planYearId: string }) ?? null;
}

export async function approveElection(db: Pool, electionId: string): Promise<void> {
  await db.query(
    `UPDATE employee_election SET status = 'approved', review_note = NULL WHERE id = UUID_TO_BIN(:electionId)`,
    { electionId }
  );
}

/** Send back: employee edits + resubmits, so any open request is cleared with it. */
export async function sendBackElection(db: Pool, electionId: string, note: string): Promise<void> {
  await db.query(
    `UPDATE employee_election
        SET status = 'in_progress', review_flag = 'none', review_note = :note, submitted_at = NULL
      WHERE id = UUID_TO_BIN(:electionId)`,
    { electionId, note }
  );
}

export async function setReviewFlag(db: Pool, electionId: string, flag: "eoi_requested" | "docs_requested"): Promise<void> {
  await db.query(`UPDATE employee_election SET review_flag = :flag WHERE id = UUID_TO_BIN(:electionId)`, {
    electionId,
    flag,
  });
}

/**
 * Approve every clean submitted election in the plan year: no open review flag
 * and a computed employee cost (conservative — the bulk path never approves a
 * row a human would have hesitated on). Returns the number approved.
 */
export async function approveAllReady(db: Pool, planYearId: string): Promise<number> {
  const [result] = await db.query(
    `UPDATE employee_election el
       JOIN enrollment_event ev ON ev.id = el.enrollment_event_id
        SET el.status = 'approved', el.review_note = NULL
      WHERE ev.plan_year_id = UUID_TO_BIN(:planYearId)
        AND el.status = 'submitted'
        AND el.review_flag = 'none'
        AND el.employee_cost IS NOT NULL`,
    { planYearId }
  );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}

/** Waivers recorded for the plan year's events (counts.waiver). */
export async function waiverCount(db: Pool, planYearId: string): Promise<number> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM waiver w
      JOIN enrollment_event ev ON ev.id = w.enrollment_event_id
     WHERE ev.plan_year_id = UUID_TO_BIN(:planYearId)`,
    { planYearId }
  );
  return Number((rows as any[])[0].n);
}
