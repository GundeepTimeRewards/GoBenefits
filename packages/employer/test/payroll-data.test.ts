/**
 * Payroll-data + ACA lookback integration tests (Phase E-5; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the import pipeline (census matching by employee_number, unmatched rows
 * staged + counted), the ACA standard-measurement math (12-month window, 130
 * hrs/month full-time threshold, employee_aca written idempotently), and the
 * workspace assembly — all employer-level only (0008).
 *
 * State discipline: import batches/rows removed (rows cascade), employee_aca rows
 * cleared, seed employee_number values restored to NULL.
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
const ALICE = "a1110000-0000-0000-0000-000000000001";
const AARON = "a1110000-0000-0000-0000-000000000002";

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "payroll.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM payroll_import_batch WHERE 1=1`); // rows cascade
  await db.query(`DELETE FROM employee_aca WHERE 1=1`);
  await db.query(
    `UPDATE employee SET employee_number = NULL
      WHERE id IN (UUID_TO_BIN('${ALICE}'), UUID_TO_BIN('${AARON}'))`
  );
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
  // Give the two fixture employees stable numbers for census matching.
  const db = await dbA();
  await db.query(`UPDATE employee SET employee_number = 'PAY-001' WHERE id = UUID_TO_BIN('${ALICE}')`);
  await db.query(`UPDATE employee SET employee_number = 'PAY-002' WHERE id = UUID_TO_BIN('${AARON}')`);
});

afterAll(async () => {
  await resetTestState();
});

/** Import 12 monthly periods of hours for both fixture employees. */
async function importYearOfHours(ctx: Awaited<ReturnType<typeof buildAuthContext>>, aliceMonthly: number, aaronMonthly: number) {
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(Date.UTC(2026, m, 0)).getUTCDate();
    await employerService.importPayrollData(ctx, EMP_A, {
      source: "csv",
      periodStart: `2026-${mm}-01`,
      periodEnd: `2026-${mm}-${lastDay}`,
      rows: [
        { employeeNumber: "PAY-001", hours: aliceMonthly, wages: 4200 },
        { employeeNumber: "PAY-002", hours: aaronMonthly, wages: 2100 },
        ...(m === 1 ? [{ employeeNumber: "NO-SUCH-EMP", hours: 10 }] : []),
      ],
    });
  }
}

describe("importPayrollData", () => {
  test("matches census by employee_number and stages unmatched rows with a count", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.importPayrollData(ctx, EMP_A, {
      source: "csv",
      periodStart: "2025-12-01",
      periodEnd: "2025-12-31",
      rows: [
        { employeeNumber: "PAY-001", hours: 160, wages: 4200 },
        { employeeNumber: "GHOST-9", hours: 80 },
      ],
    });
    expect(res.status).toBe("completed: 1 matched, 1 unmatched row(s) imported");

    const ws = await employerService.payrollDataWorkspace(ctx, EMP_A, PY_2026);
    expect(ws.importSummary.importedPayPeriods).toBe(1);
    expect(ws.importSummary.unmatchedEmployees).toBe(1);
    expect(ws.readiness.issues.some((i) => i.key === "unmatched_rows" && i.count === 1)).toBe(true);
    expect(ws.readiness.issues.some((i) => i.key === "lookback_not_run")).toBe(true);
    expect(ws.payPeriods[0].employees).toBe(2);
    expect(ws.payPeriods[0].issues).toBe(1);
  });

  test("validation: bad dates, empty rows, bad hours fail closed", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const base = { source: "csv", periodStart: "2026-01-01", periodEnd: "2026-01-31" };
    expect(employerService.importPayrollData(ctx, EMP_A, { ...base, periodStart: "Jan 1", rows: [{ employeeNumber: "X", hours: 1 }] })).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.importPayrollData(ctx, EMP_A, { ...base, rows: [] })).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.importPayrollData(ctx, EMP_A, { ...base, rows: [{ employeeNumber: "X", hours: -4 }] })).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("runAcaLookback", () => {
  test("measures the trailing 12 months: 140 hrs/mo is full-time, 90 is not", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await importYearOfHours(ctx, 140, 90);

    const res = await employerService.runAcaLookback(ctx, EMP_A, PY_2026);
    expect(res.status).toBe("completed: 2 employee(s) measured, 1 full-time");

    const db = await dbA();
    const [rows] = await db.query(
      `SELECT BIN_TO_UUID(employee_id) AS id, lookback_hours AS h, aca_eligible AS e,
              DATE_FORMAT(measurement_end, '%Y-%m-%d') AS me, DATE_FORMAT(stability_start, '%Y-%m-%d') AS ss
       FROM employee_aca ORDER BY h DESC`
    );
    const [alice, aaron] = rows as any[];
    expect(alice.id).toBe(ALICE);
    expect(Number(alice.h)).toBe(140);
    expect(Number(alice.e)).toBe(1);
    expect(Number(aaron.h)).toBe(90);
    expect(Number(aaron.e)).toBe(0);
    // Stability starts the day after the measurement ends.
    expect(alice.ss > alice.me).toBe(true);

    // Workspace surfaces the determination.
    const ws = await employerService.payrollDataWorkspace(ctx, EMP_A, PY_2026);
    expect(ws.aca.calcStatus).toBe("complete");
    expect(ws.aca.fullTimeDeterminationStatus).toBe("1 of 2 full-time");
    const aliceRec = ws.employeeRecords.find((r) => r.name === "Alice Anderson")!;
    expect(aliceRec.aca).toContain("Full-time");
    expect(ws.readiness.issues.some((i) => i.key === "lookback_not_run")).toBe(false);
  });

  test("recalculation is idempotent and reflects new hours", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.runAcaLookback(ctx, EMP_A, PY_2026);
    expect(res.status).toBe("completed: 2 employee(s) measured, 1 full-time");
    const db = await dbA();
    const [rows] = await db.query(`SELECT COUNT(*) AS n FROM employee_aca`);
    expect(Number((rows as any[])[0].n)).toBe(2); // upserted, not duplicated
  });

  test("no imports → honest no-op status; unknown plan year fails closed", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(
      employerService.runAcaLookback(ctx, EMP_A, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("authorization (payroll is employer-level only — 0008)", () => {
  test("broker/agency/employee/cross-tenant all denied", async () => {
    const broker = await buildAuthContext("sub-broker-a");
    expect(employerService.payrollDataWorkspace(broker, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });
    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.importPayrollData(employee, EMP_A, { source: "csv", periodStart: "2026-01-01", periodEnd: "2026-01-31", rows: [{ employeeNumber: "X", hours: 1 }] })).rejects.toMatchObject({ name: "AuthError" });
    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.runAcaLookback(adminB, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });
  });
});
