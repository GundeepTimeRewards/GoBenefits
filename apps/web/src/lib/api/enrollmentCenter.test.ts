// Enrollment Center (Phase D-3b) FE seam tests: live→mock mapper (the 4 sub-shapes) and
// the hybrid gate (employer + plan year must be live UUIDs). Pure — no render harness.
import { test, expect, describe } from "bun:test";
import { mapEnrollmentCenter, type LiveEnrollmentCenter } from "./liveMappers";
import { decideDataSource, decidePlanYearScopedSource, DATA_SOURCE_MODE } from "./dataSource";

const LIVE_EMP = "eeee0000-0000-0000-0000-0000000000a1";
const LIVE_PY = "a2220000-0000-0000-0000-000000000002";

const live: LiveEnrollmentCenter = {
  employerId: LIVE_EMP, planYearId: LIVE_PY, launchState: "launched",
  launchReadiness: {
    planYearStatus: "active", readinessPercent: 53, canLaunch: false, launchState: "launched",
    blockers: [{ key: "carrier_exports_generated", label: "Carrier", severity: "high", area: "Carrier", description: "blocked" }],
    warnings: [{ key: "rates_configured", label: "Rates", severity: "medium", area: "Rates", description: null }],
    checklist: [{ key: "census_imported", label: "Census", status: "ready" }, { key: "rates_configured", label: "Rates", status: "warning" }],
  },
  openEnrollmentSummary: { completionPercent: 50, eligible: 4, submitted: 2, inProgress: 1, notStarted: 0, needsAction: 1, enrolled: 2, waived: 1, lateMissing: 1, carrierFilesStatus: "Not started" },
  windows: [{ id: "w1", name: "2026 OE", type: "Open Enrollment", windowLabel: "2025-11-01 – 2030-12-31", effectiveRule: null, employeesAffected: "4 eligible", status: "Open", completion: 50, nextAction: "Monitor progress" }],
  ongoingWork: [{ key: "not_invited", label: "Not invited", count: 1, countLabel: "1 not invited", status: "open", urgency: "medium", nextAction: "Send invitations", route: "enrollment-progress" }],
};

describe("mapEnrollmentCenter (live → 4 mock sub-shapes)", () => {
  const v = mapEnrollmentCenter(live);
  test("launchReadiness: planYearStatus display-cased; readiness/canLaunch pass through", () => {
    expect(v.launchReadiness!.planYearStatus).toBe("Active"); // via mapPlanYearStatus
    expect(v.launchReadiness!.readinessPercent).toBe(53);
    expect(v.launchReadiness!.canLaunch).toBe(false);
    expect(v.launchReadiness!.launchState).toBe("launched");
  });
  test("severity is set per array (blockers→blocker, warnings→warning); null description → ''", () => {
    expect(v.launchReadiness!.blockers[0].severity).toBe("blocker");
    expect(v.launchReadiness!.blockers[0].area).toBe("Carrier");
    expect(v.launchReadiness!.warnings[0].severity).toBe("warning");
    expect(v.launchReadiness!.warnings[0].description).toBe(""); // null → ""
  });
  test("checklist statuses pass through", () => {
    expect(v.launchReadiness!.checklist.map((c) => c.status)).toEqual(["ready", "warning"]);
  });
  test("openEnrollmentSummary passes through", () => {
    expect(v.openEnrollmentSummary!.eligible).toBe(4);
    expect(v.openEnrollmentSummary!.submitted).toBe(2);
  });
  test("windows: type/label/status preserved; nullable → defaults", () => {
    expect(v.windows[0].type).toBe("Open Enrollment");
    expect(v.windows[0].status).toBe("Open");
    expect(v.windows[0].effectiveRule).toBe(""); // null → ""
    expect(v.windows[0].completion).toBe(50);
  });
  test("ongoingWork: nullable → defaults; urgency/route cast", () => {
    expect(v.ongoingWork[0].key).toBe("not_invited");
    expect(v.ongoingWork[0].urgency).toBe("medium");
    expect(v.ongoingWork[0].route).toBe("enrollment-progress");
  });
  test("null launchReadiness maps to null (page guards on it)", () => {
    const v2 = mapEnrollmentCenter({ ...live, launchReadiness: null, openEnrollmentSummary: null });
    expect(v2.launchReadiness).toBeNull();
    expect(v2.openEnrollmentSummary).toBeNull();
  });
});

describe("Enrollment Center hybrid gate", () => {
  test("enrollmentCenter is live-capable at the employer dimension", () => {
    expect(decideDataSource("hybrid", true, "enrollmentCenter", LIVE_EMP)).toBe("live");
    expect(decideDataSource("mock", true, "enrollmentCenter", LIVE_EMP)).toBe("mock");
    expect(decideDataSource("hybrid", false, "enrollmentCenter", LIVE_EMP)).toBe("fallback");
  });
  test("live requires live employer AND live plan year", () => {
    expect(decidePlanYearScopedSource("hybrid", true, "enrollmentCenter", LIVE_EMP, LIVE_PY)).toBe("live");
    expect(decidePlanYearScopedSource("hybrid", true, "enrollmentCenter", LIVE_EMP, "2026")).toBe("mock");
    expect(decidePlanYearScopedSource("hybrid", true, "enrollmentCenter", "acme", LIVE_PY)).toBe("mock");
  });
  test("mock mode remains the default", () => {
    expect(DATA_SOURCE_MODE).toBe("mock");
  });
});
