/**
 * Plans & Rates PURE derivation tests (Phase D-2). No DB — feeds buildPlanCatalog /
 * buildPlanDetail / detailRates synthetic rows.
 */
import { test, expect, describe } from "bun:test";
import {
  coverageLineOf,
  deriveCatalogRow,
  buildPlanCatalog,
  detailRates,
  detailContributions,
  buildPlanDetail,
  type BenefitPlanRow,
  type ContributionRuleRow,
  type PlanRateRow,
} from "../src/plan-catalog";

const RULE: ContributionRuleRow = {
  name: "standard", displayName: "Standard", pctEmployeeHealth: 20, pctEmployeeDental: 25, pctEmployeeVision: 30,
};

function plan(over: Partial<BenefitPlanRow> = {}): BenefitPlanRow {
  return {
    planId: "p1", planName: "UHC PPO", carrierName: "UHC", benefitTypeKey: "medical", subtype: "PPO", network: "Nat'l",
    setupStatus: "complete", status: "active", deductibleSingle: 1500, deductibleFamily: 3000, oopSingle: 4000,
    oopFamily: 8000, pcpCopay: "$25", specialistCopay: "$50", effective: "2026-01-01", rateTierCount: 4,
    optionCount: 1, documentCount: 0, enrolled: 0, eligibleClasses: ["Full-Time"], ...over,
  };
}
const types = [{ keyName: "medical", label: "Medical" }, { keyName: "dental", label: "Dental" }];

describe("coverageLineOf (benefit_type key → CoverageLine, not 1:1)", () => {
  test("maps known types; voluntary_life→vol_life, hospital_indemnity→hospital", () => {
    expect(coverageLineOf("medical")).toBe("medical");
    expect(coverageLineOf("voluntary_life")).toBe("vol_life");
    expect(coverageLineOf("hospital_indemnity")).toBe("hospital");
  });
  test("types with no CoverageLine (out of D-2 scope) → null", () => {
    for (const k of ["hsa", "fsa", "dcfsa", "commuter", "retirement", "other"]) expect(coverageLineOf(k)).toBeNull();
  });
});

describe("deriveCatalogRow", () => {
  test("fully-configured plan → ready, no blocker, missing docs only", () => {
    const r = deriveCatalogRow(plan(), "medical", "Medical", RULE);
    expect(r.rateStatus).toBe("complete");
    expect(r.contributionStatus).toBe("configured");
    expect(r.documentStatus).toBe("missing"); // no documents seeded
    expect(r.launchBlocker).toBe(false); // missing docs is a warning, not a blocker
    expect(r.status).toBe("ready");
    expect(r.eligibleClasses).toBe("Full-Time");
    expect(r.contributionRule).toBe("Standard");
  });
  test("missing rates → launch blocker + missing_rates status", () => {
    const r = deriveCatalogRow(plan({ rateTierCount: 0 }), "medical", "Medical", RULE);
    expect(r.rateStatus).toBe("missing");
    expect(r.launchBlocker).toBe(true);
    expect(r.status).toBe("missing_rates");
    expect(r.warnings).toContain("Rates not loaded");
  });
  test("non-voluntary missing contributions → blocker; voluntary line is not blocked", () => {
    expect(deriveCatalogRow(plan(), "medical", "Medical", null).launchBlocker).toBe(true);
    const vol = deriveCatalogRow(plan({ benefitTypeKey: "accident" }), "accident", "Accident", null);
    expect(vol.contributionStatus).toBe("configured"); // voluntary → employee-paid, not missing
    expect(vol.launchBlocker).toBe(false);
    expect(vol.contributionRule).toBe("Employee-paid (100%)");
  });
});

describe("buildPlanCatalog", () => {
  test("summary counts + read-only from plan-year status; omits types with no CoverageLine", () => {
    const plans = [
      plan({ planId: "m", benefitTypeKey: "medical" }),
      plan({ planId: "d", benefitTypeKey: "dental", rateTierCount: 0 }),
      plan({ planId: "x", benefitTypeKey: "hsa" }), // no CoverageLine → dropped
    ];
    const cat = buildPlanCatalog("emp", "py", "active", plans, types, RULE);
    expect(cat.plans.length).toBe(2); // hsa omitted (out of scope)
    expect(cat.summary.total).toBe(2);
    expect(cat.summary.missingRates).toBe(1); // dental has no rates
    expect(cat.summary.launchBlockers).toBe(1);
    expect(cat.readOnly).toBe(false);
    expect(buildPlanCatalog("emp", "py", "archived", plans, types, RULE).readOnly).toBe(true);
  });
});

describe("detailRates / detailContributions (employer-employee split)", () => {
  const rates: PlanRateRow[] = [
    { rateEe: 612, rateEeSpouse: 1285, rateEeChild: 1150, rateFamily: 1835, effectiveDate: "2026-01-01" },
  ];
  test("medical: employee = 20% of total; employer = remainder; all four tiers", () => {
    const rows = detailRates("medical", rates, RULE);
    expect(rows.length).toBe(4);
    expect(rows[0]).toEqual({ tier: "Employee Only", total: "$612.00", employer: "$489.60", employee: "$122.40" });
    expect(detailContributions("medical", RULE)).toEqual([{ tier: "All Tiers", employer: "80%", employee: "20%" }]);
  });
  test("voluntary line: 100% employee, 0% employer regardless of rule", () => {
    expect(detailContributions("accident", RULE)).toEqual([{ tier: "All Tiers", employer: "0%", employee: "100%" }]);
  });
  test("no contribution rule (non-voluntary): split unknown → em-dashes, no crash", () => {
    const rows = detailRates("medical", rates, null);
    expect(rows[0].employer).toBe("—");
    expect(detailContributions("medical", null)).toEqual([]);
  });
  test("no rate rows → empty rate list", () => {
    expect(detailRates("medical", [], RULE)).toEqual([]);
  });
});

describe("buildPlanDetail", () => {
  test("composes benefits from typed columns, rates, contributions, eligibility; empty docs", () => {
    const det = buildPlanDetail(plan(), "medical", [
      { rateEe: 612, rateEeSpouse: null, rateEeChild: null, rateFamily: 1835, effectiveDate: "2026-01-01" },
    ], RULE, [{ name: "Full-Time", waitingPeriodDays: 30, minHoursWeekly: 30 }]);
    expect(det.benefits.find((b) => b.label === "Deductible (Individual)")?.inNetwork).toBe("$1,500.00");
    expect(det.rates.map((r) => r.tier)).toEqual(["Employee Only", "Family"]); // only non-null tiers
    expect(det.eligibility[0]).toEqual({ class: "Full-Time", waiting: "First of month after 30 days", note: "30+ hours/week" });
    expect(det.documents).toEqual([]);
  });
});
