/**
 * Elections Review integration tests (Phase E-1; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the review read model derives issues server-side, the mutations enforce
 * permission x scope x routing + the review-state machine (approve blocks on open
 * requests; send-back clears them; approve-all only takes clean rows), and that
 * nothing crosses tenants.
 *
 * State discipline: only Employer A's seed elections (e444…0001–0004) are touched;
 * statuses/flags/notes/costs are restored before AND after the run.
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
const PY_2025_ARCHIVED = "a2220000-0000-0000-0000-000000000001";
// Seed elections: Alice medical family (01) + dental ee (02), Aaron medical ee (03)
// — all submitted, no employee_cost. Amara medical (04) is in_progress, untouched.
const EL_ALICE_MED = "e4440000-0000-0000-0000-000000000001";
const EL_ALICE_DEN = "e4440000-0000-0000-0000-000000000002";
const EL_AARON_MED = "e4440000-0000-0000-0000-000000000003";

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "election.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(
    `UPDATE employee_election
        SET status = 'submitted', review_flag = 'none', review_note = NULL,
            employee_cost = NULL, submitted_at = COALESCE(submitted_at, '2025-11-05 10:00:00')
      WHERE id IN (UUID_TO_BIN('${EL_ALICE_MED}'), UUID_TO_BIN('${EL_ALICE_DEN}'), UUID_TO_BIN('${EL_AARON_MED}'))`
  );
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("electionReview read model", () => {
  test("derives rows, issues, and counts from the seed elections", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const review = await employerService.electionReview(ctx, EMP_A, PY_2026);
    expect(review.readOnly).toBe(false);

    const alice = review.rows.find((r) => r.id === EL_ALICE_MED)!;
    expect(alice.employee).toBe("Alice Anderson");
    expect(alice.electionType).toBe("Open Enrollment");
    expect(alice.plans).toBe("UHC Choice Plus PPO");
    expect(alice.tier).toBe("Family");
    expect(alice.status).toBe("Submitted");
    // No cost computed yet → cost issue, and it is NOT ready to approve in bulk.
    expect(alice.issueType).toBe("cost");
    expect(alice.action).toBe("Recalculate");

    expect(review.counts.cost).toBe(3);
    expect(review.counts.readyToApprove).toBe(0);
    expect(review.counts.waiver).toBe(1); // Aaron's seed dental waiver
    expect(review.counts.approved).toBe(0);
    // Amara's untouched in-progress election is not review work.
    expect(review.rows.some((r) => r.status === "Sent Back")).toBe(false);
  });

  test("archived plan year reads as readOnly", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const review = await employerService.electionReview(ctx, EMP_A, PY_2025_ARCHIVED);
    expect(review.readOnly).toBe(true);
    expect(review.rows.length).toBe(0);
  });
});

describe("review mutations", () => {
  test("requestEoi blocks approve until the election is sent back", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.requestEoi(ctx, EMP_A, EL_ALICE_DEN);
    expect(res.ok).toBe(true);

    const review = await employerService.electionReview(ctx, EMP_A, PY_2026);
    expect(review.rows.find((r) => r.id === EL_ALICE_DEN)!.issueType).toBe("eoi");
    expect(review.counts.eoi).toBe(1);

    expect(employerService.approveElection(ctx, EMP_A, PY_2026, EL_ALICE_DEN)).rejects.toMatchObject({
      name: "ValidationError",
    });

    // Send back: returns to the employee, clears the request, records the note.
    const row = await employerService.sendBackElection(ctx, EMP_A, PY_2026, EL_ALICE_DEN, "Need EOI form");
    expect(row.status).toBe("Sent Back");
    expect(row.action).toBe("Awaiting Resubmission");
    const after = await employerService.electionReview(ctx, EMP_A, PY_2026);
    expect(after.counts.eoi).toBe(0);
  });

  test("approveElection approves a submitted election (cost missing does not block a single approve)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const row = await employerService.approveElection(ctx, EMP_A, PY_2026, EL_ALICE_MED);
    expect(row.status).toBe("Approved");
    expect(row.action).toBe("View");
    const review = await employerService.electionReview(ctx, EMP_A, PY_2026);
    expect(review.counts.approved).toBe(1);
    // Approving twice fails (no longer submitted).
    expect(employerService.approveElection(ctx, EMP_A, PY_2026, EL_ALICE_MED)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  test("approveAllReady takes only clean rows: flagged and cost-missing are skipped", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const db = await dbA();
    // Aaron's election gets a computed cost → clean; give it a flag first to prove
    // the flag skips it, then clear and re-run to prove it gets approved.
    await db.query(`UPDATE employee_election SET employee_cost = 123.45 WHERE id = UUID_TO_BIN('${EL_AARON_MED}')`);
    await employerService.requestDependentDocs(ctx, EMP_A, EL_AARON_MED);
    let res = await employerService.approveAllReadyElections(ctx, EMP_A, PY_2026);
    expect(res.message).toBe("0 election(s) approved"); // flagged → skipped

    await db.query(`UPDATE employee_election SET review_flag = 'none' WHERE id = UUID_TO_BIN('${EL_AARON_MED}')`);
    res = await employerService.approveAllReadyElections(ctx, EMP_A, PY_2026);
    expect(res.message).toBe("1 election(s) approved");

    // Archived plan year fails closed.
    expect(employerService.approveAllReadyElections(ctx, EMP_A, PY_2025_ARCHIVED)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  test("unknown election / wrong plan year are ValidationErrors", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(
      employerService.approveElection(ctx, EMP_A, PY_2026, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(
      employerService.approveElection(ctx, EMP_A, PY_2025_ARCHIVED, EL_ALICE_MED)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("authorization", () => {
  test("broker reads the queue but cannot mutate; employee and cross-tenant admin denied", async () => {
    const broker = await buildAuthContext("sub-broker-a");
    const review = await employerService.electionReview(broker, EMP_A, PY_2026);
    expect(review.rows.length).toBeGreaterThan(0);
    expect(employerService.approveElection(broker, EMP_A, PY_2026, EL_ALICE_MED)).rejects.toMatchObject({
      name: "AuthError",
    });

    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.electionReview(employee, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.requestEoi(adminB, EMP_A, EL_ALICE_MED)).rejects.toMatchObject({ name: "AuthError" });
  });
});
