/**
 * COBRA integration tests (Phase F-1; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the TPA-scoped COBRA loop: qualifying event (beneficiaries = employee +
 * dependents, notice deadline = event date + 44 days) → election notice (metadata-
 * first document + 60-day window) → election recorded within the window → terminal
 * status — and that premium collection fails closed with the TPA reason.
 *
 * State discipline: all cobra rows created here are removed (sub-tables cascade),
 * along with the metadata-first notice documents.
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
const ALICE = "a1110000-0000-0000-0000-000000000001"; // has 1 dependent (Ade)

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "cobra.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM cobra_event WHERE 1=1`); // QBs/elections/notices cascade
  await db.query(`DELETE FROM document WHERE category = 'cobra_notice'`);
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("COBRA event lifecycle (TPA scope — no premium collection)", () => {
  test("qualifying event creates beneficiaries and the 44-day notice deadline", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const view = await employerService.createCobraEvent(ctx, EMP_A, {
      employeeId: ALICE,
      eventType: "termination",
      eventDate: "2026-06-30",
      coverage: "Medical + Dental",
    });
    expect(view.event).toBe("Termination · 2026-06-30");
    expect(view.cobraStatus).toBe("notice_due");
    expect(view.paymentStatus).toBe("TPA-administered");
    expect(view.nextStep).toContain("2026-08-13"); // 6/30 + 44 days

    const cobra = await employerService.cobraCompliance(ctx, EMP_A);
    expect(cobra.qualifyingEvents).toBe(1);
    expect(cobra.paymentIssues).toBe(0);
    expect(cobra.payments).toEqual([]);
    // Alice + dependent Ade are qualified beneficiaries (containment, not an exact
    // list — local runs accumulate extra test dependents on Alice).
    const people = cobra.beneficiaries.map((b) => b.person);
    expect(people).toContain("Alice Anderson");
    expect(people).toContain("Ade Anderson");
    expect(cobra.beneficiaries.find((b) => b.person === "Alice Anderson")!.relationship).toBe("employee");
    expect(cobra.beneficiaries.find((b) => b.person === "Ade Anderson")!.relationship).toBe("child");
  });

  test("election notice: metadata-first document + 60-day window; then the decision lands", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const { events } = await employerService.cobraCompliance(ctx, EMP_A);
    const eventId = events[0].id;

    const notice = await employerService.generateCobraNotice(ctx, EMP_A, eventId);
    expect(notice.ok).toBe(true);
    expect(notice.message).toContain("window closes");
    // Notice can only be sent once.
    expect(employerService.generateCobraNotice(ctx, EMP_A, eventId)).rejects.toMatchObject({ name: "ValidationError" });

    // The notice document exists (metadata-first) and the window is open.
    const db = await dbA();
    const [docs] = await db.query(`SELECT COUNT(*) AS n FROM document WHERE category = 'cobra_notice'`);
    expect(Number((docs as any[])[0].n)).toBe(1);
    let after = await employerService.cobraCompliance(ctx, EMP_A);
    expect(after.events[0].cobraStatus).toBe("election_window_open");

    const decided = await employerService.recordCobraElection(ctx, EMP_A, eventId, true, "Medical only");
    expect(decided.cobraStatus).toBe("elected");
    expect(decided.nextStep).toBe("Hand off to TPA for premium administration");
    after = await employerService.cobraCompliance(ctx, EMP_A);
    expect(after.activeParticipants).toBe(1);
    // Deciding twice fails (terminal status).
    expect(employerService.recordCobraElection(ctx, EMP_A, eventId, false)).rejects.toMatchObject({ name: "ValidationError" });
  });

  test("premium collection fails closed with the TPA reason", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.recordCobraPayment(ctx, EMP_A)).rejects.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("TPA"),
    });
  });

  test("validation + authorization boundaries", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.createCobraEvent(ctx, EMP_A, { employeeId: ALICE, eventType: "retirement", eventDate: "2026-01-01" })).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.createCobraEvent(ctx, EMP_A, { employeeId: "00000000-0000-0000-0000-000000000000", eventType: "termination", eventDate: "2026-01-01" })).rejects.toMatchObject({ name: "ValidationError" });

    const broker = await buildAuthContext("sub-broker-a"); // cobra.read only
    const cobra = await employerService.cobraCompliance(broker, EMP_A);
    expect(cobra.qualifyingEvents).toBe(1);
    expect(employerService.createCobraEvent(broker, EMP_A, { employeeId: ALICE, eventType: "termination", eventDate: "2026-01-01" })).rejects.toMatchObject({ name: "AuthError" });

    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.cobraCompliance(employee, EMP_A)).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.cobraCompliance(adminB, EMP_A)).rejects.toMatchObject({ name: "AuthError" });
  });
});
