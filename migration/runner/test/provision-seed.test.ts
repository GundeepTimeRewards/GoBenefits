/**
 * Tenant-provisioner deployment-seed tests (FOUNDATION-DEPLOY-2b).
 * Pure validation tests + integration tests against local MySQL (like the other
 * suites). Uses legacyUserDb for a DETERMINISTIC tenant db name so re-invocation
 * hits the SAME tenant (idempotency), and cleans up after itself so repeated
 * `bun test` runs don't accumulate databases or control-plane rows.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { controlPlanePool } from "@goben/data-access";
import {
  handler,
  validateSeedInput,
  normalizeSeedPlanYear,
  ProvisionValidationError,
  SEEDABLE_ROLE_KEYS,
} from "../src/provision";
import { setupLocal } from "../../../local/setup";

const LEGACY_N = 990; // deterministic test tenant: cust_legacy_990
const TEST_DB = `cust_legacy_${LEGACY_N}`;
const TEST_SUB = "seed-test-sub-990";
const TEST_EMAIL = "seed.test@dev";

async function cleanup(): Promise<void> {
  const cp = await controlPlanePool();
  await cp.query(
    `DELETE FROM user_employer_access WHERE user_account_id IN (SELECT id FROM user_account WHERE cognito_sub = :sub)`,
    { sub: TEST_SUB }
  );
  await cp.query(`DELETE FROM user_account WHERE cognito_sub = :sub`, { sub: TEST_SUB });
  await cp.query(`DELETE FROM employer WHERE db_name = :db`, { db: TEST_DB });
  await cp.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
}

beforeAll(async () => {
  await setupLocal();
  await cleanup(); // defensive: clear any residue from an interrupted prior run
});
afterAll(cleanup);

// --- pure validation ----------------------------------------------------------
describe("validateSeedInput (pure)", () => {
  test("no seed fields → valid (legacy behavior path)", () => {
    expect(() => validateSeedInput({ legalName: "X" })).not.toThrow();
  });
  test("valid sub+email (+default role) → valid", () => {
    expect(() => validateSeedInput({ legalName: "X", adminCognitoSub: "a-b_c.1:2", adminEmail: "a@b" })).not.toThrow();
  });
  test("sub without email is rejected", () => {
    expect(() => validateSeedInput({ legalName: "X", adminCognitoSub: "abc" })).toThrow(ProvisionValidationError);
  });
  test("bad sub / bad email are rejected", () => {
    expect(() => validateSeedInput({ legalName: "X", adminCognitoSub: "has space", adminEmail: "a@b" })).toThrow("valid Cognito sub");
    expect(() => validateSeedInput({ legalName: "X", adminCognitoSub: "abc", adminEmail: "not-an-email" })).toThrow("adminEmail");
  });
  test("non-seedable roles are rejected (no privilege escalation)", () => {
    for (const bad of ["platform_admin", "benefits_support_admin", "agency_admin", "root"]) {
      expect(() =>
        validateSeedInput({ legalName: "X", adminCognitoSub: "abc", adminEmail: "a@b", adminRoleKey: bad })
      ).toThrow("not a seedable role");
    }
  });
  test("email/role without sub are rejected", () => {
    expect(() => validateSeedInput({ legalName: "X", adminEmail: "a@b" })).toThrow("require adminCognitoSub");
  });
  test("seedable role allow-list is employer-scoped only", () => {
    expect(SEEDABLE_ROLE_KEYS).toEqual(["employer_admin", "broker", "employer_read_only", "employee"]);
  });
});

describe("normalizeSeedPlanYear (pure)", () => {
  test("number shorthand → active year with default label", () => {
    expect(normalizeSeedPlanYear(2026)).toEqual({ year: 2026, label: "2026 Benefits", status: "active" });
  });
  test("object form with overrides", () => {
    expect(normalizeSeedPlanYear({ year: 2027, label: "PY 2027", status: "setup" }))
      .toEqual({ year: 2027, label: "PY 2027", status: "setup" });
  });
  test("bad year / bad status rejected", () => {
    expect(() => normalizeSeedPlanYear(99 as never)).toThrow(ProvisionValidationError);
    expect(() => normalizeSeedPlanYear({ year: 2026, status: "open" })).toThrow("status");
  });
});

// --- integration (local MySQL) --------------------------------------------------
describe("provisioner seed (integration)", () => {
  test("without seed fields: legacy behavior unchanged (no user/plan-year created)", async () => {
    const r = await handler({ legalName: "Seed Test Employer", legacyUserDb: LEGACY_N });
    expect(r.employerId).toBeTruthy();
    expect(r.dbName).toBe(TEST_DB);
    expect(r.adminUserId).toBeUndefined();
    expect(r.planYearId).toBeUndefined();
    const cp = await controlPlanePool();
    const [users] = await cp.query(`SELECT 1 FROM user_account WHERE cognito_sub = :sub`, { sub: TEST_SUB });
    expect((users as unknown[]).length).toBe(0);
  });

  test("with seed fields: user + access grant + active plan year; then idempotent re-run", async () => {
    const input = {
      legalName: "Seed Test Employer",
      legacyUserDb: LEGACY_N,
      adminCognitoSub: TEST_SUB,
      adminEmail: TEST_EMAIL,
      seedPlanYear: 2026,
    };
    const r1 = await handler(input);
    expect(r1.adminUserId).toBeTruthy();
    expect(r1.planYearId).toBeTruthy();

    const cp = await controlPlanePool();
    // default role = employer_admin
    const [roleRows] = await cp.query(
      `SELECT r.key_name AS k FROM user_account u JOIN role r ON r.id = u.role_id WHERE u.cognito_sub = :sub`,
      { sub: TEST_SUB }
    );
    expect((roleRows as { k: string }[])[0]?.k).toBe("employer_admin");
    // access grant exists for the provisioned employer
    const [grants] = await cp.query(
      `SELECT COUNT(*) AS n FROM user_employer_access a JOIN user_account u ON u.id = a.user_account_id
       WHERE u.cognito_sub = :sub AND a.employer_id = UUID_TO_BIN(:emp)`,
      { sub: TEST_SUB, emp: r1.employerId }
    );
    expect(Number((grants as { n: number }[])[0].n)).toBe(1);

    // re-run: same employer, same user id, same plan year id; no duplicates
    const r2 = await handler(input);
    expect(r2.employerId).toBe(r1.employerId);
    expect(r2.adminUserId).toBe(r1.adminUserId!);
    expect(r2.planYearId).toBe(r1.planYearId!);
    const [userCount] = await cp.query(`SELECT COUNT(*) AS n FROM user_account WHERE cognito_sub = :sub`, { sub: TEST_SUB });
    expect(Number((userCount as { n: number }[])[0].n)).toBe(1);
    const [grantCount] = await cp.query(
      `SELECT COUNT(*) AS n FROM user_employer_access a JOIN user_account u ON u.id = a.user_account_id WHERE u.cognito_sub = :sub`,
      { sub: TEST_SUB }
    );
    expect(Number((grantCount as { n: number }[])[0].n)).toBe(1);
  });

  test("seeded identity works end-to-end: auth context + currentPlanYear resolve", async () => {
    // The seeded sub must behave exactly like a normally-seeded user: full
    // permission x scope x routing path through the REAL data-access layer.
    const { buildAuthContext, getCustomerDb } = await import("@goben/data-access");
    const ctx = await buildAuthContext(TEST_SUB);
    expect(ctx.user.roleKey).toBe("employer_admin");
    const cp = await controlPlanePool();
    const [emp] = await cp.query(`SELECT BIN_TO_UUID(id) AS id FROM employer WHERE db_name = :db`, { db: TEST_DB });
    const employerId = (emp as { id: string }[])[0].id;
    const { db } = await getCustomerDb(ctx, "plan_year.read", employerId);
    const [pys] = await db.query(`SELECT label, status FROM plan_year WHERE year = 2026`);
    expect((pys as { label: string; status: string }[])[0]).toEqual({ label: "2026 Benefits", status: "active" });
  });

  test("invalid role via handler is rejected before any write", async () => {
    await expect(
      handler({ legalName: "X", legacyUserDb: LEGACY_N, adminCognitoSub: "another-sub", adminEmail: "a@b", adminRoleKey: "platform_admin" })
    ).rejects.toThrow("not a seedable role");
  });
});
