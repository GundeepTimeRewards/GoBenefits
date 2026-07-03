/**
 * Deductions workspace integration tests (Phase E-2b; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the full deduction lifecycle: generate → workspace shows Needs Review
 * (missing code) → mapDeductionCode → Ready → export creates a batch, flips rows
 * to processed → regeneration SUPERSEDES exported rows (never breaks the batch
 * FK) and the workspace diffs "changed since last export" → reconcile approves
 * the batch. Plus the 0008 employer-only payroll decision (brokers denied).
 *
 * State discipline: everything created here is removed (batches, lines, codes,
 * rate_engine deductions, the pay-frequency row); seed elections restored.
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
const EL_ALICE_MED_FAMILY = "e4440000-0000-0000-0000-000000000001";

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "payroll.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM payroll_export_line WHERE 1=1`);
  await db.query(`DELETE FROM payroll_export_batch WHERE 1=1`);
  await db.query(`DELETE FROM payroll_deduction WHERE source = 'rate_engine'`);
  await db.query(`DELETE FROM deduction_code WHERE payroll_code LIKE 'E2B-%'`);
  await db.query(
    `UPDATE employee_election
        SET status = 'submitted', review_flag = 'none', review_note = NULL,
            employee_cost = NULL, employer_contribution = NULL, premium_total = NULL
      WHERE id = UUID_TO_BIN('${EL_ALICE_MED_FAMILY}')`
  );
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("deduction lifecycle: generate → code → export → regenerate → reconcile", () => {
  test("workspace surfaces the generated row as Needs Review until a code is mapped", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await employerService.approveElection(ctx, EMP_A, PY_2026, EL_ALICE_MED_FAMILY);
    await employerService.generatePayrollDeductions(ctx, EMP_A, PY_2026);

    const ws = await employerService.deductionsWorkspace(ctx, EMP_A, PY_2026);
    expect(ws.deductionReview.length).toBe(1);
    const row = ws.deductionReview[0];
    expect(row.employee).toBe("Alice Anderson");
    expect(row.status).toBe("Needs Review");
    expect(row.issue).toBe("Missing payroll code");
    expect(row.changeType).toBe("add");
    expect(row.ee).toBe("$508.20");
    expect(ws.deductionSummary.missingCode).toBe(1);
    expect(ws.deductionSummary.readyToExport).toBe(0);
    expect(ws.deductionSummary.totalEr).toBe("$338.72");

    const mapped = await employerService.mapDeductionCode(ctx, EMP_A, row.id, "E2B-MED");
    expect(mapped.status).toBe("Ready");
    expect(mapped.code).toBe("E2B-MED");
    const after = await employerService.deductionsWorkspace(ctx, EMP_A, PY_2026);
    expect(after.deductionSummary.readyToExport).toBe(1);
  });

  test("export creates a batch, flips the row to Exported, and empty re-export is a no-op", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.exportReadyDeductions(ctx, EMP_A, PY_2026);
    expect(res.status).toBe("completed: 1 line(s) exported");

    const ws = await employerService.deductionsWorkspace(ctx, EMP_A, PY_2026);
    expect(ws.deductionReview[0].status).toBe("Exported");
    expect(ws.exportBatches.length).toBe(1);
    expect(ws.exportBatches[0].status).toBe("Generated");
    expect(ws.exportBatches[0].employees).toBe(1);
    expect(ws.exportBatches[0].totalEe).toBe("$508.20");

    // Nothing ready anymore → reported as a no-op, and NO empty batch is persisted.
    const empty = await employerService.exportReadyDeductions(ctx, EMP_A, PY_2026);
    expect(empty.status).toBe("completed: 0 line(s) exported (no batch created)");
    const after = await employerService.deductionsWorkspace(ctx, EMP_A, PY_2026);
    expect(after.exportBatches.length).toBe(1);
  });

  test("changing the contribution + regenerating supersedes (not deletes) and diffs the change", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    // Raise the employer health share 20% → 30%: EE cost drops.
    await employerService.updateContributionRule(ctx, EMP_A, { pctEmployeeHealth: 30 });
    try {
      await employerService.generatePayrollDeductions(ctx, EMP_A, PY_2026);
      const ws = await employerService.deductionsWorkspace(ctx, EMP_A, PY_2026);
      // New unprocessed row diffing against the superseded exported amount.
      const row = ws.deductionReview[0];
      expect(row.changeType).toBe("change");
      expect(ws.deductionChanges.length).toBe(1);
      expect(ws.deductionChanges[0].previous).toBe("$508.20");
      // ER = 612×0.30 + 1223×0.50 = 795.10 monthly → per-pay 366.97; EE = 846.92 − 366.97.
      expect(ws.deductionChanges[0].new).toBe("$479.95");
      // The exported batch's line still resolves (FK intact after regeneration).
      expect(ws.exportBatches[0].totalEe).toBe("$508.20");
    } finally {
      await employerService.updateContributionRule(ctx, EMP_A, { pctEmployeeHealth: 20 });
    }
  });

  test("reconcileBatch approves a generated batch exactly once", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const ws = await employerService.deductionsWorkspace(ctx, EMP_A, PY_2026);
    const batchId = ws.exportBatches[0].id;
    const batch = await employerService.reconcileBatch(ctx, EMP_A, batchId);
    expect(batch.status).toBe("Reconciled");
    expect(employerService.reconcileBatch(ctx, EMP_A, batchId)).rejects.toMatchObject({ name: "ValidationError" });
    expect(
      employerService.reconcileBatch(ctx, EMP_A, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("authorization (payroll is employer-level only — 0008)", () => {
  test("broker and agency can no longer read the payroll workspace; employee/cross-tenant denied", async () => {
    const broker = await buildAuthContext("sub-broker-a");
    expect(employerService.deductionsWorkspace(broker, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });

    const agency = await buildAuthContext("sub-agency");
    expect(employerService.deductionsWorkspace(agency, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });

    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.exportReadyDeductions(employee, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.mapDeductionCode(adminB, EMP_A, "00000000-0000-0000-0000-000000000000", "X")).rejects.toMatchObject({ name: "AuthError" });
  });
});
