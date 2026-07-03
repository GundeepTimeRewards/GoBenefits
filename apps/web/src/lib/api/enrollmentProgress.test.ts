// Enrollment Progress (Phase D-3) FE seam tests: live→mock mapper and the hybrid gate
// (employer + plan year must be live UUIDs). Pure — no render harness.
import { test, expect, describe } from "bun:test";
import { mapEnrollmentProgress, type LiveEnrollmentProgress } from "./liveMappers";
import { decideDataSource, decidePlanYearScopedSource, DATA_SOURCE_MODE } from "./dataSource";
import { getEnrollment } from "@/lib/mock/db";

const LIVE_EMP = "eeee0000-0000-0000-0000-0000000000a1";
const LIVE_PY = "a2220000-0000-0000-0000-000000000002";

const live: LiveEnrollmentProgress = {
  employerId: LIVE_EMP, planYearId: LIVE_PY, status: "In Progress",
  submitted: 2, inProgress: 1, notStarted: 0, notInvited: 1,
  byCoverage: [{ name: "Medical", elected: 2, waived: 0, pending: 1 }],
};

describe("mapEnrollmentProgress (live → mock EnrollmentSummary)", () => {
  const s = mapEnrollmentProgress(live);
  test("carries the fields the progress page renders", () => {
    expect(s.status).toBe("In Progress");
    expect(s.submitted).toBe(2);
    expect(s.inProgress).toBe(1);
    expect(s.notStarted).toBe(0);
    expect(s.notInvited).toBe(1);
    expect(s.byCoverage).toEqual([{ name: "Medical", elected: 2, waived: 0, pending: 1 }]);
  });
  test("derives invited = submitted + inProgress + notStarted; event fields blank (not in SDL)", () => {
    expect(s.invited).toBe(3);
    expect(s.eventLabel).toBe("");
    expect(s.window).toBe("");
  });
  test("shape matches the mock getter's keys (drop-in for getEnrollment)", () => {
    const mock = getEnrollment("acme");
    for (const k of Object.keys(mock)) expect(k in s).toBe(true);
  });
});

describe("Enrollment Progress hybrid gate", () => {
  test("enrollmentProgress is live-capable at the employer dimension", () => {
    expect(decideDataSource("hybrid", true, "enrollmentProgress", LIVE_EMP)).toBe("live");
    expect(decideDataSource("mock", true, "enrollmentProgress", LIVE_EMP)).toBe("mock");
    expect(decideDataSource("hybrid", false, "enrollmentProgress", LIVE_EMP)).toBe("fallback");
  });
  test("live requires live employer AND live plan year", () => {
    expect(decidePlanYearScopedSource("hybrid", true, "enrollmentProgress", LIVE_EMP, LIVE_PY)).toBe("live");
    expect(decidePlanYearScopedSource("hybrid", true, "enrollmentProgress", LIVE_EMP, "2026")).toBe("mock");
    expect(decidePlanYearScopedSource("hybrid", true, "enrollmentProgress", "acme", LIVE_PY)).toBe("mock");
  });
  test("enrollmentCenter is now live-capable too (wired in D-3b)", () => {
    expect(decideDataSource("hybrid", true, "enrollmentCenter", LIVE_EMP)).toBe("live");
  });
  test("mock mode remains the default", () => {
    expect(DATA_SOURCE_MODE).toBe("mock");
  });
});
