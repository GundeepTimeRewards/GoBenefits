/**
 * Decision-support estimator unit tests (pure math — no DB). These lock the
 * total-cost-of-care model the enrollment comparison + its UI copy depend on.
 */
import { test, expect, describe } from "bun:test";
import {
  estimateMemberOutOfPocket,
  estimateAnnualPlanCost,
  BILLED_CARE_BY_USAGE,
  DEFAULT_COINSURANCE,
} from "../src/index";

describe("estimateMemberOutOfPocket", () => {
  test("below the deductible: member pays the full billed amount", () => {
    // $1,000 billed, $1,500 deductible → all $1,000 is member's.
    expect(estimateMemberOutOfPocket({ billed: 1000, deductible: 1500, outOfPocketMax: 8000 })).toBe(1000);
  });

  test("above the deductible: deductible + 20% coinsurance on the remainder", () => {
    // $6,000 billed, $1,500 deductible → 1500 + 0.2×4500 = 2400.
    expect(estimateMemberOutOfPocket({ billed: 6000, deductible: 1500, outOfPocketMax: 8000 })).toBe(2400);
  });

  test("capped at the out-of-pocket max", () => {
    // $25,000 billed, $1,500 deductible → 1500 + 0.2×23500 = 6200, but OOP max 4000 caps it.
    expect(estimateMemberOutOfPocket({ billed: 25000, deductible: 1500, outOfPocketMax: 4000 })).toBe(4000);
  });

  test("never exceeds the billed amount (low usage, zero deductible)", () => {
    expect(estimateMemberOutOfPocket({ billed: 800, deductible: 0, outOfPocketMax: 5000 })).toBe(160); // 20% of 800
  });

  test("null deductible = first-dollar (0); null OOP max = uncapped", () => {
    // $10,000 billed, no deductible → 20% of 10,000 = 2,000; no cap.
    expect(estimateMemberOutOfPocket({ billed: 10000, deductible: null, outOfPocketMax: null })).toBe(2000);
  });

  test("coinsurance override", () => {
    // $6,000 billed, $1,500 deductible, 0% coinsurance → just the deductible.
    expect(estimateMemberOutOfPocket({ billed: 6000, deductible: 1500, outOfPocketMax: 8000, coinsurance: 0 })).toBe(1500);
  });
});

describe("estimateAnnualPlanCost", () => {
  test("annual premium + estimated care, both surfaced", () => {
    // $489.60/mo premium, medium usage ($6,000 billed), $1,500 ded / $8,000 OOP.
    const e = estimateAnnualPlanCost({ monthlyEmployeePremium: 489.6, usage: "medium", deductible: 1500, outOfPocketMax: 8000 });
    expect(e.annualPremium).toBe(5875.2); // 489.60 × 12
    expect(e.estimatedCareCost).toBe(2400); // 1500 + 0.2×4500
    expect(e.estimatedAnnualCost).toBe(8275.2);
  });

  test("a cheaper-premium high-deductible plan can win at low usage and lose at high usage", () => {
    // HDHP: low premium ($150/mo), high deductible/OOP. PPO: higher premium ($400/mo), low deductible/OOP.
    const hdhp = { monthlyEmployeePremium: 150, deductible: 4000, outOfPocketMax: 8000 };
    const ppo = { monthlyEmployeePremium: 400, deductible: 500, outOfPocketMax: 3000 };
    const lowH = estimateAnnualPlanCost({ ...hdhp, usage: "low" });
    const lowP = estimateAnnualPlanCost({ ...ppo, usage: "low" });
    expect(lowH.estimatedAnnualCost).toBeLessThan(lowP.estimatedAnnualCost); // HDHP wins for the healthy

    const highH = estimateAnnualPlanCost({ ...hdhp, usage: "high" });
    const highP = estimateAnnualPlanCost({ ...ppo, usage: "high" });
    expect(highP.estimatedAnnualCost).toBeLessThan(highH.estimatedAnnualCost); // PPO wins for the sick
  });

  test("model constants are the documented buckets", () => {
    expect(BILLED_CARE_BY_USAGE).toEqual({ low: 1000, medium: 6000, high: 25000 });
    expect(DEFAULT_COINSURANCE).toBe(0.2);
  });
});
