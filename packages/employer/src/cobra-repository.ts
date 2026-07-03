/**
 * COBRA repository (Phase F-1). SQL against a ROUTED customer-DB pool only — the
 * service authorizes + routes via getCustomerDb.
 *
 * Scope decision (2026-07-03): NO premium collection — a TPA administers payments.
 * cobra_payment stays unused; payment_status renders as TPA-administered.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";

export type CobraEventRow = {
  id: string;
  employeeId: string;
  person: string;
  eventType: string;
  eventDate: string;
  coverage: string | null;
  noticeDeadline: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  status: string; // cobra_event.cobra_status enum
  tpa: string | null;
  noticeStatus: string | null; // latest cobra_notice status
  beneficiaryCount: number;
};

const EVENT_SELECT = `
  SELECT BIN_TO_UUID(ce.id) AS id,
         BIN_TO_UUID(ce.employee_id) AS employeeId,
         CONCAT(e.first_name, ' ', e.last_name) AS person,
         ce.event_type AS eventType,
         DATE_FORMAT(ce.event_date, '%Y-%m-%d') AS eventDate,
         ce.coverage AS coverage,
         DATE_FORMAT(ce.notice_deadline, '%Y-%m-%d') AS noticeDeadline,
         DATE_FORMAT(ce.election_window_start, '%Y-%m-%d') AS windowStart,
         DATE_FORMAT(ce.election_window_end, '%Y-%m-%d') AS windowEnd,
         ce.cobra_status AS status,
         ce.tpa AS tpa,
         (SELECT cn.status FROM cobra_notice cn WHERE cn.cobra_event_id = ce.id
           ORDER BY cn.sent_at DESC LIMIT 1) AS noticeStatus,
         (SELECT COUNT(*) FROM cobra_qualified_beneficiary qb WHERE qb.cobra_event_id = ce.id) AS beneficiaryCount
  FROM cobra_event ce
  JOIN employee e ON e.id = ce.employee_id`;

function toRow(r: any): CobraEventRow {
  return {
    id: r.id,
    employeeId: r.employeeId,
    person: r.person,
    eventType: r.eventType,
    eventDate: r.eventDate,
    coverage: r.coverage ?? null,
    noticeDeadline: r.noticeDeadline ?? null,
    windowStart: r.windowStart ?? null,
    windowEnd: r.windowEnd ?? null,
    status: r.status,
    tpa: r.tpa ?? null,
    noticeStatus: r.noticeStatus ?? null,
    beneficiaryCount: Number(r.beneficiaryCount ?? 0),
  };
}

export async function listEvents(db: Pool): Promise<CobraEventRow[]> {
  const [rows] = await db.query(
    `${EVENT_SELECT}
     ORDER BY FIELD(ce.cobra_status, 'pending_review','notice_due','notice_overdue','notice_sent','election_window_open','elected','waived','election_expired','complete'),
              ce.event_date DESC`
  );
  return (rows as any[]).map(toRow);
}

export async function getEvent(db: Pool, eventId: string): Promise<CobraEventRow | null> {
  const [rows] = await db.query(`${EVENT_SELECT} WHERE ce.id = UUID_TO_BIN(:eventId) LIMIT 1`, { eventId });
  const r = (rows as any[])[0];
  return r ? toRow(r) : null;
}

export type BeneficiaryRow = { id: string; eventId: string; person: string; relationship: string };

export async function listBeneficiaries(db: Pool): Promise<BeneficiaryRow[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(qb.id) AS id, BIN_TO_UUID(qb.cobra_event_id) AS eventId,
            qb.person_name AS person, qb.relationship AS relationship
     FROM cobra_qualified_beneficiary qb ORDER BY person`
  );
  return rows as BeneficiaryRow[];
}

/**
 * Record a qualifying event in one transaction: the event row (notice deadline =
 * event date + 44 days — 30 days employer→administrator plus 14 administrator→QBs)
 * and the qualified beneficiaries: the employee plus every dependent on file.
 */
export async function insertEvent(
  db: Pool,
  args: { employeeId: string; eventType: string; eventDate: string; coverage: string | null }
): Promise<string> {
  const id = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO cobra_event (id, employee_id, event_type, event_date, coverage, notice_deadline, cobra_status, payment_status, tpa)
       VALUES (UUID_TO_BIN(:id), UUID_TO_BIN(:employeeId), :eventType, :eventDate, :coverage,
               DATE_ADD(:eventDate, INTERVAL 44 DAY), 'notice_due', 'tpa', 'TPA-administered')`,
      { id, ...args }
    );
    await conn.query(
      `INSERT INTO cobra_qualified_beneficiary (cobra_event_id, person_name, relationship)
       SELECT UUID_TO_BIN(:id), CONCAT(e.first_name, ' ', e.last_name), 'employee'
       FROM employee e WHERE e.id = UUID_TO_BIN(:employeeId)`,
      { id, employeeId: args.employeeId }
    );
    await conn.query(
      `INSERT INTO cobra_qualified_beneficiary (cobra_event_id, person_name, relationship, dependent_id)
       SELECT UUID_TO_BIN(:id), CONCAT(d.first_name, ' ', d.last_name),
              CASE WHEN d.relationship = 'spouse' THEN 'spouse'
                   WHEN d.relationship = 'child' THEN 'child' ELSE 'other' END,
              d.id
       FROM dependent d WHERE d.employee_id = UUID_TO_BIN(:employeeId)`,
      { id, employeeId: args.employeeId }
    );
    await conn.commit();
    return id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Send the election notice: cobra_notice row (sent) + the 60-day election window
 * opens on the event, in one transaction. documentId links the metadata-first
 * notice document created by the service.
 */
export async function sendElectionNotice(db: Pool, eventId: string, documentId: string | null): Promise<{ windowEnd: string }> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO cobra_notice (cobra_event_id, type, status, sent_at, deadline, document_id)
       VALUES (UUID_TO_BIN(:eventId), 'election', 'sent', NOW(3), DATE_ADD(CURDATE(), INTERVAL 60 DAY),
               ${documentId ? "UUID_TO_BIN(:documentId)" : "NULL"})`,
      { eventId, documentId }
    );
    await conn.query(
      `UPDATE cobra_event
          SET cobra_status = 'election_window_open',
              election_window_start = CURDATE(),
              election_window_end = DATE_ADD(CURDATE(), INTERVAL 60 DAY)
        WHERE id = UUID_TO_BIN(:eventId)`,
      { eventId }
    );
    const [rows] = await conn.query(
      `SELECT DATE_FORMAT(election_window_end, '%Y-%m-%d') AS we FROM cobra_event WHERE id = UUID_TO_BIN(:eventId)`,
      { eventId }
    );
    await conn.commit();
    return { windowEnd: (rows as any[])[0].we };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Record the QB's decision: cobra_election row + terminal event status. */
export async function recordElection(db: Pool, eventId: string, elected: boolean, coverage: string | null): Promise<void> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO cobra_election (cobra_event_id, elected, elected_date, coverage)
       VALUES (UUID_TO_BIN(:eventId), :elected, CURDATE(), :coverage)`,
      { eventId, elected, coverage }
    );
    await conn.query(`UPDATE cobra_event SET cobra_status = :status WHERE id = UUID_TO_BIN(:eventId)`, {
      eventId,
      status: elected ? "elected" : "waived",
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
