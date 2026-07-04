/**
 * Plan-comparison (Decision Support) integration tests (requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the enrollment plan comparison prices each medical plan with the SAME
 * rate-engine math as deductions (recomputed inside the test — debris-proof),
 * ranks by estimated total annual cost, recommends the lowest, and enforces the
 * employee own-records guard. A second HDHP medical plan is added so the ranking
 * and savings logic is exercised, then removed.
 *
 * State discipline: the DS-TEST HDHP plan (+ its rate) is created and removed;
 * nothing else is mutated.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, getCustomerDb } from "@goben/data-access";
import { employerService } from "../src/index";
import { computeDeduction, splitForLine, estimateAnnualPlanCost, type CoverageTier } from "@goben/rate-engine";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const PY_2026 = "a2220000-0000-0000-0000-000000000002";
const PY_2025_ARCHIVED = "a2220000-0000-0000-0000-000000000001";
const AARON = "a1110000-0000-0000-0000-000000000002"; // no dependents → ee tier; linked to sub-employee-a
const ALICE = "a1110000-0000-0000-0000-000000000001"; // has dependents → family tier
const HDHP = "cddd0000-0000-0000-0000-0000000000d1";
const HDHP_RATE = "cddd0000-0000-0000-0000-0000000000d2";

const RULE = { pctEmployeeHealth: 20, pctEmployeeDental: 25, pctEmployeeVision: 30, pctDependentHealth: 50, pctDependentDental: 50, pctDependentVision: 50 };

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "benefit_plan.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN('${HDHP}')`);
  await db.query(`DELETE FROM benefit_plan WHERE id = UUID_TO_BIN('${HDHP}')`);
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
  const db = await dbA();
  // A low-premium high-deductible medical plan to compare against the seed UHC PPO.
  await db.query(
    `INSERT INTO benefit_plan (id, plan_year_id, benefit_type_key, carrier_name, plan_name, plan_code, subtype,
        hsa_eligible, deductible_single, deductible_family, oop_single, oop_family, status)
     VALUES (UUID_TO_BIN('${HDHP}'), UUID_TO_BIN('${PY_2026}'), 'medical', 'Aetna', 'DS-TEST Aetna HDHP', 'DS-HDHP', 'HDHP',
        1, 4000.00, 8000.00, 7000.00, 14000.00, 'active')`
  );
  await db.query(
    `INSERT INTO plan_rate (id, benefit_plan_id, plan_option_id, age, rate_ee, rate_ee_spouse, rate_ee_child, rate_family, effective_date)
     VALUES (UUID_TO_BIN('${HDHP_RATE}'), UUID_TO_BIN('${HDHP}'), NULL, NULL, 250.00, 520.00, 470.00, 740.00, '2026-01-01')`
  );
});

afterAll(async () => {
  await resetTestState();
});

/** Recompute the expected estimate for a plan at a tier/usage, mirroring the service. */
function expectedCost(rate: { rateEe: number; rateEeSpouse?: number | null; rateEeChild?: number | null; rateFamily?: number | null }, tier: CoverageTier, usage: "low" | "medium" | "high", deductible: number, oop: number) {
  const monthlyEe = computeDeduction({
    rate: { rateEe: rate.rateEe, rateEeSpouse: rate.rateEeSpouse ?? null, rateEeChild: rate.rateEeChild ?? null, rateFamily: rate.rateFamily ?? null },
    tier, split: splitForLine("medical", RULE), paysPerYear: 12,
  }).monthlyEe;
  return estimateAnnualPlanCost({ monthlyEmployeePremium: monthlyEe, usage, deductible, outOfPocketMax: oop });
}

const UHC = { rateEe: 612, rateEeSpouse: 1285, rateEeChild: 1150, rateFamily: 1835 };
const HDHP_R = { rateEe: 250, rateEeSpouse: 520, rateEeChild: 470, rateFamily: 740 };

