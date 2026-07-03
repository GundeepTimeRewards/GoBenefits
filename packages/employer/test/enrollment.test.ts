/**
 * Enrollment read models — PURE derivation tests (Phase D-3). No DB; feeds the build*
 * functions synthetic EnrollmentCounts + a checklist.
 */
import { test, expect, describe } from "bun:test";
import {
  deriveLaunchState,
  buildEnrollmentProgress,
  buildOpenEnrollmentSummary,
  buildLaunchReadiness,
  buildEnrollmentCenter,
  type EnrollmentCounts,
} from "../src/enrollment";
import type { PlanYearSetupStatus } from "../src/plan-year-checklist";

function counts(over: Partial<EnrollmentCounts> = {}): EnrollmentCounts {
  return {
    eligible: 4, invited: 3, submittedEmployees: 2, inProgressEmployees: 1, waivedCount: 1,
    byLine: [{ line: "medical", benefitLabel: "Medical", elected: 2, waived: 0, pending: 1 }],
    hasEvent: true, eventName: "2026 OE", eventType: "open_enrollment",
    hasWindow: true, windowStart: "2025-11-01", windowEnd: "2030-12-31", windowOpen: true,
    planYearStatus: "active", ...over,
  };
}
const checklist: PlanYearSetupStatus = {
  employerId: "e", planYearId: "py", completionPct: 53, blockers: 0,
  steps: [
    { key: "census_imported", label: "Census", description: null, category: "People", requiredByDefault: true, status: "complete", route: null, message: null },
    { key: "rates_configured", label: "Rates", description: null, category: "Rates", requiredByDefault: true, status: "needs_attention", route: null, message: "vision" },
    { key: "carrier_exports_generated", label: "Carrier", description: null, category: "Carrier", requiredByDefault: true, status: "blocked", route: null, message: "blocked" },
  ],
};

describe("deriveLaunchState", () => {
  test("archived plan year → archived", () => {
    expect(deriveLaunchState(counts({ planYearStatus: "archived" }))).toBe("archived");
  });
  test("no event or no window → not_launched", () => {
    expect(deriveLaunchState(counts({ hasEvent: false }))).toBe("not_launched");
    expect(deriveLaunchState(counts({ hasWindow: false }))).toBe("not_launched");
  });
  test("window open → launched; window closed → closed", () => {
    expect(deriveLaunchState(counts({ windowOpen: true }))).toBe("launched");
    expect(deriveLaunchState(counts({ windowOpen: false }))).toBe("closed");
  });
});

describe("buildEnrollmentProgress", () => {
  test("employee-level counts + notInvited + byCoverage", () => {
    const p = buildEnrollmentProgress("e", "py", counts());
    expect(p.status).toBe("In Progress");
    expect(p.submitted).toBe(2);
    expect(p.inProgress).toBe(1);
    expect(p.notStarted).toBe(0); // invited 3 − submitted 2 − inProgress 1
    expect(p.notInvited).toBe(1); // eligible 4 − invited 3
    expect(p.byCoverage).toEqual([{ name: "Medical", elected: 2, waived: 0, pending: 1 }]);
    expect(p.reminders).toBeNull();
    expect(p.byBenefit).toEqual([{ name: "Medical", completed: 2, total: 3 }]);
  });
  test("no event → Not Started, zeroed, empty coverage", () => {
    const p = buildEnrollmentProgress("e", "py", counts({ hasEvent: false, invited: 0, submittedEmployees: 0, inProgressEmployees: 0, byLine: [] }));
    expect(p.status).toBe("Not Started");
    expect(p.submitted).toBe(0);
    expect(p.notInvited).toBe(4);
    expect(p.byCoverage).toEqual([]);
  });
});

describe("buildOpenEnrollmentSummary", () => {
  test("completion% over eligible; needsAction = inProgress + notStarted", () => {
    const s = buildOpenEnrollmentSummary(counts());
    expect(s.eligible).toBe(4);
    expect(s.submitted).toBe(2);
    expect(s.completionPercent).toBe(50); // 2/4
    expect(s.needsAction).toBe(1); // inProgress 1 + notStarted 0
    expect(s.enrolled).toBe(2);
    expect(s.waived).toBe(1);
    expect(s.carrierFilesStatus).toBe("Not started");
  });
});

describe("buildLaunchReadiness (reuses the D-1 checklist)", () => {
  test("readinessPercent = completionPct; blockers/warnings/checklist mapped", () => {
    const lr = buildLaunchReadiness(checklist, "active", "launched");
    expect(lr.readinessPercent).toBe(53);
    expect(lr.canLaunch).toBe(false); // one blocked step
    expect(lr.blockers.map((b) => b.key)).toEqual(["carrier_exports_generated"]);
    expect(lr.warnings.map((w) => w.key)).toEqual(["rates_configured"]);
    const byKey = Object.fromEntries(lr.checklist.map((c) => [c.key, c.status]));
    expect(byKey.census_imported).toBe("ready");
    expect(byKey.rates_configured).toBe("warning");
    expect(byKey.carrier_exports_generated).toBe("blocker");
  });
  test("no blocked steps → canLaunch true", () => {
    const clean: PlanYearSetupStatus = { ...checklist, steps: [checklist.steps[0]] };
    expect(buildLaunchReadiness(clean, "active", "launched").canLaunch).toBe(true);
  });
});

describe("buildEnrollmentCenter", () => {
  test("composes launchState + readiness + summary + windows + ongoingWork", () => {
    const c = buildEnrollmentCenter("e", "py", "evt", counts(), checklist);
    expect(c.launchState).toBe("launched");
    expect(c.launchReadiness.readinessPercent).toBe(53);
    expect(c.openEnrollmentSummary.eligible).toBe(4);
    expect(c.windows.length).toBe(1);
    expect(c.windows[0].status).toBe("Open");
    expect(c.ongoingWork.length).toBeGreaterThan(0);
    expect(c.ongoingWork.map((w) => w.key)).toContain("not_invited"); // 1 not invited
  });
});
