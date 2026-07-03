/**
 * Enrollment Progress / Center + 0005 broker co-grant integration tests (requires local
 * MySQL). Proves the reads route+authorize against Employer A's enrollment fixtures, that
 * 0005 lets brokers read live Enrollment Progress, that employer_admin still works, and
 * that cross-tenant / disabled access fails closed.
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

describe("0005 broker enrollment.read co-grant", () => {
  test("broker now holds enrollment.read", async () => {
    const cp = await controlPlanePool();
    const [rows] = await cp.query(
      `SELECT COUNT(*) AS n FROM role_permission rp
         JOIN role r ON r.id = rp.role_id JOIN permission p ON p.id = rp.permission_id
        WHERE r.key_name = 'broker' AND p.key_name = 'enrollment.read'`
    );
    expect(Number((rows as { n: number }[])[0].n)).toBe(1);
  });

  test("re-applying the 0005 grant is idempotent (INSERT IGNORE — no duplicates)", async () => {
    const cp = await controlPlanePool();
    const count = async () => {
      const [r] = await cp.query(
        `SELECT COUNT(*) AS n FROM role_permission rp
           JOIN role r ON r.id = rp.role_id JOIN permission p ON p.id = rp.permission_id
          WHERE r.key_name = 'broker' AND p.key_name = 'enrollment.read'`
      );
      return Number((r as { n: number }[])[0].n);
    };
    expect(await count()).toBe(1);
    await cp.query(
      `INSERT IGNORE INTO role_permission (role_id, permission_id)
       SELECT r.id, p.id FROM role r JOIN permission p ON p.key_name = 'enrollment.read' WHERE r.key_name = 'broker'`
    );
    expect(await count()).toBe(1);
  });

  test("0005 did not grant broker enrollment.manage-adjacent writes it lacked", async () => {
    const cp = await controlPlanePool();
    const [rows] = await cp.query(
      `SELECT COUNT(*) AS n FROM role_permission rp
         JOIN role r ON r.id = rp.role_id JOIN permission p ON p.id = rp.permission_id
        WHERE r.key_name = 'broker' AND p.key_name = 'election.manage'`
    );
    expect(Number((rows as { n: number }[])[0].n)).toBe(0);
  });
});

describe("enrollmentProgress (integration)", () => {
  test("employer_admin: live progress from the seeded OE event", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const p = await employerService.enrollmentProgress(ctx, EMP_A, PY_A_ACTIVE);
    expect(p.status).toBe("In Progress");
    // Election-derived counts are stable regardless of extra employees other suites add.
    expect(p.submitted).toBe(2); // Alice + Aaron
    expect(p.inProgress).toBe(1); // Amara
    expect(p.notStarted).toBe(0); // invited 3 − submitted 2 − inProgress 1
    // notInvited depends on total employees (census tests may add some) → at least Andre.
    expect(p.notInvited).toBeGreaterThanOrEqual(1);
    const med = p.byCoverage.find((c) => c.name === "Medical")!;
    expect(med.elected).toBe(2);
    expect(med.pending).toBe(1);
  });

  test("broker (via 0005 co-grant) can read Employer A's progress live", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    const p = await employerService.enrollmentProgress(ctx, EMP_A, PY_A_ACTIVE);
    expect(p.submitted).toBe(2);
  });

  test("empty employer (B) → Not Started, zeroed, no throw", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-b");
    const p = await employerService.enrollmentProgress(ctx, EMP_B, PY_A_ACTIVE);
    expect(p.status).toBe("Not Started");
    expect(p.submitted).toBe(0);
    expect(p.byCoverage).toEqual([]);
  });
});

describe("enrollmentCenter (integration)", () => {
  test("employer_admin: launched state, readiness reused from checklist, one window", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const c = await employerService.enrollmentCenter(ctx, EMP_A, PY_A_ACTIVE);
    expect(c.launchState).toBe("launched"); // window_end is in the future
    expect(c.launchReadiness.readinessPercent).toBeGreaterThan(0);
    expect(c.openEnrollmentSummary.eligible).toBeGreaterThanOrEqual(4); // census tests may add more
    expect(c.openEnrollmentSummary.submitted).toBe(2); // election-derived, stable
    expect(c.windows.length).toBe(1);
    expect(c.windows[0].status).toBe("Open");
  });

  test("broker can read the center live (0005)", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    const c = await employerService.enrollmentCenter(ctx, EMP_A, PY_A_ACTIVE);
    expect(c.launchState).toBe("launched");
  });
});

describe("Enrollment fail-closed", () => {
  test("Employer A admin cannot read B's enrollment (scope denied)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(employerService.enrollmentProgress(ctx, EMP_B, PY_A_ACTIVE)).rejects.toThrow(AuthError);
    await expect(employerService.enrollmentCenter(ctx, EMP_B, PY_A_ACTIVE)).rejects.toThrow(AuthError);
  });

  test("disabled user cannot read enrollment", async () => {
    await expect(buildAuthContext("sub-disabled").then((ctx) =>
      employerService.enrollmentProgress(ctx, EMP_A, PY_A_ACTIVE)
    )).rejects.toThrow();
  });
});
