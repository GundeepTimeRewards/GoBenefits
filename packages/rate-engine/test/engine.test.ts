/**
 * Rate-engine unit tests (Phase E-2). Pure math — no DB. The seed-fixture case at
 * the bottom is the same numbers the deduction-generation integration test asserts
 * against MySQL, so the engine and the persisted rows can never drift silently.
 */
import { test, expect, describe } from "bun:test";
import { computeDeduction, perPaycheck, roundCents, splitForLine, tierTotal, type RateBand } from "../src/index";

const UHC: RateBand = { rateEe: 612, rateEeSpouse: 1285, rateEeChild: 1150, rateFamily: 1835 };
const DENTAL: RateBand = { rateEe: 38, rateEeSpouse: 72, rateEeChild: 68, rateFamily: 110 };

describe("tier + rounding primitives", () => {
  test("tierTotal picks the right column and null for unoffered tiers", () => {
    expect(tierTotal(UHC, "ee")).toBe(612);
    expect(tierTotal(UHC, "family")).toBe(1835);
    expect(tierTotal({ ...DENTAL, rateFamily: null }, "family")).toBeNull();
  });

  test("roundCents is half-up at cents", () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(1.004)).toBe(1.0);
    expect(roundCents(733.9)).toBe(733.9);
  });

  test("perPaycheck annualizes then divides; rejects bad frequencies", () => {
    expect(perPaycheck(1101.1, 12)).toBe(1101.1);
    expect(perPaycheck(1101.1, 24)).toBe(550.55);
    expect(perPaycheck(1101.1, 26)).toBe(508.2); // 13213.20 / 26
    expect(perPaycheck(100, 52)).toBe(23.08); // 1200/52 = 23.0769…
    expect(() => perPaycheck(100, 10)).toThrow(RangeError);
  });
});

describe("computeDeduction", () => {
  test("splits ER/EE per the legacy rules and derives EE so shares always sum to total", () => {
    // Seed fixture: Alice, UHC medical, FAMILY tier, 20% EE health / 50% dep health, 26 pays.
    const d = computeDeduction({
      rate: UHC,
      tier: "family",
      split: { employeePct: 20, dependentPct: 50 },
      paysPerYear: 26,
    });
    // ER monthly = 612×0.20 + (1835−612)×0.50 = 122.40 + 611.50 = 733.90
    expect(d.monthlyEr).toBe(733.9);
    expect(d.monthlyEe).toBe(1101.1);
    expect(d.monthlyTotal).toBe(1835);
    // Per-pay: 1835×12/26 = 846.92…; 733.90×12/26 = 338.72…; EE derived.
    expect(d.perPayTotal).toBe(846.92);
    expect(d.perPayEr).toBe(338.72);
    expect(d.perPayEe).toBe(508.2);
    expect(roundCents(d.perPayEe + d.perPayEr)).toBe(d.perPayTotal);
    expect(roundCents(d.monthlyEe + d.monthlyEr)).toBe(d.monthlyTotal);
  });

  test("EE-only tier has no dependent premium; 100% employer means zero deduction", () => {
    const d = computeDeduction({ rate: DENTAL, tier: "ee", split: { employeePct: 100, dependentPct: 0 }, paysPerYear: 24 });
    expect(d.monthlyEr).toBe(38);
    expect(d.monthlyEe).toBe(0);
    expect(d.perPayEe).toBe(0);
  });

  test("0% employer puts the whole premium on the employee", () => {
    const d = computeDeduction({ rate: DENTAL, tier: "family", split: { employeePct: 0, dependentPct: 0 }, paysPerYear: 12 });
    expect(d.monthlyEr).toBe(0);
    expect(d.perPayEe).toBe(110);
  });

  test("ER share is capped at the premium; invalid inputs throw", () => {
    const d = computeDeduction({ rate: DENTAL, tier: "ee", split: { employeePct: 100, dependentPct: 100 }, paysPerYear: 12 });
    expect(d.monthlyEr).toBe(38);
    expect(() => computeDeduction({ rate: DENTAL, tier: "family", split: { employeePct: 101, dependentPct: 0 }, paysPerYear: 12 })).toThrow(RangeError);
    expect(() => computeDeduction({ rate: { ...DENTAL, rateFamily: null }, tier: "family", split: { employeePct: 0, dependentPct: 0 }, paysPerYear: 12 })).toThrow(RangeError);
  });

  test("uneven cents: derived EE absorbs the rounding remainder", () => {
    const d = computeDeduction({
      rate: { rateEe: 100.01, rateEeSpouse: null, rateEeChild: null, rateFamily: 300.01 },
      tier: "family",
      split: { employeePct: 33, dependentPct: 33 },
      paysPerYear: 26,
    });
    expect(roundCents(d.perPayEe + d.perPayEr)).toBe(d.perPayTotal);
    expect(roundCents(d.monthlyEe + d.monthlyEr)).toBe(d.monthlyTotal);
  });
});

describe("splitForLine", () => {
  const RULE = {
    pctEmployeeHealth: 20, pctEmployeeDental: 25, pctEmployeeVision: 30,
    pctDependentHealth: 50, pctDependentDental: 50, pctDependentVision: 50,
  };
  test("maps health/dental/vision and defaults voluntary lines to 0%", () => {
    expect(splitForLine("medical", RULE)).toEqual({ employeePct: 20, dependentPct: 50 });
    expect(splitForLine("rx", RULE)).toEqual({ employeePct: 20, dependentPct: 50 });
    expect(splitForLine("dental", RULE)).toEqual({ employeePct: 25, dependentPct: 50 });
    expect(splitForLine("vision", RULE)).toEqual({ employeePct: 30, dependentPct: 50 });
    expect(splitForLine("voluntary_life", RULE)).toEqual({ employeePct: 0, dependentPct: 0 });
    expect(splitForLine("medical", null)).toEqual({ employeePct: 0, dependentPct: 0 });
  });
});
