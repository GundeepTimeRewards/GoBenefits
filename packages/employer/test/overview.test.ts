/**
 * Employer Overview rollup — PURE composition tests (Phase D-4). No DB; feeds
 * buildEmployerOverview / deriveNeedsAttention synthetic aggregate inputs.
 */
import { test, expect, describe } from "bun:test";
import { buildEmployerOverview, deriveNeedsAttention, type OverviewInputs } from "../src/overview";
import type { PlanYearSetupStatus, ChecklistStep } from "../src/plan-year-checklist";
import type { CatalogRow } from "../src/plan-catalog";
import type { EnrollmentCounts } from "../src/enrollment";

const step = (o: Partial<ChecklistStep> & { key: string; status: ChecklistStep["status"] }): ChecklistStep => ({
  label: o.key, description: null, category: "People", requiredByDefault: true, route: "census", message: null, ...o,
});
const checklist = (steps: ChecklistStep[], completionPct = 53, blockers = 0): PlanYearSetupStatus => ({
  employerId: "e", planYearId: "py", completionPct, blockers, steps,
});
const counts = (o: Partial<EnrollmentCounts> = {}): EnrollmentCounts => ({
  eligible: 4, invited: 3, submittedEmployees: 2, inProgressEmployees: 1, waivedCount: 1, byLine: [],
  hasEvent: true, eventName: null, eventType: null, hasWindow: true, windowStart: null, windowEnd: null, windowOpen: true,
  planYearStatus: "active", ...o,
});
const plan = (o: Partial<CatalogRow> & { planId: string }): CatalogRow => ({
  name: o.planId, carrier: "UHC", line: "medical", benefitType: "Medical", subtype: null, status: "ready",
  effective: null, enrolled: 0, coverageTiers: 4, rateStatus: "complete", contributionStatus: "configured",
  contributionRule: "Standard", documentStatus: "missing", eligibleClasses: "Full-Time", launchBlocker: false, warnings: [], ...o,
});

const inputs = (over: Partial<OverviewInputs> = {}): OverviewInputs => ({
  employerId: "e", planYearId: "py", planYearLabel: "PY 2026", planYearStatus: "active",
  checklist: checklist([step({ key: "census_imported", status: "complete" })]),
  catalogPlans: [plan({ planId: "m" }), plan({ planId: "d", line: "dental" })],
  counts: counts(), ...over,
});

describe("buildEmployerOverview", () => {
  test("composes KPIs from the aggregates", () => {
    const o = buildEmployerOverview(inputs());
    expect(o.planYearLabel).toBe("PY 2026");
    expect(o.planYearStatus).toBe("active");
    expect(o.eligibleEmployees).toBe(4);
    expect(o.enrolled).toBe(2); // submittedEmployees
    expect(o.waived).toBe(1);
    expect(o.benefitPlans).toBe(2);
    expect(o.setupReadinessPct).toBe(53); // checklist completionPct
    expect(o.enrollmentPct).toBe(50); // 2/4
    expect(o.launchBlockers).toBe(0);
  });
  test("empty employer → zeros, no divide-by-zero", () => {
    const o = buildEmployerOverview(inputs({
      planYearLabel: null, planYearStatus: null, catalogPlans: [],
      checklist: checklist([], 0, 0), counts: counts({ eligible: 0, submittedEmployees: 0, waivedCount: 0 }),
    }));
    expect(o.planYearLabel).toBe("");
    expect(o.planYearStatus).toBe("setup");
    expect(o.eligibleEmployees).toBe(0);
    expect(o.enrollmentPct).toBe(0);
    expect(o.benefitPlans).toBe(0);
  });
});

describe("deriveNeedsAttention", () => {
  test("only blocked/needs_attention steps surface; severity high/medium; message folds into title", () => {
    const cl = checklist([
      step({ key: "a", status: "complete" }), // excluded
      step({ key: "rates_configured", status: "needs_attention", label: "Rates", message: "vision missing" }),
      step({ key: "carrier", status: "blocked", label: "Carrier" }),
    ]);
    const items = deriveNeedsAttention(cl, []);
    expect(items.map((i) => i.key)).toEqual(["rates_configured", "carrier"]);
    expect(items[0]).toMatchObject({ severity: "medium", title: "Rates: vision missing" });
    expect(items[1]).toMatchObject({ severity: "high", title: "Carrier" });
  });
  test("plan launch blockers add high-severity items", () => {
    const items = deriveNeedsAttention(checklist([]), [plan({ planId: "m", launchBlocker: true, warnings: ["Rates not loaded"] })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "plan:m", severity: "high", route: "benefit-plans" });
    expect(items[0].title).toContain("Rates not loaded");
  });
  test("clean state → no attention items", () => {
    expect(deriveNeedsAttention(checklist([step({ key: "a", status: "complete" })]), [plan({ planId: "m" })])).toEqual([]);
  });
});