describe("planComparison", () => {
  test("prices each plan with rate-engine parity and ranks by total annual cost (medium usage, ee tier)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const cmp = await employerService.planComparison(ctx, EMP_A, PY_2026, AARON, "medium");

    expect(cmp.coverageTier).toBe("ee"); // Aaron has no dependents
    expect(cmp.usage).toBe("medium");
    expect(cmp.plans.length).toBe(2);

    // UHC PPO single: deductible 1500 / OOP 4000. HDHP single: 4000 / 7000.
    const expUhc = expectedCost(UHC, "ee", "medium", 1500, 4000);
    const expHdhp = expectedCost(HDHP_R, "ee", "medium", 4000, 7000);

    const uhc = cmp.plans.find((p) => p.planName === "UHC Choice Plus PPO")!;
    const hdhp = cmp.plans.find((p) => p.planName === "DS-TEST Aetna HDHP")!;
    expect(uhc.estimatedAnnualCost).toBe(expUhc.estimatedAnnualCost);
    expect(hdhp.estimatedAnnualCost).toBe(expHdhp.estimatedAnnualCost);
    expect(uhc.annualPremium).toBe(expUhc.annualPremium);
    expect(hdhp.hsaEligible).toBe(true);

    // Sorted ascending; recommended = the lowest total; savings = costliest − recommended.
    expect(cmp.plans[0].estimatedAnnualCost).toBeLessThanOrEqual(cmp.plans[1].estimatedAnnualCost);
    expect(cmp.recommendedPlanId).toBe(cmp.plans[0].planId);
    expect(cmp.plans[0].recommended).toBe(true);
    expect(cmp.annualSavings).toBe(Math.round((cmp.plans[1].estimatedAnnualCost - cmp.plans[0].estimatedAnnualCost) * 100) / 100);
    expect(cmp.note).toContain(cmp.plans[0].planName);
  });

  test("usage changes the recommendation: HDHP wins low usage, PPO can win high usage", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const low = await employerService.planComparison(ctx, EMP_A, PY_2026, AARON, "low");
    const high = await employerService.planComparison(ctx, EMP_A, PY_2026, AARON, "high");
    // Low usage → the cheap-premium HDHP should be recommended.
    expect(low.plans.find((p) => p.recommended)!.planName).toBe("DS-TEST Aetna HDHP");
    // High usage → the PPO's lower deductible/OOP narrows or flips the gap; assert the
    // ranking is by total cost and both remain priced.
    expect(high.plans.length).toBe(2);
    expect(high.plans[0].estimatedAnnualCost).toBeLessThanOrEqual(high.plans[1].estimatedAnnualCost);
  });

  test("non-single tier uses family deductible/OOP and the tier premium", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    // Alice has one child, no spouse in the seed → ee_child (a non-single tier).
    const cmp = await employerService.planComparison(ctx, EMP_A, PY_2026, ALICE, "medium");
    expect(cmp.coverageTier).toBe("ee_child");
    const expUhc = expectedCost(UHC, "ee_child", "medium", 3000, 8000); // family ded/oop, ee_child premium
    const uhc = cmp.plans.find((p) => p.planName === "UHC Choice Plus PPO")!;
    expect(uhc.estimatedAnnualCost).toBe(expUhc.estimatedAnnualCost);
    expect(uhc.deductible).toBe(3000);
  });

  test("defaults usage to medium; unknown plan year is a ValidationError", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const cmp = await employerService.planComparison(ctx, EMP_A, PY_2026, AARON);
    expect(cmp.usage).toBe("medium");
    // Archived year has no medical plans → empty comparison, honest note (not an error).
    const archived = await employerService.planComparison(ctx, EMP_A, PY_2025_ARCHIVED, AARON, "medium");
    expect(archived.plans.length).toBe(0);
    expect(archived.recommendedPlanId).toBeNull();
    expect(archived.note).toContain("No medical plans");
    expect(employerService.planComparison(ctx, EMP_A, "00000000-0000-0000-0000-000000000000", AARON, "medium")).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("authorization", () => {
  test("employee gets their OWN comparison regardless of the employeeId passed; cross-tenant denied", async () => {
    // Employee sub-employee-a is linked to Aaron (ee tier). Passing Alice's id must
    // NOT leak Alice's family pricing — the guard resolves to the caller's own row.
    const employee = await buildAuthContext("sub-employee-a");
    const cmp = await employerService.planComparison(employee, EMP_A, PY_2026, ALICE, "medium");
    expect(cmp.employeeId).toBe(AARON); // own record, not the requested ALICE
    expect(cmp.coverageTier).toBe("ee");

    const broker = await buildAuthContext("sub-broker-a"); // benefit_plan.read
    const bc = await employerService.planComparison(broker, EMP_A, PY_2026, ALICE, "medium");
    expect(bc.employeeId).toBe(ALICE); // admins/brokers can price any employee
    expect(bc.coverageTier).toBe("ee_child");

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.planComparison(adminB, EMP_A, PY_2026, AARON, "medium")).rejects.toMatchObject({ name: "AuthError" });
  });
});
