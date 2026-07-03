/**
 * Enrollment mutation integration tests (Phase D-7; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves launchEnrollment / sendEnrollmentReminders / createEnrollmentWindow enforce
 * the SAME permission x scope x routing as every other resolver, that launch gates on
 * checklist blockers + an open OE window and idempotently invites everyone, and that
 * reminders respect the audience filter and never target submitted employees.
 *
 * State discipline: writes go to Employer A's DB only. The tests restore the seed
 * invitation set (the 3 fixed-UUID seed invitations, reminders_sent = 0), remove
 * windows/events they create, and remove the scratch plan year (2036).
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
const SEED_PY_2026_ACTIVE = "a2220000-0000-0000-0000-000000000002";
const SEED_PY_2025_ARCHIVED = "a2220000-0000-0000-0000-000000000001";
// Employees invited by the seed (3 of the 4 fixed-UUID seed employees).
const SEED_INVITED = [
  "a1110000-0000-0000-0000-000000000001",
  "a1110000-0000-0000-0000-000000000002",
  "a1110000-0000-0000-0000-000000000003",
];
const SCRATCH_YEAR = 2036;

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "enrollment.read", EMP_A);
  return db;
}

/** Restore the seed enrollment state for Employer A. */
async function resetTestState() {
  const db = await dbA();
  const seedList = SEED_INVITED.map((id) => `UUID_TO_BIN('${id}')`).join(",");
  // Remove invitations the launch test created; reset seed reminder counters.
  await db.query(
    `DELETE i FROM enrollment_invitation i
      JOIN enrollment_event ev ON ev.id = i.enrollment_event_id
      WHERE ev.plan_year_id = UUID_TO_BIN(:pyId) AND i.employee_id NOT IN (${seedList})`,
    { pyId: SEED_PY_2026_ACTIVE }
  );
  await db.query(`UPDATE enrollment_invitation SET reminders_sent = 0`);
  // Remove non-OE events created by the window tests (window cascades off event).
  await db.query(
    `DELETE FROM enrollment_event
      WHERE plan_year_id = UUID_TO_BIN(:pyId) AND type <> 'open_enrollment'`,
    { pyId: SEED_PY_2026_ACTIVE }
  );
  // Remove the scratch plan year (+ its events/windows; no plans/elections exist on it).
  await db.query(
    `DELETE FROM enrollment_event WHERE plan_year_id IN (SELECT id FROM plan_year WHERE year = ${SCRATCH_YEAR})`
  );
  await db.query(`DELETE FROM plan_year WHERE year = ${SCRATCH_YEAR}`);
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("createEnrollmentWindow", () => {
  test("creates a new-hire window on the active year with a derived status", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const w = await employerService.createEnrollmentWindow(ctx, EMP_A, SEED_PY_2026_ACTIVE, {
      type: "new_hire",
      windowStart: "2026-01-01",
      windowEnd: "2099-12-31",
    });
    expect(w.id).toBeTruthy();
    expect(w.type).toBe("New Hire");
    expect(w.name).toBe("New Hire"); // defaulted from the type
    expect(w.status).toBe("Open"); // started in the past, ends far future
    expect(w.windowLabel).toBe("2026-01-01 – 2099-12-31");
  });

  test("open_enrollment attaches to the EXISTING OE event (no duplicate events)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const db = await dbA();
    const [before] = await db.query(
      `SELECT COUNT(*) AS n FROM enrollment_event WHERE plan_year_id = UUID_TO_BIN(:pyId) AND type = 'open_enrollment'`,
      { pyId: SEED_PY_2026_ACTIVE }
    );
    const w = await employerService.createEnrollmentWindow(ctx, EMP_A, SEED_PY_2026_ACTIVE, {
      type: "open_enrollment",
      name: "OE extension",
      windowStart: "2099-01-01",
      windowEnd: "2099-01-31",
    });
    expect(w.status).toBe("Scheduled");
    const [after] = await db.query(
      `SELECT COUNT(*) AS n FROM enrollment_event WHERE plan_year_id = UUID_TO_BIN(:pyId) AND type = 'open_enrollment'`,
      { pyId: SEED_PY_2026_ACTIVE }
    );
    expect(Number((after as any[])[0].n)).toBe(Number((before as any[])[0].n)); // reused
    // Clean the extra window immediately (seed OE event must keep its single seed window
    // as the FIRST by window_start for the read models — 2099 sorts after, but tidy up).
    await db.query(`DELETE FROM enrollment_window WHERE id = UUID_TO_BIN(:id)`, { id: w.id });
  });

  test("bad type, bad dates, inverted range, archived year are ValidationErrors", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const base = { windowStart: "2026-01-01", windowEnd: "2026-02-01" };
    expect(employerService.createEnrollmentWindow(ctx, EMP_A, SEED_PY_2026_ACTIVE, { type: "special", ...base })).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.createEnrollmentWindow(ctx, EMP_A, SEED_PY_2026_ACTIVE, { type: "new_hire", windowStart: "Jan 1", windowEnd: "2026-02-01" })).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.createEnrollmentWindow(ctx, EMP_A, SEED_PY_2026_ACTIVE, { type: "new_hire", windowStart: "2026-03-01", windowEnd: "2026-02-01" })).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.createEnrollmentWindow(ctx, EMP_A, SEED_PY_2025_ARCHIVED, { type: "new_hire", ...base })).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("launchEnrollment", () => {
  test("launch on the ready seed year invites every not-yet-invited employee (idempotent)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const db = await dbA();
    const [[emp], [inv]] = await Promise.all([
      db.query(`SELECT COUNT(*) AS n FROM employee`).then(([r]) => r as any[]),
      db.query(
        `SELECT COUNT(*) AS n FROM enrollment_invitation i JOIN enrollment_event ev ON ev.id = i.enrollment_event_id
          WHERE ev.plan_year_id = UUID_TO_BIN(:pyId)`,
        { pyId: SEED_PY_2026_ACTIVE }
      ).then(([r]) => r as any[]),
    ]);
    const totalEmployees = Number(emp.n);
    expect(Number(inv.n)).toBeLessThan(totalEmployees); // seed leaves gaps

    const center = await employerService.launchEnrollment(ctx, EMP_A, SEED_PY_2026_ACTIVE);
    expect(center.launchState).toBe("launched");

    const [after] = await db.query(
      `SELECT COUNT(*) AS n FROM enrollment_invitation i JOIN enrollment_event ev ON ev.id = i.enrollment_event_id
        WHERE ev.plan_year_id = UUID_TO_BIN(:pyId)`,
      { pyId: SEED_PY_2026_ACTIVE }
    );
    expect(Number((after as any[])[0].n)).toBe(totalEmployees); // everyone invited

    // Relaunch is a no-op on invitations (INSERT IGNORE), not an error.
    const again = await employerService.launchEnrollment(ctx, EMP_A, SEED_PY_2026_ACTIVE);
    expect(again.launchState).toBe("launched");
    const [after2] = await db.query(
      `SELECT COUNT(*) AS n FROM enrollment_invitation i JOIN enrollment_event ev ON ev.id = i.enrollment_event_id
        WHERE ev.plan_year_id = UUID_TO_BIN(:pyId)`,
      { pyId: SEED_PY_2026_ACTIVE }
    );
    expect(Number((after2 as any[])[0].n)).toBe(totalEmployees);
  });

  test("launch on a year with blockers / no OE window is a ValidationError", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    // A fresh empty plan year: checklist blockers > 0 (no plans/rates), no OE event.
    const py = await employerService.createPlanYear(ctx, EMP_A, SCRATCH_YEAR, `PY ${SCRATCH_YEAR}`);
    expect(employerService.launchEnrollment(ctx, EMP_A, py.id)).rejects.toMatchObject({ name: "ValidationError" });
    // Archived years are read-only.
    expect(employerService.launchEnrollment(ctx, EMP_A, SEED_PY_2025_ARCHIVED)).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("sendEnrollmentReminders", () => {
  test("reminds only non-submitted invitations; audience filters apply", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const db = await dbA();

    // Baseline: everyone was invited by the launch test above; some seed employees have
    // submitted elections and must NEVER be reminded.
    const res = await employerService.sendEnrollmentReminders(ctx, EMP_A, SEED_PY_2026_ACTIVE, "all");
    expect(res.status).toStartWith("completed");
    const remindedAll = Number(res.status.match(/(\d+) reminder/)![1]);
    expect(remindedAll).toBeGreaterThan(0);

    const [submittedReminded] = await db.query(
      `SELECT COUNT(*) AS n FROM enrollment_invitation i
        WHERE i.reminders_sent > 0
          AND EXISTS (SELECT 1 FROM employee_election el
                       WHERE el.employee_id = i.employee_id
                         AND el.enrollment_event_id = i.enrollment_event_id
                         AND el.status IN ('submitted','approved'))`
    );
    expect(Number((submittedReminded as any[])[0].n)).toBe(0);

    // in_progress targets strictly fewer (or equal) invitations than all.
    const inProg = await employerService.sendEnrollmentReminders(ctx, EMP_A, SEED_PY_2026_ACTIVE, "in_progress");
    const remindedInProg = Number(inProg.status.match(/(\d+) reminder/)![1]);
    expect(remindedInProg).toBeLessThanOrEqual(remindedAll);

    // Unknown audience fails closed.
    expect(employerService.sendEnrollmentReminders(ctx, EMP_A, SEED_PY_2026_ACTIVE, "everyone")).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("authorization", () => {
  test("employee and cross-tenant admin are denied", async () => {
    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.launchEnrollment(employee, EMP_A, SEED_PY_2026_ACTIVE)).rejects.toMatchObject({ name: "AuthError" });
    expect(employerService.sendEnrollmentReminders(employee, EMP_A, SEED_PY_2026_ACTIVE)).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(
      employerService.createEnrollmentWindow(adminB, EMP_A, SEED_PY_2026_ACTIVE, { type: "new_hire", windowStart: "2026-01-01", windowEnd: "2026-02-01" })
    ).rejects.toMatchObject({ name: "AuthError" });
  });
});
