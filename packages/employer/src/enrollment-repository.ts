/**
 * Enrollment repository (Phase D-3). Gathers a single `EnrollmentCounts` bundle for the
 * open-enrollment event of a plan year, plus the control-plane benefit_type labels for
 * per-line names. SQL against a ROUTED customer-DB pool only (the service authorizes +
 * routes via getCustomerDb) plus the control-plane pool for reference labels.
 */
import type { Pool } from "mysql2/promise";
import type { EnrollmentCounts, LineTally } from "./enrollment.js";
import { coverageLineOf, type BenefitTypeRef } from "./plan-catalog.js";

export type OeEvent = { eventId: string; name: string | null; type: string } | null;

/** The open-enrollment event for a plan year (the first one, if any). */
export async function getOeEvent(db: Pool, planYearId: string): Promise<OeEvent> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(id) AS eventId, name, type
       FROM enrollment_event
      WHERE plan_year_id = UUID_TO_BIN(:planYearId) AND type = 'open_enrollment'
      ORDER BY effective_date LIMIT 1`,
    { planYearId }
  );
  const r = (rows as any[])[0];
  return r ? { eventId: r.eventId, name: r.name ?? null, type: r.type } : null;
}

async function planYearStatus(db: Pool, planYearId: string): Promise<string | null> {
  const [rows] = await db.query(`SELECT status FROM plan_year WHERE id = UUID_TO_BIN(:planYearId) LIMIT 1`, { planYearId });
  return (rows as any[])[0]?.status ?? null;
}

async function eligibleCount(db: Pool): Promise<number> {
  const [rows] = await db.query(`SELECT COUNT(*) AS n FROM employee`);
  return Number((rows as any[])[0].n);
}

/**
 * Gather all enrollment tallies for the OE event. Progress counts are at the EMPLOYEE
 * level (distinct employees per best status); byLine is per benefit line. Everything is
 * scoped to the event; `windowOpen` is computed in SQL (window_end >= CURDATE()) so the
 * launch state is deterministic given the seeded window.
 */
export async function getEnrollmentCounts(
  db: Pool,
  cp: Pool,
  planYearId: string,
  event: OeEvent
): Promise<{ counts: EnrollmentCounts; benefitTypes: BenefitTypeRef[] }> {
  const [pyStatus, eligible, [btRows]] = await Promise.all([
    planYearStatus(db, planYearId),
    eligibleCount(db),
    cp.query(`SELECT key_name AS keyName, label FROM benefit_type`),
  ]);
  const benefitTypes = (btRows as any[]).map((r) => ({ keyName: r.keyName, label: r.label }));
  const labelByKey = new Map(benefitTypes.map((b) => [b.keyName, b.label]));

  if (!event) {
    return {
      counts: {
        eligible, invited: 0, submittedEmployees: 0, inProgressEmployees: 0, waivedCount: 0, byLine: [],
        hasEvent: false, eventName: null, eventType: null, hasWindow: false, windowStart: null, windowEnd: null,
        windowOpen: false, planYearStatus: pyStatus,
      },
      benefitTypes,
    };
  }
  const eventId = event.eventId;

  const [winRows] = await db.query(
    `SELECT DATE_FORMAT(window_start,'%Y-%m-%d') AS windowStart, DATE_FORMAT(window_end,'%Y-%m-%d') AS windowEnd,
            (window_end >= CURDATE()) AS windowOpen
       FROM enrollment_window WHERE enrollment_event_id = UUID_TO_BIN(:eventId)
       ORDER BY window_start LIMIT 1`,
    { eventId }
  );
  const win = (winRows as any[])[0];

  const [invRows] = await db.query(
    `SELECT COUNT(*) AS n FROM enrollment_invitation
      WHERE enrollment_event_id = UUID_TO_BIN(:eventId) AND status IN ('sent','opened','completed')`,
    { eventId }
  );
  const invited = Number((invRows as any[])[0].n);

  // Employee-level status buckets for this event (distinct employees).
  const [empRows] = await db.query(
    `SELECT
        COUNT(DISTINCT CASE WHEN status IN ('submitted','approved') THEN employee_id END) AS submittedEmployees,
        COUNT(DISTINCT CASE WHEN status = 'in_progress' THEN employee_id END) AS inProgressAll
       FROM employee_election WHERE enrollment_event_id = UUID_TO_BIN(:eventId)`,
    { eventId }
  );
  const submittedEmployees = Number((empRows as any[])[0].submittedEmployees);
  // in-progress employees excluding those already counted as submitted.
  const [ipRows] = await db.query(
    `SELECT COUNT(DISTINCT employee_id) AS n FROM employee_election
      WHERE enrollment_event_id = UUID_TO_BIN(:eventId) AND status = 'in_progress'
        AND employee_id NOT IN (SELECT employee_id FROM employee_election
          WHERE enrollment_event_id = UUID_TO_BIN(:eventId) AND status IN ('submitted','approved'))`,
    { eventId }
  );
  const inProgressEmployees = Number((ipRows as any[])[0].n);

  const [waiverRows] = await db.query(
    `SELECT COUNT(*) AS n FROM waiver WHERE enrollment_event_id = UUID_TO_BIN(:eventId)`,
    { eventId }
  );
  const waivedCount = Number((waiverRows as any[])[0].n);

  // Per-line tallies: elected (submitted/approved, non-waived tier), waived, pending.
  const [lineRows] = await db.query(
    `SELECT bp.benefit_type_key AS benefitTypeKey,
            SUM(ee.status IN ('submitted','approved') AND ee.coverage_tier <> 'waived') AS elected,
            SUM(ee.status = 'waived' OR ee.coverage_tier = 'waived') AS waived,
            SUM(ee.status IN ('not_started','in_progress')) AS pending
       FROM employee_election ee JOIN benefit_plan bp ON bp.id = ee.benefit_plan_id
      WHERE ee.enrollment_event_id = UUID_TO_BIN(:eventId)
      GROUP BY bp.benefit_type_key`,
    { eventId }
  );
  const byLine: LineTally[] = (lineRows as any[])
    .map((r) => {
      const line = coverageLineOf(r.benefitTypeKey);
      if (line == null) return null;
      return {
        line,
        benefitLabel: labelByKey.get(r.benefitTypeKey) ?? r.benefitTypeKey,
        elected: Number(r.elected),
        waived: Number(r.waived),
        pending: Number(r.pending),
      };
    })
    .filter((x): x is LineTally => x != null);

  return {
    counts: {
      eligible, invited, submittedEmployees, inProgressEmployees, waivedCount, byLine,
      hasEvent: true, eventName: event.name, eventType: event.type,
      hasWindow: Boolean(win), windowStart: win?.windowStart ?? null, windowEnd: win?.windowEnd ?? null,
      windowOpen: Boolean(win?.windowOpen), planYearStatus: pyStatus,
    },
    benefitTypes,
  };
}
