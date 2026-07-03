/**
 * Plan Year Setup checklist — PURE derivation tests (Phase D-1). No DB; feeds
 * deriveStepStatus / deriveChecklist synthetic catalog + overrides + domain state.
 */
import { test, expect, describe } from "bun:test";
import {
  deriveStepStatus,
  deriveChecklist,
  type StepDefinition,
  type StepOverride,
  type DomainState,
} from "../src/plan-year-checklist";

function def(stepKey: string, over: Partial<StepDefinition> = {}): StepDefinition {
  return {
    stepKey,
    label: stepKey,
    description: null,
    category: "Cat",
    displayOrder: over.displayOrder ?? 1,
    requiredByDefault: over.requiredByDefault ?? true,
    route: "/x",
    ...over,
  };
}
const EMPTY: DomainState = { planYearExists: true, planYearStatus: "setup", employeeCount: 0 };
const POPULATED: DomainState = { planYearExists: true, planYearStatus: "active", employeeCount: 5 };

describe("deriveStepStatus (v1 rules)", () => {
  test("census_imported reflects employee count", () => {
    expect(deriveStepStatus(def("census_imported"), { ...EMPTY, employeeCount: 0 })).toBe("not_started");
    expect(deriveStepStatus(def("census_imported"), { ...EMPTY, employeeCount: 3 })).toBe("complete");
  });
  test("readiness_review reflects plan-year status", () => {
    expect(deriveStepStatus(def("readiness_review"), { ...EMPTY, planYearStatus: "setup" })).toBe("not_started");
    expect(deriveStepStatus(def("readiness_review"), { ...EMPTY, planYearStatus: "active" })).toBe("complete");
  });
  test("domains not yet wired return not_started (never faked)", () => {
    for (const k of ["plans_configured", "rates_configured", "contributions_configured", "documents_configured", "window_configured"]) {
      expect(deriveStepStatus(def(k), POPULATED)).toBe("not_started");
    }
  });
});

describe("deriveChecklist", () => {
  const catalog = [
    def("census_imported", { displayOrder: 1, requiredByDefault: true }),
    def("plans_configured", { displayOrder: 2, requiredByDefault: true }),
    def("options_configured", { displayOrder: 3, requiredByDefault: false }),
    def("readiness_review", { displayOrder: 4, requiredByDefault: true }),
  ];

  test("empty domain → everything not_started, completionPct 0, blockers 0", () => {
    const r = deriveChecklist("emp", "py", catalog, [], EMPTY);
    expect(r.steps.every((s) => s.status === "not_started")).toBe(true);
    expect(r.completionPct).toBe(0);
    expect(r.blockers).toBe(0);
    expect(r.employerId).toBe("emp");
    expect(r.planYearId).toBe("py");
  });

  test("populated domain derives census + readiness complete; pct is required-based, server-computed", () => {
    const r = deriveChecklist("emp", "py", catalog, [], POPULATED);
    const byKey = Object.fromEntries(r.steps.map((s) => [s.key, s.status]));
    expect(byKey.census_imported).toBe("complete");
    expect(byKey.readiness_review).toBe("complete");
    expect(byKey.plans_configured).toBe("not_started");
    // required-applicable = census, plans, readiness (options is optional). 2 of 3 complete.
    expect(r.completionPct).toBe(Math.round((100 * 2) / 3));
    expect(r.blockers).toBe(0);
  });

  test("steps come back in display order and use GraphQL field names (key)", () => {
    const r = deriveChecklist("emp", "py", catalog, [], POPULATED);
    expect(r.steps.map((s) => s.key)).toEqual(["census_imported", "plans_configured", "options_configured", "readiness_review"]);
    expect(r.steps[0]).toHaveProperty("key");
    expect(r.steps[0]).not.toHaveProperty("stepKey");
  });

  describe("overrides", () => {
    const ov = (stepKey: string, o: Partial<StepOverride> = {}): StepOverride => ({
      stepKey, overrideStatus: null, isHidden: false, isRequiredOverride: null, notes: null, ...o,
    });

    test("hidden override drops the step entirely (excluded from output + math)", () => {
      const r = deriveChecklist("emp", "py", catalog, [ov("plans_configured", { isHidden: true })], POPULATED);
      expect(r.steps.find((s) => s.key === "plans_configured")).toBeUndefined();
      // now required-applicable = census, readiness → both complete → 100%
      expect(r.completionPct).toBe(100);
    });

    test("not_applicable override sets status and excludes from denominator", () => {
      const r = deriveChecklist("emp", "py", catalog, [ov("plans_configured", { overrideStatus: "not_applicable", notes: "No medical this year" })], POPULATED);
      const step = r.steps.find((s) => s.key === "plans_configured")!;
      expect(step.status).toBe("not_applicable");
      expect(step.message).toBe("No medical this year"); // override note surfaces as message
      expect(r.completionPct).toBe(100); // census + readiness are the only required-applicable, both complete
    });

    test("acknowledged override marks the step complete", () => {
      const r = deriveChecklist("emp", "py", catalog, [ov("plans_configured", { overrideStatus: "acknowledged" })], POPULATED);
      expect(r.steps.find((s) => s.key === "plans_configured")!.status).toBe("complete");
      expect(r.completionPct).toBe(100); // all three required now complete
    });

    test("is_required_override=false removes a step from the required denominator", () => {
      // Without override: census+plans+readiness required, 2/3 complete.
      // Mark plans not-required → required-applicable = census+readiness, both complete → 100%.
      const r = deriveChecklist("emp", "py", catalog, [ov("plans_configured", { isRequiredOverride: false })], POPULATED);
      expect(r.completionPct).toBe(100);
      // requiredByDefault (the displayed default) is unchanged for the step.
      expect(r.steps.find((s) => s.key === "plans_configured")!.requiredByDefault).toBe(true);
    });
  });

  test("no required steps → completionPct 0 (no divide-by-zero)", () => {
    const optionalOnly = [def("options_configured", { requiredByDefault: false })];
    const r = deriveChecklist("emp", "py", optionalOnly, [], POPULATED);
    expect(r.completionPct).toBe(0);
    expect(r.blockers).toBe(0);
  });
});
