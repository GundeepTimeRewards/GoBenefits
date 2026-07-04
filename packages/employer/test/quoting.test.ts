/**
 * Quoting integration tests (Phase F-3; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the legacy Step1–5 census-composition proposal: active employees are
 * tiered from their dependents, each candidate plan is costed via the SAME rate
 * engine as deductions, and the per-plan aggregate is persisted. The expected
 * figures are recomputed from a live census snapshot inside the test — so
 * accumulated test employees/dependents can never make the assertion brittle.
 *
 * State discipline: quotes created here are removed (quote_line cascades).
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, getCustomerDb } from "@goben/data-access";
import { employerService } from "../src/index";
import { computeDeduction, splitForLine, roundCents, type CoverageTier } from "@goben/rate-engine";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const PY_2026 = "a2220000-0000-0000-0000-000000000002";
const PY_2025_ARCHIVED = "a2220000-0000-0000-0000-000000000001";
const PLAN_MEDICAL = "c3330000-0000-0000-0000-000000000001"; // UHC PPO (composite rates)
const PLAN_DENTAL = "c3330000-0000-0000-0000-000000000002"; // Guardian dental

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "rate.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM quote WHERE 1=1`); // quote_line cascades
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

/** Recompute the expected medical line straight from the DB census, mirroring the service. */
async function expectedMedicalLine() {
  const db = await dbA();
  const [rows] = await db.query(
    `SELECT SUM(d.relationship IN ('spouse','domestic_partner')) AS spouses, SUM(d.relationship = 'child') AS children
     FROM employee e
     JOIN employee_employment em ON em.employee_id = e.id AND em.status = 'active'
     LEFT JOIN dependent d ON d.employee_id = e.id
     GROUP BY e.id`
  );
  const [rateRows] = await db.query(
    `SELECT rate_ee AS rateEe, rate_ee_spouse AS rateEeSpouse, rate_ee_child AS rateEeChild, rate_family AS rateFamily
     FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN('${PLAN_MEDICAL}') AND age IS NULL
     ORDER BY effective_date DESC LIMIT 1`
  );
  const rate = (rateRows as any[])[0];
  const band = {
    rateEe: Number(rate.rateEe),
    rateEeSpouse: rate.rateEeSpouse == null ? null : Number(rate.rateEeSpouse),
    rateEeChild: rate.rateEeChild == null ? null : Number(rate.rateEeChild),
    rateFamily: rate.rateFamily == null ? null : Number(rate.rateFamily),
  };
  const split = splitForLine("medical", { pctEmployeeHealth: 20, pctEmployeeDental: 25, pctEmployeeVision: 30, pctDependentHealth: 50, pctDependentDental: 50, pctDependentVision: 50 });
  let total = 0, er = 0, ee = 0, count = 0;
  for (const r of rows as any[]) {
    const spouse = Number(r.spouses) > 0, child = Number(r.children) > 0;
    const tier: CoverageTier = spouse && child ? "family" : spouse ? "ee_spouse" : child ? "ee_child" : "ee";
    const d = computeDeduction({ rate: band, tier, split, paysPerYear: 12 });
    total += d.monthlyTotal; er += d.monthlyEr; ee += d.monthlyEe; count += 1;
  }
  return { total: roundCents(total), er: roundCents(er), ee: roundCents(ee), count };
}

describe("generateQuote (legacy Step1–5 census composition)", () => {
  test("costs every active employee at their composed tier and aggregates per plan", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const expected = await expectedMedicalLine();

    const quote = await employerService.generateQuote(ctx, { employerId: EMP_A, planYearId: PY_2026, planIds: [PLAN_MEDICAL, PLAN_DENTAL] });
    expect(quote.id).toBeTruthy();
    expect(quote.lines.length).toBe(2);

    const medical = quote.lines.find((l) => l.planId === PLAN_MEDICAL)!;
    expect(medical.line).toBe("medical");
    expect(medical.monthlyTotal).toBe(expected.total);
    expect(medical.employerCost).toBe(expected.er);
    expect(medical.employeeCost).toBe(expected.ee);
    // Employer + employee reconcile to the total (rate-engine invariant, preserved in aggregate).
    expect(roundCents(medical.employerCost + medical.employeeCost)).toBe(medical.monthlyTotal);

    // Persisted: census_count reflects the active roster costed.
    const db = await dbA();
    const [qRows] = await db.query(`SELECT census_count AS n FROM quote WHERE id = UUID_TO_BIN('${quote.id}')`);
    expect(Number((qRows as any[])[0].n)).toBe(expected.count);
  });

  test("validation: empty plan list, foreign plans, archived year", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.generateQuote(ctx, { employerId: EMP_A, planYearId: PY_2026, planIds: [] })).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.generateQuote(ctx, { employerId: EMP_A, planYearId: PY_2026, planIds: ["00000000-0000-0000-0000-000000000000"] })).rejects.toMatchObject({ name: "ValidationError" });
    // Archived plan year has no plans of its own → "none belong to this plan year".
    expect(employerService.generateQuote(ctx, { employerId: EMP_A, planYearId: PY_2025_ARCHIVED, planIds: [PLAN_MEDICAL] })).rejects.toMatchObject({ name: "ValidationError" });
  });

  test("authorization: broker quotes; employee and cross-tenant admin denied", async () => {
    const broker = await buildAuthContext("sub-broker-a"); // rate.manage
    const quote = await employerService.generateQuote(broker, { employerId: EMP_A, planYearId: PY_2026, planIds: [PLAN_MEDICAL] });
    expect(quote.lines.length).toBe(1);

    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.generateQuote(employee, { employerId: EMP_A, planYearId: PY_2026, planIds: [PLAN_MEDICAL] })).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.generateQuote(adminB, { employerId: EMP_A, planYearId: PY_2026, planIds: [PLAN_MEDICAL] })).rejects.toMatchObject({ name: "AuthError" });
  });
});
