/**
 * Life-events integration tests (Phase E-4; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the full QLE loop across BOTH surfaces: the employee (own-records,
 * email-linked identity) reports an event → the HR queue derives it → docs
 * requested → approved (decision trail) → election window opened (life_event
 * enrollment event + 30-day window created) → employee sees the status — plus
 * the own-records and HR-queue authorization boundaries.
 *
 * State discipline: all life events/documents/approvals created here are removed;
 * the life_event enrollment event created by openElectionWindow is removed.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, getCustomerDb } from "@goben/data-access";
import { employerService } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const PY_2026 = "a2220000-0000-0000-0000-000000000002";
const EMP_AARON = "a1110000-0000-0000-0000-000000000002"; // linked to emp.a@test in the seed

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "life_event.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  // approvals + documents cascade off life_event.
  await db.query(`DELETE FROM life_event WHERE employee_id = UUID_TO_BIN('${EMP_AARON}')`);
  await db.query(
    `DELETE FROM enrollment_event WHERE type = 'life_event' AND name LIKE '%Aaron Acosta%'`
  );
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("employee self-service (own records)", () => {
  test("reportLifeEvent creates a submitted case for the email-linked employee", async () => {
    const employee = await buildAuthContext("sub-employee-a");
    const ev = await employerService.reportLifeEvent(employee, {
      eventType: "birth_adoption",
      eventDate: "2026-06-20",
      notes: "New baby",
    });
    expect(ev.type).toBe("Birth / Adoption");
    expect(ev.status).toBe("Needs Review");
    expect(ev.documents).toBe("1 missing"); // documentation_required type → doc slot created

    const mine = await employerService.employeeLifeEvents(employee);
    expect(mine.employeeId).toBe(EMP_AARON);
    expect(mine.events.length).toBe(1);
  });

  test("self surfaces reject non-employee callers and bad input", async () => {
    const admin = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.employeeLifeEvents(admin)).rejects.toMatchObject({ name: "AuthError" });
    expect(employerService.reportLifeEvent(admin, { eventType: "marriage", eventDate: "2026-01-01" })).rejects.toMatchObject({ name: "AuthError" });

    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.reportLifeEvent(employee, { eventType: "not_a_type", eventDate: "2026-01-01" })).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.reportLifeEvent(employee, { eventType: "marriage", eventDate: "June 1" })).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("HR queue + decisions", () => {
  test("the reported case flows request-docs → approve → open window; employee sees it", async () => {
    const hr = await buildAuthContext("sub-emp-admin-a");
    const queue = await employerService.lifeEventQueue(hr, EMP_A, PY_2026);
    expect(queue.counts.pendingReview).toBe(1);
    const c = queue.cases.find((x) => x.employee === "Aaron Acosta")!;
    expect(c.eventType).toBe("Birth / Adoption");
    expect(c.nextStep).toBe("Review request & documents");

    const docs = await employerService.requestLifeEventDocs(hr, EMP_A, c.id);
    expect(docs.ok).toBe(true);
    let after = await employerService.lifeEventQueue(hr, EMP_A, PY_2026);
    expect(after.counts.needsDocuments).toBe(1);
    expect(after.tasks.some((t) => t.key === "docs" && t.count === 1)).toBe(true);

    const approved = await employerService.approveLifeEvent(hr, EMP_A, c.id);
    expect(approved.nextStep).toBe("Open election window");
    after = await employerService.lifeEventQueue(hr, EMP_A, PY_2026);
    expect(after.tasks.some((t) => t.key === "windows" && t.count === 1)).toBe(true);

    const window = await employerService.openElectionWindow(hr, EMP_A, c.id);
    expect(window.ok).toBe(true);
    after = await employerService.lifeEventQueue(hr, EMP_A, PY_2026);
    expect(after.counts.electionWindowsOpen).toBe(1);

    // A life_event enrollment event + open window now exists on the active year.
    const db = await dbA();
    const [rows] = await db.query(
      `SELECT COUNT(*) AS n FROM enrollment_event ev
        JOIN enrollment_window w ON w.enrollment_event_id = ev.id
       WHERE ev.type = 'life_event' AND ev.name LIKE '%Aaron Acosta%' AND w.window_end >= CURDATE()`
    );
    expect(Number((rows as any[])[0].n)).toBe(1);

    // The employee's own view reflects the open window.
    const employee = await buildAuthContext("sub-employee-a");
    const mine = await employerService.employeeLifeEvents(employee);
    expect(mine.events[0].status).toBe("Election Window Open");

    // Window can only be opened once (status moved past approved).
    expect(employerService.openElectionWindow(hr, EMP_A, c.id)).rejects.toMatchObject({ name: "ValidationError" });
  });

  test("deny records the reason on the trail and reads Completed/Denied", async () => {
    const employee = await buildAuthContext("sub-employee-a");
    const ev = await employerService.reportLifeEvent(employee, { eventType: "marriage", eventDate: "2026-05-01" });
    const hr = await buildAuthContext("sub-emp-admin-a");
    const denied = await employerService.denyLifeEvent(hr, EMP_A, ev.id, "Outside the 30-day window");
    expect(denied.status).toBe("Completed");
    expect(denied.nextStep).toContain("Denied — Outside the 30-day window");
    // Denying again fails (no longer reviewable).
    expect(employerService.denyLifeEvent(hr, EMP_A, ev.id)).rejects.toMatchObject({ name: "ValidationError" });
  });

  test("HR queue and decisions are HR surfaces: employee + cross-tenant denied, broker reads", async () => {
    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.lifeEventQueue(employee, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });
    expect(employerService.approveLifeEvent(employee, EMP_A, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ name: "AuthError" });

    const broker = await buildAuthContext("sub-broker-a");
    const queue = await employerService.lifeEventQueue(broker, EMP_A, PY_2026);
    expect(queue.cases.length).toBeGreaterThan(0);
    // broker holds life_event.read but NOT life_event.manage.
    expect(employerService.approveLifeEvent(broker, EMP_A, queue.cases[0].id)).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.lifeEventQueue(adminB, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });
  });
});
