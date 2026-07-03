// Plan Year Setup (Phase D-1) FE seam tests: live→view mapper, mock summarizer, and
// that the mock path still yields the wrapped shape the page consumes. Pure (no render
// harness in this repo) — asserts the exact data the component reads.
import { test, expect, describe } from "bun:test";
import { mapPlanYearSetupStatus, type LivePlanYearSetupStatus } from "./liveMappers";
import { summarizeChecklist, type ChecklistStep } from "@/lib/plan-year-checklist-mock";
import { getPlanYearChecklist } from "@/lib/mock/db";
import { DATA_SOURCE_MODE } from "./dataSource";

const step = (o: Partial<ChecklistStep> & { stepKey: string }): ChecklistStep => ({
  label: o.stepKey, description: "", category: "", requiredByDefault: true, route: "/x",
  status: "not_started", ...o,
});

describe("mapPlanYearSetupStatus (live → view)", () => {
  const live: LivePlanYearSetupStatus = {
    employerId: "eeee0000-0000-0000-0000-0000000000a1",
    planYearId: "a2220000-0000-0000-0000-000000000002",
    completionPct: 13,
    blockers: 0,
    steps: [
      { key: "census_imported", label: "Census", description: "d", category: "People", requiredByDefault: true, status: "complete", route: "/census", message: null },
      { key: "waivers_reviewed", label: "Waivers", description: null, category: "Enrollment", requiredByDefault: false, status: "not_applicable", route: "/x", message: "No waivers expected" },
      { key: "rates_configured", label: "Rates", description: null, category: "Rates", requiredByDefault: true, status: "needs_attention", route: "/r", message: "Vision rates missing" },
    ],
  };

  test("preserves completionPct and blockers verbatim (server-authoritative)", () => {
    const v = mapPlanYearSetupStatus(live);
    expect(v.completionPct).toBe(13);
    expect(v.blockers).toBe(0);
  });

  test("maps steps: key→stepKey, statuses pass through, in display order", () => {
    const v = mapPlanYearSetupStatus(live);
    expect(v.steps.map((s) => s.stepKey)).toEqual(["census_imported", "waivers_reviewed", "rates_configured"]);
    expect(v.steps[0].status).toBe("complete");
    expect(v.steps[0]).not.toHaveProperty("key");
  });

  test("N/A step's message routes to overrideNote; real warnings stay as message", () => {
    const v = mapPlanYearSetupStatus(live);
    const waivers = v.steps.find((s) => s.stepKey === "waivers_reviewed")!;
    expect(waivers.overrideNote).toBe("No waivers expected");
    expect(waivers.message).toBeUndefined();
    const rates = v.steps.find((s) => s.stepKey === "rates_configured")!;
    expect(rates.message).toBe("Vision rates missing");
    expect(rates.overrideNote).toBeUndefined();
  });
});

describe("summarizeChecklist (mock/fallback rollup)", () => {
  test("required-based completionPct; complete over required-applicable", () => {
    const steps = [
      step({ stepKey: "a", requiredByDefault: true, status: "complete" }),
      step({ stepKey: "b", requiredByDefault: true, status: "not_started" }),
      step({ stepKey: "c", requiredByDefault: false, status: "not_started" }), // optional, excluded
      step({ stepKey: "d", requiredByDefault: true, status: "not_applicable" }), // N/A, excluded
    ];
    // required-applicable = a, b (2). complete = a (1). → 50%
    expect(summarizeChecklist(steps).completionPct).toBe(50);
  });

  test("blockers count blocked + needs_attention required steps (positive case)", () => {
    const steps = [
      step({ stepKey: "a", requiredByDefault: true, status: "blocked" }),
      step({ stepKey: "b", requiredByDefault: true, status: "needs_attention" }),
      step({ stepKey: "c", requiredByDefault: true, status: "complete" }),
      step({ stepKey: "d", requiredByDefault: false, status: "blocked" }), // optional → not a blocker
    ];
    expect(summarizeChecklist(steps).blockers).toBe(2);
  });

  test("no required steps → 0% (no divide-by-zero)", () => {
    expect(summarizeChecklist([step({ stepKey: "x", requiredByDefault: false, status: "complete" })]).completionPct).toBe(0);
  });
});

describe("mock path yields the wrapped shape the page consumes", () => {
  test("default mode is mock; mock checklist wraps into { completionPct, blockers, steps }", () => {
    expect(DATA_SOURCE_MODE).toBe("mock");
    const view = summarizeChecklist(getPlanYearChecklist("acme", "2026"));
    expect(typeof view.completionPct).toBe("number");
    expect(typeof view.blockers).toBe("number");
    expect(view.steps.length).toBeGreaterThan(0);
    expect(view.steps[0]).toHaveProperty("stepKey");
    expect(view.steps[0]).toHaveProperty("status");
  });
});
