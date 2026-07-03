/**
 * Enrollment mutation repository (Phase D-7). SQL against a ROUTED customer-DB pool
 * only — the service authorizes + routes via getCustomerDb. Read models stay in
 * enrollment-repository; this file is writes.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";

/**
 * Create an enrollment window. For `open_enrollment` the window attaches to the plan
 * year's EXISTING OE event when one exists (getOeEvent assumes a single OE event per
 * plan year — never create a duplicate); other types always get a new event. One
 * transaction. Returns both ids.
 */
export async function createWindow(
  db: Pool,
  args: {
    planYearId: string;
    type: string;
    name: string | null;
    effectiveDate: string;
    windowStart: string;
    windowEnd: string;
  }
): Promise<{ eventId: string; windowId: string; reusedEvent: boolean }> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let eventId: string | null = null;
    let reusedEvent = false;
    if (args.type === "open_enrollment") {
      const [rows] = await conn.query(
        `SELECT BIN_TO_UUID(id) AS id FROM enrollment_event
          WHERE plan_year_id = UUID_TO_BIN(:planYearId) AND type = 'open_enrollment'
          ORDER BY effective_date LIMIT 1`,
        { planYearId: args.planYearId }
      );
      eventId = (rows as { id: string }[])[0]?.id ?? null;
      reusedEvent = eventId != null;
    }
    if (!eventId) {
      eventId = randomUUID();
      await conn.query(
        `INSERT INTO enrollment_event (id, plan_year_id, type, name, effective_date)
         VALUES (UUID_TO_BIN(:eventId), UUID_TO_BIN(:planYearId), :type, :name, :effectiveDate)`,
        { eventId, planYearId: args.planYearId, type: args.type, name: args.name, effectiveDate: args.effectiveDate }
      );
    }

    const windowId = randomUUID();
    await conn.query(
      `INSERT INTO enrollment_window (id, enrollment_event_id, window_start, window_end)
       VALUES (UUID_TO_BIN(:windowId), UUID_TO_BIN(:eventId), :windowStart, :windowEnd)`,
      { windowId, eventId, windowStart: args.windowStart, windowEnd: args.windowEnd }
    );

    await conn.commit();
    return { eventId, windowId, reusedEvent };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** True when the event has a window that is still open (window_end >= today). */
export async function hasOpenWindow(db: Pool, eventId: string): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT 1 FROM enrollment_window
      WHERE enrollment_event_id = UUID_TO_BIN(:eventId) AND window_end >= CURDATE() LIMIT 1`,
    { eventId }
  );
  return (rows as unknown[]).length > 0;
}

/**
 * Invite every employee who doesn't have an invitation for this event yet
 * (idempotent via uq_invite + INSERT IGNORE). Marks them sent NOW — the actual
 * email delivery is the prod SES/EventBridge path, out of local scope. Returns
 * the number of NEW invitations.
 */
export async function inviteAllEmployees(db: Pool, eventId: string): Promise<number> {
  const [result] = await db.query(
    `INSERT IGNORE INTO enrollment_invitation (employee_id, enrollment_event_id, sent_at, status)
     SELECT e.id, UUID_TO_BIN(:eventId), NOW(3), 'sent' FROM employee e`,
    { eventId }
  );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}

export type ReminderAudience = "all" | "not_started" | "in_progress";

/**
 * Bump reminder counts for the event's invitations, filtered by audience. An
 * employee is "submitted" when they have a submitted/approved election for the
 * event — reminders never target them. `not_started` additionally excludes anyone
 * with an in-progress election; `in_progress` targets ONLY those. Returns the
 * number of invitations reminded.
 */
export async function sendReminders(db: Pool, eventId: string, audience: ReminderAudience): Promise<number> {
  const submittedFilter = `
    NOT EXISTS (SELECT 1 FROM employee_election el
                 WHERE el.employee_id = i.employee_id
                   AND el.enrollment_event_id = UUID_TO_BIN(:eventId)
                   AND el.status IN ('submitted','approved'))`;
  const inProgressExists = `
    EXISTS (SELECT 1 FROM employee_election el2
             WHERE el2.employee_id = i.employee_id
               AND el2.enrollment_event_id = UUID_TO_BIN(:eventId)
               AND el2.status = 'in_progress')`;
  const audienceFilter =
    audience === "not_started" ? `AND NOT ${inProgressExists}` : audience === "in_progress" ? `AND ${inProgressExists}` : "";

  const [result] = await db.query(
    `UPDATE enrollment_invitation i
        SET i.reminders_sent = i.reminders_sent + 1,
            i.sent_at = NOW(3),
            i.status = IF(i.status = 'not_sent', 'sent', i.status)
      WHERE i.enrollment_event_id = UUID_TO_BIN(:eventId)
        AND i.status <> 'completed'
        AND ${submittedFilter} ${audienceFilter}`,
    { eventId }
  );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}
