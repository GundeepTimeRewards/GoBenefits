/**
 * Tenant-isolation & authorization tests (integration; requires local MySQL).
 *
 *   docker compose up -d        # start MySQL
 *   bun test                    # runs this suite (beforeAll bootstraps DBs)
 *
 * Proves: permission x scope x routing all enforced; failures happen BEFORE any
 * customer-DB query; fail-closed on unknown/disabled tenant/user.
 */
import { test, expect, describe, beforeAll } from "bun:test";

// Local DB defaults (overridable via env). No AWS.
process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import {
  buildAuthContext,
  resolveEmployer,
  getCustomerDb,
  listAuthorizedEmployers,
  auditHooks,
  AuthError,
  type SupportAccessEvent,
} from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const EMP_B = "eeee0000-0000-0000-0000-0000000000b2";
const EMP_C_ARCHIVED = "eeee0000-0000-0000-0000-0000000000c3";
const UNKNOWN = "99999999-0000-0000-0000-000000000000";

beforeAll(async () => {
  await setupLocal();
});

describe("broker scope", () => {
  test("broker assigned to A can read A", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    const { employer, db } = await getCustomerDb(ctx, "employee.read", EMP_A);
    expect(employer.dbName).toBe("cust_employer_a");
    const [rows] = await db.query("SELECT COUNT(*) AS n FROM employee");
    expect((rows as { n: number }[])[0].n).toBeGreaterThan(0);
  });

  test("broker assigned to A cannot read B (scope denied)", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    await expect(getCustomerDb(ctx, "employee.read", EMP_B)).rejects.toThrow(AuthError);
  });

  test("broker cannot bypass scope by passing B's id manually", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    // Same path as a malicious client passing another tenant's id: still denied.
    await expect(resolveEmployer(ctx, EMP_B)).rejects.toThrow("Not authorized");
  });
});

describe("employer admin scope", () => {
  test("employer admin A can read A", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const { employer } = await getCustomerDb(ctx, "employee.read", EMP_A);
    expect(employer.dbName).toBe("cust_employer_a");
  });

  test("employer admin A cannot read B", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(getCustomerDb(ctx, "employee.read", EMP_B)).rejects.toThrow(AuthError);
  });
});

describe("employee scope", () => {
  test("employee cannot list all employees (lacks employee.read)", async () => {
    const ctx = await buildAuthContext("sub-employee-a");
    await expect(getCustomerDb(ctx, "employee.read", EMP_A)).rejects.toThrow("Missing permission");
  });

  test("employee can access own employer self-service scope", async () => {
    const ctx = await buildAuthContext("sub-employee-a");
    const { employer } = await getCustomerDb(ctx, "election.read", EMP_A);
    expect(employer.dbName).toBe("cust_employer_a");
  });

  test("employee cannot access another employer by changing input", async () => {
    const ctx = await buildAuthContext("sub-employee-a");
    await expect(getCustomerDb(ctx, "election.read", EMP_B)).rejects.toThrow(AuthError);
  });
});

describe("platform / support scope", () => {
  test("platform admin can access across employers + routing is correct", async () => {
    const ctx = await buildAuthContext("sub-platform");
    const a = await getCustomerDb(ctx, "employee.read", EMP_A);
    const b = await getCustomerDb(ctx, "employee.read", EMP_B);
    const [aRows] = await a.db.query("SELECT last_name FROM employee ORDER BY last_name");
    const [bRows] = await b.db.query("SELECT last_name FROM employee ORDER BY last_name");
    const aNames = (aRows as { last_name: string }[]).map((r) => r.last_name);
    const bNames = (bRows as { last_name: string }[]).map((r) => r.last_name);
    // Assert routing + cross-tenant ISOLATION, not exact counts: other suites
    // (census/dependents) add rows to A when the whole suite runs, so require the
    // seed fixtures to be present in their own tenant and NEVER leak across.
    expect(aNames).toEqual(expect.arrayContaining(["Acosta", "Anderson"]));
    expect(bNames).toEqual(expect.arrayContaining(["Baker", "Brooks"]));
    expect(aNames).not.toContain("Baker");
    expect(aNames).not.toContain("Brooks");
    expect(bNames).not.toContain("Acosta");
    expect(bNames).not.toContain("Anderson");
  });

  test("benefits support admin access is captured for audit", async () => {
    const captured: SupportAccessEvent[] = [];
    auditHooks.onSupportAccess = (e) => captured.push(e);
    try {
      const ctx = await buildAuthContext("sub-support");
      await getCustomerDb(ctx, "employee.read", EMP_A);
      expect(captured).toHaveLength(1);
      expect(captured[0].employerId).toBe(EMP_A);
      expect(captured[0].roleKey).toBe("benefits_support_admin");
    } finally {
      auditHooks.onSupportAccess = undefined;
    }
  });

  test("scoped roles do NOT trigger the support audit hook", async () => {
    const captured: SupportAccessEvent[] = [];
    auditHooks.onSupportAccess = (e) => captured.push(e);
    try {
      const ctx = await buildAuthContext("sub-emp-admin-a");
      await getCustomerDb(ctx, "employee.read", EMP_A);
      expect(captured).toHaveLength(0);
    } finally {
      auditHooks.onSupportAccess = undefined;
    }
  });
});

describe("fail closed", () => {
  test("unknown employer id fails closed (before any customer query)", async () => {
    const ctx = await buildAuthContext("sub-platform");
    await expect(resolveEmployer(ctx, UNKNOWN)).rejects.toThrow("Employer not found");
  });

  test("missing access row fails closed (broker -> B)", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    await expect(resolveEmployer(ctx, EMP_B)).rejects.toThrow(AuthError);
  });

  test("archived/disabled employer fails closed for scoped users", async () => {
    // agency admin WOULD pass scope (same agency), but the employer is archived.
    const ctx = await buildAuthContext("sub-agency");
    await expect(resolveEmployer(ctx, EMP_C_ARCHIVED)).rejects.toThrow("not active");
  });

  test("disabled user fails closed at context build", async () => {
    await expect(buildAuthContext("sub-disabled")).rejects.toThrow(AuthError);
  });

  test("unknown identity fails closed", async () => {
    await expect(buildAuthContext("sub-does-not-exist")).rejects.toThrow(AuthError);
    await expect(buildAuthContext(undefined)).rejects.toThrow("No identity");
  });
});

describe("myEmployers scoping", () => {
  test("broker A sees only A; platform sees all", async () => {
    const broker = await buildAuthContext("sub-broker-a");
    const platform = await buildAuthContext("sub-platform");
    const brokerList = await listAuthorizedEmployers(broker.user);
    const platformList = await listAuthorizedEmployers(platform.user);
    expect(brokerList.map((e) => e.dbName)).toEqual(["cust_employer_a"]);
    expect(platformList.length).toBeGreaterThanOrEqual(3);
  });
});
