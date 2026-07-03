/**
 * ACA compliance integration tests (Phase F-2; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the ALE math (FT at 130+ hrs/month, FTE = capped PT hours ÷ 120, ALE at
 * avg ≥ 50), 1095-C generation with the simplified code set (enrolled → 2C,
 * not-full-time → 2B) that never overwrites migrated `filed` archive rows, the
 * W-2 affordability test powered by the same rate engine as deductions, the
 * archive-retrieval filing history, and the e-file fail-closed decision.
 *
 * State discipline: import batches, employee_aca, ale snapshots, 1095 records,
 * elections and employee numbers are all restored.
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
const YEAR = 2026;
const ALICE = "a1110000-0000-0000-0000-000000000001";
const AARON = "a1110000-0000-0000-0000-000000000002";
const EL_ALICE_MED = "e4440000-0000-0000-0000-000000000001";

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "aca.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM payroll_import_batch WHERE 1=1`);
  await db.query(`DELETE FROM employee_aca WHERE 1=1`);
  await db.query(`DELETE FROM ale_monthly_snapshot WHERE 1=1`);
  await db.query(`DELETE FROM form_1095_record WHERE 1=1`);
  await db.query(
    `UPDATE employee SET employee_number = NULL WHERE id IN (UUID_TO_BIN('${ALICE}'), UUID_TO_BIN('${AARON}'))`
  );
  await db.query(
    `UPDATE employee_election SET status = 'submitted', employee_cost = NULL, employer_contribution = NULL, premium_total = NULL
      WHERE id = UUID_TO_BIN('${EL_ALICE_MED}')`
  );
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
  const db = await dbA();
  await db.query(`UPDATE employee SET employee_number = 'ACA-001' WHERE id = UUID_TO_BIN('${ALICE}')`);
  await db.query(`UPDATE employee SET employee_number = 'ACA-002' WHERE id = UUID_TO_BIN('${AARON}')`);
  // 12 monthly imports: Alice 150 hrs / $5,000; Aaron 100 hrs / $1,200 (part-time).
  const ctx = await buildAuthContext("sub-emp-admin-a");
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(Date.UTC(YEAR, m, 0)).getUTCDate();
    await employerService.importPayrollData(ctx, EMP_A, {
      source: "csv",
      periodStart: `${YEAR}-${mm}-01`,
      periodEnd: `${YEAR}-${mm}-${lastDay}`,
      rows: [
        { employeeNumber: "ACA-001", hours: 150, wages: 5000 },
        { employeeNumber: "ACA-002", hours: 100, wages: 1200 },
      ],
    });
  }
  await employerService.runAcaLookback(ctx, EMP_A, PY_2026);
});

afterAll(async () => {
  await resetTestState();
});

describe("calculateAleStatus", () => {
  test("monthly FT/FTE from imports: 1 FT + 100/120 FTE per month, not an ALE", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.calculateAleStatus(ctx, EMP_A, YEAR);
    // Alice 150 hrs = full-time; Aaron 100 hrs → FTE 100/120 = 0.83.
    expect(res.status).toBe("completed: 12 month(s) measured, avg 1.83 FT+FTE — not an ALE");

    const ws = await employerService.complianceWorkspace(ctx, EMP_A, PY_2026);
    expect(ws.complianceYear).toBe(YEAR);
    expect(ws.aca.ale.months.length).toBe(12);
    expect(ws.aca.ale.months[0]).toMatchObject({ month: "Jan", fullTime: 1, fte: "0.83" });
    expect(ws.aca.ale.aleStatus).toBe("Not an ALE");
  });
});

describe("1095-C generation + archive immutability", () => {
  test("codes derive from enrollment + lookback; filed archive rows are untouched", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await employerService.approveElection(ctx, EMP_A, PY_2026, EL_ALICE_MED);
    // Simulate a MIGRATED archive row for Aaron in a prior year.
    const db = await dbA();
    await db.query(
      `INSERT INTO form_1095_record (employee_id, tax_year, data_json, filing_status)
       VALUES (UUID_TO_BIN('${AARON}'), ${YEAR - 1}, '{"line14":"1E"}', 'filed')`
    );

    const res = await employerService.generate1095c(ctx, EMP_A, YEAR);
    expect(res.status).toBe("completed: 2 form(s) generated");

    const ws = await employerService.complianceWorkspace(ctx, EMP_A, PY_2026);
    const alice = ws.aca.forms.find((f) => f.employee === "Alice Anderson")!;
    expect(alice.line14).toBe("1E");
    expect(alice.line16).toBe("2C"); // enrolled
    const aaron = ws.aca.forms.find((f) => f.employee === "Aaron Acosta")!;
    expect(aaron.line16).toBe("2B"); // lookback: 100 hrs/mo < 130 → not full-time
    expect(aaron.acaStatus).toBe("Not full-time");

    // Regenerating the ARCHIVE year skips the filed row rather than overwriting it.
    const prior = await employerService.generate1095c(ctx, EMP_A, YEAR - 1);
    expect(prior.status).toContain("filed/archived form(s) untouched");
    const history = ws.aca.filingHistory.find((h) => h.year === String(YEAR - 1))!;
    expect(history.irsStatus).toBe("Filed (archive)");
    expect(history.partner).toBe("Legacy (migrated archive)");
  });

  test("e-filing fails closed with the decision reason", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.sendToFilingPartner(ctx, EMP_A)).rejects.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("E-filing is not enabled"),
    });
  });
});

describe("affordability (W-2 safe harbor)", () => {
  test("rate-engine premium vs wages x the year percentage; 2F only when affordable", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const ws = await employerService.complianceWorkspace(ctx, EMP_A, PY_2026);
    // Lowest self-only medical: UHC 612 × (1 − 20% ER) = $489.60/mo (same math as deductions).
    const alice = ws.aca.affordability.employees.find((e) => e.employee === "Alice Anderson")!;
    expect(alice.premium).toBe("$489.60");
    // Alice: 5000 × 9.02% = $451.00 threshold → 489.60 is UNaffordable.
    expect(alice.result).toContain("Unaffordable");
    expect(alice.safeHarborCode).toBeNull();
    // Aaron: 1200 × 9.02% = $108.24 → also unaffordable; both need review.
    expect(ws.aca.affordability.needsReview).toBe(2);
    expect(ws.aca.affordability.safeHarborMethod).toBe("W-2 wages (9.02%)");
    expect(ws.aca.issues.some((i) => i.key === "affordability_review" && i.count === 2)).toBe(true);
  });
});

describe("authorization", () => {
  test("broker/agency read the workspace; employee and cross-tenant denied; manage is employer-only", async () => {
    const broker = await buildAuthContext("sub-broker-a"); // aca.read
    const ws = await employerService.complianceWorkspace(broker, EMP_A, PY_2026);
    expect(ws.aca.forms.length).toBeGreaterThan(0);
    expect(employerService.generate1095c(broker, EMP_A, YEAR)).rejects.toMatchObject({ name: "AuthError" });

    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.complianceWorkspace(employee, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.calculateAleStatus(adminB, EMP_A, YEAR)).rejects.toMatchObject({ name: "AuthError" });
  });
});
