/**
 * Employer + plan-year integration tests (requires local MySQL — Phase 0).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the employer/plan-year reads enforce the SAME permission x scope x routing
 * as the census/dependents foundation, compose the employer detail read model
 * correctly, serialize plan-year dates as AWSDate strings, and never cross tenants.
 */
import { test, expect, describe, beforeAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, AuthError } from "@goben/data-access";
import { employerService } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const EMP_B = "eeee0000-0000-0000-0000-0000000000b2";
const EMP_C_ARCHIVED = "eeee0000-0000-0000-0000-0000000000c3";
const AWS_DATE = /^\d{4}-\d{2}-\d{2}$/;

beforeAll(async () => {
  await setupLocal();
});

describe("planYears / currentPlanYear reads", () => {
  test("employer admin A gets A's plan years, newest first, AWSDate-formatted", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const years = await employerService.listPlanYears(ctx, EMP_A);
    expect(years.length).toBeGreaterThanOrEqual(2);
    // Newest first.
    expect(years[0].year).toBeGreaterThan(years[1].year);
    // Dates serialize as YYYY-MM-DD (AWSDate), not JS Date / ISO datetime.
    expect(years[0].periodStart).toMatch(AWS_DATE);
    expect(years[0].periodEnd).toMatch(AWS_DATE);
    // PlanYear.plans is a (non-null) list, empty in C1.
    expect(Array.isArray(years[0].plans)).toBe(true);
  });

  test("currentPlanYear prefers the active plan year", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const current = await employerService.currentPlanYear(ctx, EMP_A);
    expect(current).not.toBeNull();
    expect(current!.status).toBe("active");
    expect(current!.label).toBe("PY 2026");
  });

  test("currentPlanYear is null for an employer with no plan years (Employer B)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-b");
    const current = await employerService.currentPlanYear(ctx, EMP_B);
    expect(current).toBeNull();
  });
});

describe("employer detail composition", () => {
  test("getEmployer composes registry + single-tenant stats + current plan year", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const emp = await employerService.getEmployer(ctx, EMP_A);
    expect(emp.employerId).toBe(EMP_A);
    expect(emp.name).toBe("Employer A");
    expect(emp.status).toBe("active");
    expect(emp.employeeCount).toBeGreaterThanOrEqual(2);
    expect(emp.currentPlanYearId).not.toBeNull();
    expect(emp.currentPlanYearLabel).toBe("PY 2026");
  });
});

describe("tenant / employer isolation for plan-year reads", () => {
  test("employer admin A cannot read B's plan years (scope denied)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(employerService.listPlanYears(ctx, EMP_B)).rejects.toThrow(AuthError);
    await expect(employerService.currentPlanYear(ctx, EMP_B)).rejects.toThrow(AuthError);
    await expect(employerService.getEmployer(ctx, EMP_B)).rejects.toThrow(AuthError);
  });

  test("broker assigned to A can read A's plan years but NOT B's", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    const years = await employerService.listPlanYears(ctx, EMP_A);
    expect(years.length).toBeGreaterThanOrEqual(2);
    await expect(employerService.listPlanYears(ctx, EMP_B)).rejects.toThrow(AuthError);
  });

  test("platform admin can read across employers", async () => {
    const ctx = await buildAuthContext("sub-platform");
    const a = await employerService.getEmployer(ctx, EMP_A);
    const b = await employerService.getEmployer(ctx, EMP_B);
    expect(a.employerId).toBe(EMP_A);
    expect(b.employerId).toBe(EMP_B);
  });

  test("archived employer fails closed for scoped users", async () => {
    const ctx = await buildAuthContext("sub-agency"); // same agency, but employer archived
    await expect(employerService.listPlanYears(ctx, EMP_C_ARCHIVED)).rejects.toThrow("not active");
  });
});
