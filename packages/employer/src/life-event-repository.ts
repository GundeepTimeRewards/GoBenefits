/**
 * Life-events repository (Phase E-4). SQL against a ROUTED customer-DB pool only —
 * the service authorizes + routes via getCustomerDb. Two surfaces share it: the
 * HR/admin queue and the employee's own-records reads/writes.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";

export type LifeEventCaseRow = {
  id: string;
  employeeId: string;
  employee: string;
  eventType: string;
  typeKey: string;
  status: string; // DB enum
  documentationRequired: boolean;
  docsMissing: number;
  docsUploaded: number;
  docsVerified: number;
  electionWindow: string | null;
  eventDate: string | null;
  submitted: string | null;
  approvalNotes: string | null;
};

const CASE_SELECT = `
  SELECT BIN_TO_UUID(le.id) AS id,
         BIN_TO_UUID(le.employee_id) AS employeeId,
         CONCAT(e.first_name, ' ', e.last_name) AS employee,
         lt.label AS eventType,
         lt.key_name AS typeKey,
         le.status AS status,
         lt.documentation_required AS documentationRequired,
         SUM(led.status = 'missing') AS docsMissing,
         SUM(led.status = 'uploaded') AS docsUploaded,
         SUM(led.status = 'verified') AS docsVerified,
         le.election_window AS electionWindow,
         DATE_FORMAT(le.event_date, '%Y-%m-%d') AS eventDate,
         DATE_FORMAT(le.submitted_date, '%Y-%m-%d') AS submitted,
         (SELECT la.notes FROM life_event_approval la
           WHERE la.life_event_id = le.id ORDER BY la.decided_at DESC LIMIT 1) AS approvalNotes
  FROM life_event le
  JOIN employee e ON e.id = le.employee_id
  JOIN life_event_type lt ON lt.id = le.life_event_type_id
  LEFT JOIN life_event_document led ON led.life_event_id = le.id`;

function toCase(r: any): LifeEventCaseRow {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employee: r.employee,
    eventType: r.eventType,
    typeKey: r.typeKey,
    status: r.status,
    documentationRequired: Boolean(Number(r.documentationRequired)),
    docsMissing: Number(r.docsMissing ?? 0),
    docsUploaded: Number(r.docsUploaded ?? 0),
    docsVerified: Number(r.docsVerified ?? 0),
    electionWindow: r.electionWindow ?? null,
    eventDate: r.eventDate ?? null,
    submitted: r.submitted ?? null,
    approvalNotes: r.approvalNotes ?? null,
  };
}

/** All non-draft cases, HR work first (drafts are the employee's business). */
export async function listCases(db: Pool): Promise<LifeEventCaseRow[]> {
  const [rows] = await db.query(
    `${CASE_SELECT}
     WHERE le.status <> 'draft'
     GROUP BY le.id
     ORDER BY FIELD(le.status, 'submitted','under_review','needs_documents','approved','election_window_open','payroll_carrier_pending','completed','rejected'),
              le.submitted_date DESC`
  );
  return (rows as any[]).map(toCase);
}

export async function getCase(db: Pool, caseId: string): Promise<LifeEventCaseRow | null> {
  const [rows] = await db.query(`${CASE_SELECT} WHERE le.id = UUID_TO_BIN(:caseId) GROUP BY le.id LIMIT 1`, {
    caseId,
  });
  const r = (rows as any[])[0];
  return r ? toCase(r) : null;
}

/** The caller-as-employee's cases (own records), including drafts. */
export async function listCasesForEmployee(db: Pool, employeeId: string): Promise<LifeEventCaseRow[]> {
  const [rows] = await db.query(
    `${CASE_SELECT} WHERE le.employee_id = UUID_TO_BIN(:employeeId) GROUP BY le.id ORDER BY le.submitted_date DESC`,
    { employeeId }
  );
  return (rows as any[]).map(toCase);
}

/**
 * Own-records identity link: resolve the calling user's employee row by their
 * account email (user_account.email = employee_contact.email). A future
 * hardening can replace this with an explicit link table; the email join matches
 * the single-identity-directory decision (Cognito for everyone).
 */
export async function findEmployeeByEmail(db: Pool, email: string): Promise<string | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(employee_id) AS id FROM employee_contact WHERE email = :email LIMIT 1`,
    { email }
  );
  return (rows as { id: string }[])[0]?.id ?? null;
}

export async function findEventType(db: Pool, keyName: string): Promise<{ id: string; documentationRequired: boolean } | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(id) AS id, documentation_required AS docs FROM life_event_type WHERE key_name = :keyName LIMIT 1`,
    { keyName }
  );
  const r = (rows as any[])[0];
  return r ? { id: r.id, documentationRequired: Boolean(Number(r.docs)) } : null;
}

/** Create a submitted life event (+ one required doc slot when the type needs docs). */
export async function insertLifeEvent(
  db: Pool,
  args: { employeeId: string; typeId: string; eventDate: string; notes: string | null; documentationRequired: boolean }
): Promise<string> {
  const id = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO life_event (id, employee_id, life_event_type_id, event_date, submitted_date, status, impact)
       VALUES (UUID_TO_BIN(:id), UUID_TO_BIN(:employeeId), UUID_TO_BIN(:typeId), :eventDate, CURDATE(), 'submitted', :notes)`,
      { id, ...args, notes: args.notes }
    );
    if (args.documentationRequired) {
      await conn.query(
        `INSERT INTO life_event_document (life_event_id, required, status) VALUES (UUID_TO_BIN(:id), 1, 'missing')`,
        { id }
      );
    }
    await conn.commit();
    return id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Status transition + approval-trail row (approve/deny record who and why). */
export async function decideCase(
  db: Pool,
  args: { caseId: string; status: string; decision: "approved" | "rejected" | null; decidedBy: string; notes: string | null }
): Promise<void> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`UPDATE life_event SET status = :status WHERE id = UUID_TO_BIN(:caseId)`, args);
    if (args.decision) {
      await conn.query(
        `INSERT INTO life_event_approval (life_event_id, decision, decided_by, decided_at, notes)
         VALUES (UUID_TO_BIN(:caseId), :decision, UUID_TO_BIN(:decidedBy), NOW(3), :notes)`,
        args
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

export async function setStatus(db: Pool, caseId: string, status: string, electionWindow?: string | null): Promise<void> {
  await db.query(
    `UPDATE life_event SET status = :status, election_window = COALESCE(:electionWindow, election_window)
      WHERE id = UUID_TO_BIN(:caseId)`,
    { caseId, status, electionWindow: electionWindow ?? null }
  );
}
