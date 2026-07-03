// Shape-parity: C1 mock getters expose the fields the C1 operations select, and the
// live→mock mappers fully populate the mock TS shapes. Guards against mock/schema drift.
import { test, expect, describe } from "bun:test";
import { getCensusContext, listEmployers } from "@/lib/mock/db";
import { mapEmployer, mapEmployerSummary, mapPlanYear, mapPlanYearStatus, type LiveEmployer, type LiveEmployerSummary, type LivePlanYear } from "./liveMappers";

describe("mock getter fields cover C1 selections", () => {
  test("employerCensusContext: all C1 non-null fields present", () => {
    const c = getCensusContext("acme") as Record<string, unknown>;
    for (const k of [
      "employerId", "employerName", "totalEmployees", "activeEmployees",
      "missingRequiredCount", "missingEligibilityClassCount", "dependentsMissingDataCount", "needsReviewCount",
    ]) {
      expect(k in c).toBe(true);
    }
  });

  test("myEmployers mock rows expose id + name", () => {
    const rows = listEmployers();
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof rows[0].id).toBe("string");
    expect(typeof rows[0].name).toBe("string");
  });
});

describe("live→mock mappers fully populate the mock shape", () => {
  const liveSummary: LiveEmployerSummary = {
    employerId: "eeee0000-0000-0000-0000-0000000000a1", name: "Employer A", industry: null,
    employeeCount: null, activeCount: null, currentPlanYearId: null, currentPlanYearLabel: null,
    setupStatus: null, enrollmentState: null, completion: null, issues: null, renewalMonth: null, agency: null, broker: null,
  };
  const liveEmployer: LiveEmployer = {
    employerId: "eeee0000-0000-0000-0000-0000000000a1", name: "Employer A", legalName: "Employer A", ein: null,
    industry: null, employeeCount: 2, activeCount: 2, locations: 0, renewalMonth: null, agency: null, broker: null,
    currentPlanYearId: "py-uuid", currentPlanYearLabel: "PY 2026", status: "active",
  };
  const livePlanYear: LivePlanYear = {
    id: "py-uuid", label: "PY 2026", year: 2026, status: "active", periodStart: "2026-01-01", periodEnd: "2026-12-31",
    oeStart: null, oeEnd: null, oeWindowLabel: null, planCount: 3, completionPct: 50, eligibleCount: 2,
    enrollmentPct: 0, launchBlockers: 0, oeDaysLeft: null, needsActionCount: null,
  };

  const EMPLOYER_KEYS = ["id", "name", "industry", "employeeCount", "activeCount", "locations", "renewalMonth", "agency", "broker", "currentPlanYearId", "currentPlanYearLabel", "setupStatus", "enrollmentState", "completion", "issues"];
  const PLAN_YEAR_KEYS = ["id", "label", "status", "period", "oe", "plans", "completion", "eligible", "enrollment", "blockers"];

  test("mapEmployerSummary → all EmployerProfile keys, id = employerId", () => {
    const p = mapEmployerSummary(liveSummary) as Record<string, unknown>;
    for (const k of EMPLOYER_KEYS) expect(k in p).toBe(true);
    expect(p.id).toBe(liveSummary.employerId);
  });

  test("mapEmployer → all EmployerProfile keys, defaults for absent fields", () => {
    const p = mapEmployer(liveEmployer) as Record<string, unknown>;
    for (const k of EMPLOYER_KEYS) expect(k in p).toBe(true);
    expect(p.id).toBe(liveEmployer.employerId);
    expect(p.setupStatus).toBe("active");
  });

  test("mapPlanYear → all PlanYearRow keys + status/period remap", () => {
    const r = mapPlanYear(livePlanYear) as Record<string, unknown>;
    for (const k of PLAN_YEAR_KEYS) expect(k in r).toBe(true);
    expect(r.status).toBe("Active");
    expect(r.period).toBe("2026-01-01 – 2026-12-31");
    expect(r.plans).toBe(3);
  });

  test("mapPlanYearStatus maps the enum", () => {
    expect(mapPlanYearStatus("setup")).toBe("Setup");
    expect(mapPlanYearStatus("open_enrollment")).toBe("OpenEnrollment");
    expect(mapPlanYearStatus("active")).toBe("Active");
    expect(mapPlanYearStatus("archived")).toBe("Archived");
  });
});
