/**
 * Plans & Rates + 0004 broker co-grant integration tests (requires local MySQL).
 * Proves planCatalog / benefitPlanDetail route+authorize like the other reads against
 * Employer A's seeded fixtures, that the 0004 co-grant lets brokers read live Plans &
 * Rates, that employer_admin still works, and that cross-tenant / disabled / not-found
 * access fails closed.
 */
import { test, expect, describe, beforeAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, AuthError, controlPlanePool } from "@goben/data-access";
import { employerService } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const EMP_B = "eeee0000-0000-0000-0000-0000000000b2";
const PY_A_ACTIVE = "a2220000-0000-0000-0000-000000000002";

beforeAll(async () => {
  await setupLocal();
});

describe("0004 broker read co-grant", () => {
  test("broker now holds benefit_plan.read / rate.read / contribution.read (idempotent)", async () => {
    const cp = await controlPlanePool();
    const [rows] = await cp.query(
      `SELECT p.key_name AS k FROM role_permission rp
         JOIN role r ON r.id = rp.role_id JOIN permission p ON p.id = rp.permission_id
        WHERE r.key_name = 'broker' AND p.key_name IN ('benefit_plan.read','rate.read','contribution.read')
        ORDER BY p.key_name`
    );
    expect((rows as { k: string }[]).map((x) => x.k)).toEqual(["benefit_plan.read", "contribution.read", "rate.read"]);
  });

  test("re-applying the 0004 grant is idempotent (INSERT IGNORE — no duplicates/errors)", async () => {
    const cp = await controlPlanePool();
    const countRow = async () => {
      const [r] = await cp.query(
        `SELECT COUNT(*) AS n FROM role_permission rp
           JOIN role r ON r.id = rp.role_id JOIN permission p ON p.id = rp.permission_id
          WHERE r.key_name = 'broker' AND p.key_name IN ('benefit_plan.read','rate.read','contribution.read')`
      );
      return Number((r as { n: number }[])[0].n);
    };
    expect(await countRow()).toBe(3);
    // Re-run the exact 0004 statement — must not error or duplicate (PK on role_permission).
    await cp.query(
      `INSERT IGNORE INTO role_permission (role_id, permission_id)
       SELECT r.id, p.id FROM role r
         JOIN permission p ON p.key_name IN ('benefit_plan.read', 'rate.read', 'contribution.read')
        WHERE r.key_name = 'broker'`
    );
    expect(await countRow()).toBe(3); // unchanged
  });

  test("no manage/write was added by 0004 beyond what 0002 already granted broker", async () => {
    // broker should NOT have gained benefit_plan.read-adjacent WRITE it didn't have; it
    // keeps its pre-existing .manage (from 0002) and only gained the three .read perms.
    const cp = await controlPlanePool();
    const [rows] = await cp.query(
      `SELECT COUNT(*) AS n FROM role_permission rp
         JOIN role r ON r.id = rp.role_id JOIN permission p ON p.id = rp.permission_id
        WHERE r.key_name = 'broker' AND p.key_name = 'election.manage'`
    );
    expect(Number((rows as { n: number }[])[0].n)).toBe(0); // unrelated manage not granted
  });
});

describe("planCatalog (integration)", () => {
  test("employer_admin: seeded catalog with both plans ready, docs missing, no blockers", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const cat = await employerService.planCatalog(ctx, EMP_A, PY_A_ACTIVE);
    expect(cat.employerId).toBe(EMP_A);
    expect(cat.summary.total).toBe(2);
    expect(cat.summary.ready).toBe(2);
    expect(cat.summary.missingRates).toBe(0);
    expect(cat.summary.missingContributions).toBe(0);
    expect(cat.summary.missingDocuments).toBe(2); // no documents seeded
    expect(cat.summary.launchBlockers).toBe(0);
    const lines = cat.plans.map((p) => p.line).sort();
    expect(lines).toEqual(["dental", "medical"]);
    expect(cat.plans.every((p) => p.rateStatus === "complete" && p.contributionStatus === "configured")).toBe(true);
  });

  test("broker (via 0004 co-grant) can read Employer A's catalog live", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    const cat = await employerService.planCatalog(ctx, EMP_A, PY_A_ACTIVE);
    expect(cat.plans.length).toBe(2);
  });

  test("empty employer (B) → empty catalog, zeroed summary (no throw)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-b");
    const cat = await employerService.planCatalog(ctx, EMP_B, PY_A_ACTIVE);
    expect(cat.plans).toEqual([]);
    expect(cat.summary.total).toBe(0);
  });
});

describe("benefitPlanDetail (integration)", () => {
  test("employer_admin: medical detail has pivoted rates with employer/employee split", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const cat = await employerService.planCatalog(ctx, EMP_A, PY_A_ACTIVE);
    const medId = cat.plans.find((p) => p.line === "medical")!.planId;
    const det = await employerService.benefitPlanDetail(ctx, EMP_A, PY_A_ACTIVE, medId);
    expect(det.line).toBe("medical");
    expect(det.rates.length).toBe(4);
    const ee = det.rates.find((r) => r.tier === "Employee Only")!;
    expect(ee.total).toBe("$612.00");
    expect(ee.employee).toBe("$122.40"); // 20%
    expect(ee.employer).toBe("$489.60"); // 80%
    expect(det.contributions).toEqual([{ tier: "All Tiers", employer: "80%", employee: "20%" }]);
    expect(det.eligibility[0].class).toBe("Full-Time");
  });

  test("broker can read plan detail live (0004)", async () => {
    const admin = await buildAuthContext("sub-emp-admin-a");
    const medId = (await employerService.planCatalog(admin, EMP_A, PY_A_ACTIVE)).plans.find((p) => p.line === "dental")!.planId;
    const broker = await buildAuthContext("sub-broker-a");
    const det = await employerService.benefitPlanDetail(broker, EMP_A, PY_A_ACTIVE, medId);
    expect(det.line).toBe("dental");
  });

  test("unknown plan id → fails closed (AuthError, no existence leak)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(
      employerService.benefitPlanDetail(ctx, EMP_A, PY_A_ACTIVE, "c3330000-0000-0000-0000-000000000999")
    ).rejects.toThrow(AuthError);
  });
});

describe("Plans & Rates fail-closed", () => {
  test("Employer A admin cannot read B's catalog / detail (scope denied)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(employerService.planCatalog(ctx, EMP_B, PY_A_ACTIVE)).rejects.toThrow(AuthError);
    await expect(employerService.benefitPlanDetail(ctx, EMP_B, PY_A_ACTIVE, "x")).rejects.toThrow(AuthError);
  });

  test("disabled user cannot read the catalog", async () => {
    await expect(buildAuthContext("sub-disabled").then((ctx) =>
      employerService.planCatalog(ctx, EMP_A, PY_A_ACTIVE)
    )).rejects.toThrow();
  });
});
