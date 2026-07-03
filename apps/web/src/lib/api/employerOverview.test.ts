// Employer Overview rollup (Phase D-4) FE seam tests: live→view mapper and the hybrid
// gate (employer + plan year must be live UUIDs). Pure — no render harness.
import { test, expect, describe } from "bun:test";
import { mapEmployerOverview, type LiveEmployerOverview } from "./liveMappers";
import { decideDataSource, decidePlanYearScopedSource, DATA_SOURCE_MODE } from "./dataSource";

const LIVE_EMP = "eeee0000-0000-0000-0000-0000000000a1";
const LIVE_PY = "a2220000-0000-0000-0000-000000000002";

const live: LiveEmployerOverview = {
  employerId: LIVE_EMP, planYearId: LIVE_PY, planYearLabel: "PY 2026", planYearStatus: "active",
  eligibleEmployees: 4, enrolled: 2, waived: 1, benefitPlans: 2, setupReadinessPct: 53, enrollmentPct: 50, launchBlockers: 0,
  needsAttention: [{ key: "carrier", title: "Carrier exports", severity: "high", route: "carrier-exports" }],
};

describe("mapEmployerOverview (live → view)", () => {
  const v = mapEmployerOverview(live);
  test("KPIs pass through; planYearStatus display-cased", () => {
    expect(v.planYearLabel).toBe("PY 2026");
    expect(v.planYearStatus).toBe("Active"); // via mapPlanYearStatus
    expect(v.eligibleEmployees).toBe(4);
    expect(v.enrolled).toBe(2);
    expect(v.waived).toBe(1);
    expect(v.benefitPlans).toBe(2);
    expect(v.setupReadinessPct).toBe(53);
    expect(v.enrollmentPct).toBe(50);
    expect(v.launchBlockers).toBe(0);
  });
  test("needsAttention passes through", () => {
    expect(v.needsAttention).toEqual([{ key: "carrier", title: "Carrier exports", severity: "high", route: "carrier-exports" }]);
  });
  test("nullable Int fields default to 0", () => {
    const v2 = mapEmployerOverview({ ...live, enrolled: null, waived: null, benefitPlans: null, setupReadinessPct: null, enrollmentPct: null, launchBlockers: null });
    expect(v2.enrolled).toBe(0);
    expect(v2.benefitPlans).toBe(0);
    expect(v2.setupReadinessPct).toBe(0);
  });
});

describe("Employer Overview hybrid gate", () => {
  test("employerOverview is live-capable at the employer dimension", () => {
    expect(decideDataSource("hybrid", true, "employerOverview", LIVE_EMP)).toBe("live");
    expect(decideDataSource("mock", true, "employerOverview", LIVE_EMP)).toBe("mock");
    expect(decideDataSource("hybrid", false, "employerOverview", LIVE_EMP)).toBe("fallback");
  });
  test("live requires live employer AND live plan year", () => {
    expect(decidePlanYearScopedSource("hybrid", true, "employerOverview", LIVE_EMP, LIVE_PY)).toBe("live");
    expect(decidePlanYearScopedSource("hybrid", true, "employerOverview", LIVE_EMP, "2026")).toBe("mock");
    expect(decidePlanYearScopedSource("hybrid", true, "employerOverview", "acme", LIVE_PY)).toBe("mock");
  });
  test("mock mode remains the default", () => {
    expect(DATA_SOURCE_MODE).toBe("mock");
  });
});
