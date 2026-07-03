/**
 * Employer Overview rollup integration tests (requires local MySQL). Proves the read
 * composes the D-1/D-2/D-3 aggregates against Employer A's fixtures, that broker +
 * employer_admin both access it via `employer.read` (no new grant), and that cross-tenant
 * / disabled access fails closed.
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
const PY_A_ACTIVE = "a2220000-0000-0000-0000-000000000002";

beforeAll(async () => {
  await setupLocal();
});

describe("employerOverview (integration)", () => {
  test("employer_admin: composed rollup from the seeded aggregates", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const o = await employerService.employerOverview(ctx, EMP_A, PY_A_ACTIVE);
    expect(o.employerId).toBe(EMP_A);
    expect(o.planYearLabel).toBe("PY 2026");
    expect(o.planYearStatus).toBe("active");
    // Election-derived values are stable regardless of extra employees other suites add.
    expect(o.enrolled).toBe(2); // Alice + Aaron
    expect(o.waived).toBe(1);
    expect(o.benefitPlans).toBe(2); // medical + dental
    expect(o.setupReadinessPct).toBeGreaterThan(0);
    expect(o.eligibleEmployees).toBeGreaterThanOrEqual(4); // census tests may add more
    expect(Array.isArray(o.needsAttention)).toBe(true);
  });

  test("broker reads the rollup via employer.read (no new grant needed)", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    const o = await employerService.employerOverview(ctx, EMP_A, PY_A_ACTIVE);
    expect(o.benefitPlans).toBe(2);
    expect(o.enrolled).toBe(2);
  });

  test("empty employer (B) → zeroed rollup, no throw", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-b");
    const o = await employerService.employerOverview(ctx, EMP_B, PY_A_ACTIVE);
    expect(o.benefitPlans).toBe(0);
    expect(o.enrolled).toBe(0);
  });

  test("fails closed: Employer A admin cannot read B's overview (scope denied)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(employerService.employerOverview(ctx, EMP_B, PY_A_ACTIVE)).rejects.toThrow(AuthError);
  });

  test("fails closed: disabled user cannot read the overview", async () => {
    await expect(buildAuthContext("sub-disabled").then((ctx) =>
      employerService.employerOverview(ctx, EMP_A, PY_A_ACTIVE)
    )).rejects.toThrow();
  });
});
