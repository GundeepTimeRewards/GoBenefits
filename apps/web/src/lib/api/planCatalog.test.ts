// Plans & Rates (Phase D-2) FE seam tests: live→mock display mappers and the hybrid
// gate (both/all ids must be live UUIDs). Pure — no render harness.
import { test, expect, describe } from "bun:test";
import { mapPlanCatalog, mapBenefitPlanDetail, type LivePlanCatalog, type LiveBenefitPlanDetail } from "./liveMappers";
import { decideDataSource, decidePlanYearScopedSource, isLiveId } from "./dataSource";

const LIVE_EMP = "eeee0000-0000-0000-0000-0000000000a1";
const LIVE_PY = "a2220000-0000-0000-0000-000000000002";
const LIVE_PLAN = "c3330000-0000-0000-0000-000000000001";

const liveCatalog: LivePlanCatalog = {
  employerId: LIVE_EMP, planYearId: LIVE_PY, readOnly: false,
  summary: { total: 2, ready: 2, missingRates: 0, missingContributions: 0, missingDocuments: 2, launchBlockers: 0 },
  plans: [
    { planId: "m", name: "UHC PPO", carrier: "UHC", line: "medical", benefitType: "Medical", subtype: "PPO",
      status: "ready", effective: "2026-01-01", enrolled: 0, coverageTiers: 4, rateStatus: "complete",
      contributionStatus: "configured", contributionRule: "Standard", documentStatus: "missing",
      eligibleClasses: "Full-Time", launchBlocker: false, warnings: [] },
    { planId: "d", name: "Guardian", carrier: "Guardian", line: "dental", benefitType: "Dental", subtype: "PPO",
      status: "missing_rates", effective: null, enrolled: 0, coverageTiers: 0, rateStatus: "missing",
      contributionStatus: "missing", contributionRule: null, documentStatus: "missing",
      eligibleClasses: null, launchBlocker: true, warnings: ["Rates not loaded"] },
  ],
};

describe("mapPlanCatalog (live → mock display shape)", () => {
  const cat = mapPlanCatalog(liveCatalog);
  test("summary passes through; readOnly preserved", () => {
    expect(cat.summary).toEqual(liveCatalog.summary);
    expect(cat.readOnly).toBe(false);
  });
  test("enum/status keys are display-cased", () => {
    const m = cat.rows[0];
    expect(m.line).toBe("Medical");
    expect(m.status).toBe("Ready");
    expect(m.rateStatus).toBe("Complete");
    expect(m.contributionStatus).toBe("Configured");
    expect(m.documentStatus).toBe("Missing");
    const d = cat.rows[1];
    expect(d.status).toBe("Missing Rates");
    expect(d.rateStatus).toBe("Missing");
    expect(d.contributionStatus).toBe("Missing");
    expect(d.contributionRule).toBe("Not configured");
    expect(d.launchBlocker).toBe(true);
    expect(d.eligibleClasses).toBe("");
  });
  test("row id maps from planId; warnings preserved", () => {
    expect(cat.rows[0].id).toBe("m");
    expect(cat.rows[1].warnings).toEqual(["Rates not loaded"]);
  });
});

describe("mapBenefitPlanDetail (live → mock display shape)", () => {
  const live: LiveBenefitPlanDetail = {
    planId: "m", name: "UHC PPO", carrier: "UHC", line: "medical", subtype: "PPO", network: "Nat'l",
    fundingType: null, effective: "2026-01-01", renewalDate: null, enrolled: 0, status: "active",
    benefits: [{ label: "Deductible", inNetwork: "$1,500.00", outNetwork: "—" }],
    rates: [{ tier: "Employee Only", total: "$612.00", employer: "$489.60", employee: "$122.40" }],
    contributions: [{ tier: "All Tiers", employer: "80%", employee: "20%" }],
    eligibility: [{ class: "Full-Time", waiting: "First of month after 30 days", note: "30+ hours/week" }],
    documents: [],
  };
  test("display line + preserved rates/contributions/eligibility; nulls → empty strings", () => {
    const d = mapBenefitPlanDetail(live);
    expect(d.line).toBe("Medical");
    expect(d.type).toBe("Medical");
    expect(d.id).toBe("m");
    expect(d.fundingType).toBe("");
    expect(d.renewalDate).toBe("");
    expect(d.rates[0].employee).toBe("$122.40");
    expect(d.contributions[0]).toEqual({ tier: "All Tiers", employer: "80%", employee: "20%" });
    expect(d.eligibility[0].class).toBe("Full-Time");
    expect(d.setupIssues).toEqual([]);
  });
});

describe("D-2 hybrid gate (id-space safety)", () => {
  test("planCatalog + benefitPlanDetail are live-capable at the employer dimension", () => {
    expect(decideDataSource("hybrid", true, "planCatalog", LIVE_EMP)).toBe("live");
    expect(decideDataSource("hybrid", true, "benefitPlanDetail", LIVE_EMP)).toBe("live");
  });
  test("planCatalog live requires live employer AND live plan year", () => {
    expect(decidePlanYearScopedSource("hybrid", true, "planCatalog", LIVE_EMP, LIVE_PY)).toBe("live");
    expect(decidePlanYearScopedSource("hybrid", true, "planCatalog", LIVE_EMP, "2026")).toBe("mock");
  });
  test("benefitPlanDetail additionally requires a live planId (composed in the hook)", () => {
    // The hook composes: scoped source === live AND isLiveId(planId).
    const scoped = decidePlanYearScopedSource("hybrid", true, "benefitPlanDetail", LIVE_EMP, LIVE_PY) === "live";
    expect(scoped && isLiveId(LIVE_PLAN)).toBe(true);
    expect(scoped && isLiveId("1")).toBe(false); // mock plan slug → mock
  });
});
