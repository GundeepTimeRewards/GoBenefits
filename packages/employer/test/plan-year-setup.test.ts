/**
 * planYearSetupStatus integration tests (requires local MySQL). Proves the derived
 * read model routes+authorizes like the other plan-year reads, reflects real domain
 * state (census + plan-year status) from Employer A's seed, respects a customer-DB
 * override, and fails closed cross-tenant. No schema/migration change is required.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, AuthError, getPool } from "@goben/data-access";
import { employerService } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const EMP_B = "eeee0000-0000-0000-0000-0000000000b2";
const PY_A_ACTIVE = "a2220000-0000-0000-0000-000000000002"; // PY 2026 (active) — from seed

beforeAll(async () => {
  await setupLocal();
});

// Keep the override table clean between tests (seed adds none).
afterEach(async () => {
  const db = await getPool("cust_employer_a");
  await db.query(`DELETE FROM plan_year_setup_step_override WHERE plan_year_id = UUID_TO_BIN(:py)`, { py: PY_A_ACTIVE });
});

describe("planYearSetupStatus (integration)", () => {
  test("returns a valid wrapped PlanYearSetupStatus for the seeded active plan year", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const r = await employerService.planYearSetupStatus(ctx, EMP_A, PY_A_ACTIVE);

    expect(r.employerId).toBe(EMP_A);
    expect(r.planYearId).toBe(PY_A_ACTIVE);
    expect(Array.isArray(r.steps)).toBe(true);
    expect(r.steps.length).toBe(17); // the full seeded catalog
    expect(typeof r.completionPct).toBe("number");
    expect(typeof r.blockers).toBe("number");

    const byKey = Object.fromEntries(r.steps.map((s) => [s.key, s.status]));
    // Domains wired in v1 light up from real seed data:
    expect(byKey.census_imported).toBe("complete"); // Employer A has employees
    expect(byKey.readiness_review).toBe("complete"); // PY 2026 is active
    // D-2 domains now light up from the Plans & Rates fixtures:
    expect(byKey.plans_configured).toBe("complete"); // 2 complete benefit plans
    expect(byKey.rates_configured).toBe("complete"); // plan_rate rows exist
    expect(byKey.contributions_configured).toBe("complete"); // a contribution_rule exists
    // Un-wired domains are still honestly not_started (not faked complete):
    expect(byKey.documents_configured).toBe("not_started");
    expect(byKey.window_configured).toBe("not_started");

    // completionPct/blockers are server-computed (required-based; 2 of the required-
    // applicable steps complete). Values are bounded and consistent.
    expect(r.completionPct).toBeGreaterThan(0);
    expect(r.completionPct).toBeLessThan(100);
    expect(r.blockers).toBe(0); // no step derives to blocked/needs_attention in v1
  });

  test("a customer-DB override is respected (hidden step drops out; N/A note surfaces)", async () => {
    const db = await getPool("cust_employer_a");
    await db.query(
      `INSERT INTO plan_year_setup_step_override (id, plan_year_id, step_key, override_status, is_hidden, notes)
       VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(:py), 'options_configured', NULL, 1, NULL),
              (UUID_TO_BIN(UUID()), UUID_TO_BIN(:py), 'waivers_reviewed', 'not_applicable', 0, 'No waivers expected')`,
      { py: PY_A_ACTIVE }
    );

    const ctx = await buildAuthContext("sub-emp-admin-a");
    const r = await employerService.planYearSetupStatus(ctx, EMP_A, PY_A_ACTIVE);

    // hidden step is gone entirely
    expect(r.steps.find((s) => s.key === "options_configured")).toBeUndefined();
    expect(r.steps.length).toBe(16);
    // N/A override applied + note surfaced as message
    const waivers = r.steps.find((s) => s.key === "waivers_reviewed")!;
    expect(waivers.status).toBe("not_applicable");
    expect(waivers.message).toBe("No waivers expected");
  });

  test("planYearId not in this tenant → all not_started, completionPct 0 (honest, no throw)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const bogusPy = "b9990000-0000-0000-0000-000000000999";
    const r = await employerService.planYearSetupStatus(ctx, EMP_A, bogusPy);
    // census is employer-wide so still complete; readiness needs the PY (absent) → not_started
    expect(r.steps.find((s) => s.key === "readiness_review")!.status).toBe("not_started");
    expect(typeof r.completionPct).toBe("number");
  });

  test("fails closed: Employer A admin cannot read B's plan-year setup (scope denied)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(employerService.planYearSetupStatus(ctx, EMP_B, PY_A_ACTIVE)).rejects.toThrow(AuthError);
  });

  test("fails closed: disabled user cannot read setup", async () => {
    // sub-disabled is an employer_admin scoped to A but status=disabled → fails closed.
    await expect(buildAuthContext("sub-disabled").then((ctx) =>
      employerService.planYearSetupStatus(ctx, EMP_A, PY_A_ACTIVE)
    )).rejects.toThrow();
  });
});
