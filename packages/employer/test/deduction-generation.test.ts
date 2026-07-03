/**
 * Deduction-generation integration tests (Phase E-2; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves generatePayrollDeductions persists exactly the numbers the rate engine's
 * unit tests compute for the same seed fixture (engine and rows can't drift),
 * that generation is idempotent, respects pay frequency, skips rate-less plans,
 * and clears the review queue's "missing cost" issue cross-module.
 *
 * State discipline: seed elections e444…0001/0003 are approved during the run and
 * restored to submitted; rate_engine deduction rows and the test's
 * employee_payroll row are removed; election cost columns reset to NULL.
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
const EL_ALICE_MED_FAMILY = "e4440000-0000-0000-0000-000000000001"; // UHC medical, family
const EL_AARON_MED_EE = "e4440000-0000-0000-0000-000000000003"; // UHC medical, ee
const EMP_AARON = "a1110000-0000-0000-0000-000000000002";

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "payroll.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM payroll_deduction WHERE source = 'rate_engine'`);
  await db.query(
    `UPDATE employee_election
        SET status = 'submitted', review_flag = 'none', review_note = NULL,
            employee_cost = NULL, employer_contribution = NULL, premium_total = NULL
      WHERE id IN (UUID_TO_BIN('${EL_ALICE_MED_FAMILY}'), UUID_TO_BIN('${EL_AARON_MED_EE}'))`
  );
  await db.query(`DELETE FROM employee_payroll WHERE employee_id = UUID_TO_BIN('${EMP_AARON}')`);
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("generatePayrollDeductions", () => {
  test("persists the golden-master numbers for the seed fixture and clears the cost issue", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    // Approve Alice's family medical election; Aaron pays monthly (12) to prove
    // pay-frequency handling; Alice has no employee_payroll row → default 26.
    await employerService.approveElection(ctx, EMP_A, PY_2026, EL_ALICE_MED_FAMILY);
    await employerService.approveElection(ctx, EMP_A, PY_2026, EL_AARON_MED_EE);
    const db = await dbA();
    await db.query(
      `INSERT INTO employee_payroll (employee_id, pay_frequency) VALUES (UUID_TO_BIN('${EMP_AARON}'), '12')
       ON DUPLICATE KEY UPDATE pay_frequency = '12'`
    );

    const res = await employerService.generatePayrollDeductions(ctx, EMP_A, PY_2026);
    expect(res.status).toBe("completed: 2 deduction(s) generated");

    // Alice: family 1835 total, 20% EE health / 50% dep health, 26 pays —
    // the SAME fixture the rate-engine unit tests assert: 846.92 / 338.72 / 508.20.
    const [aliceRows] = await db.query(
      `SELECT cost_ee AS ee, cost_er AS er, cost_total AS total FROM payroll_deduction
        WHERE election_id = UUID_TO_BIN('${EL_ALICE_MED_FAMILY}') AND source = 'rate_engine'`
    );
    const alice = (aliceRows as any[])[0];
    expect(Number(alice.total)).toBe(846.92);
    expect(Number(alice.er)).toBe(338.72);
    expect(Number(alice.ee)).toBe(508.2);

    // Aaron: EE-only 612 monthly at 12 pays → per-pay = monthly. ER = 20% of 612.
    const [aaronRows] = await db.query(
      `SELECT cost_ee AS ee, cost_er AS er, cost_total AS total FROM payroll_deduction
        WHERE election_id = UUID_TO_BIN('${EL_AARON_MED_EE}') AND source = 'rate_engine'`
    );
    const aaron = (aaronRows as any[])[0];
    expect(Number(aaron.total)).toBe(612);
    expect(Number(aaron.er)).toBe(122.4);
    expect(Number(aaron.ee)).toBe(489.6);

    // Cross-module: the election cost columns updated, so the review queue's
    // "missing cost" issue is gone for these rows.
    const review = await employerService.electionReview(ctx, EMP_A, PY_2026);
    const aliceRow = review.rows.find((r) => r.id === EL_ALICE_MED_FAMILY)!;
    expect(aliceRow.eeCost).toBe(508.2);
    expect(aliceRow.issueType).toBe("none");
  });

  test("regeneration is idempotent: one rate_engine row per election, refreshed", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.generatePayrollDeductions(ctx, EMP_A, PY_2026);
    expect(res.status).toBe("completed: 2 deduction(s) generated");
    const db = await dbA();
    const [rows] = await db.query(
      `SELECT COUNT(*) AS n FROM payroll_deduction WHERE source = 'rate_engine'`
    );
    expect(Number((rows as any[])[0].n)).toBe(2);
  });

  test("plans without rates are skipped and counted, never guessed", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const db = await dbA();
    // Strip the medical plan's rates temporarily; restore the seed row after.
    await db.query(
      `DELETE FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN('c3330000-0000-0000-0000-000000000001')`
    );
    try {
      const res = await employerService.generatePayrollDeductions(ctx, EMP_A, PY_2026);
      expect(res.status).toContain("skipped (no usable rate/tier)");
    } finally {
      // Restore the seed rate row (values from seed-cust-employer-a.sql).
      await db.query(
        `INSERT INTO plan_rate (id, benefit_plan_id, plan_option_id, age, rate_ee, rate_ee_spouse, rate_ee_child, rate_family, effective_date)
         VALUES (UUID_TO_BIN('c5550000-0000-0000-0000-000000000001'), UUID_TO_BIN('c3330000-0000-0000-0000-000000000001'),
                 UUID_TO_BIN('c4440000-0000-0000-0000-000000000001'), NULL, 612.00, 1285.00, 1150.00, 1835.00, '2026-01-01')`
      );
    }
  });

  test("archived plan year and missing plan year fail closed", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.generatePayrollDeductions(ctx, EMP_A, PY_2025_ARCHIVED)).rejects.toMatchObject({
      name: "ValidationError",
    });
    expect(
      employerService.generatePayrollDeductions(ctx, EMP_A, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  test("broker (payroll is employer-level) and employee and cross-tenant admin are denied", async () => {
    const broker = await buildAuthContext("sub-broker-a");
    expect(employerService.generatePayrollDeductions(broker, EMP_A, PY_2026)).rejects.toMatchObject({
      name: "AuthError",
    });
    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.generatePayrollDeductions(employee, EMP_A, PY_2026)).rejects.toMatchObject({
      name: "AuthError",
    });
    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.generatePayrollDeductions(adminB, EMP_A, PY_2026)).rejects.toMatchObject({
      name: "AuthError",
    });
  });
});
