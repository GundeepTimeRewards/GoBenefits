/**
 * Pure unit tests for the tenant SCOPE decision — no DB required.
 * Exercises decideEmployerAccess (permission is checked separately) and the
 * support-audit hook, covering the security branching offline.
 */
import { test, expect, describe, afterEach } from "bun:test";
import { decideEmployerAccess, auditHooks, AuthError, type AuthContext, type SupportAccessEvent } from "../src/index";

type EmployerRegistry = {
  id: string;
  agencyId: string | null;
  brokerId: string | null;
  legalName: string;
  status: string;
  dbName: string;
};

function ctxFor(roleKey: string, agencyId: string | null = null): AuthContext {
  const isPlatform = roleKey === "platform_admin" || roleKey === "benefits_support_admin";
  return {
    user: { id: "u1", cognitoSub: "sub", email: "u@test", roleKey, agencyId, brokerId: null, status: "active" },
    permissions: new Set<string>(),
    isPlatform,
  };
}

function employer(over: Partial<EmployerRegistry> = {}): EmployerRegistry {
  return { id: "emp1", agencyId: "agencyA", brokerId: null, legalName: "Employer A", status: "active", dbName: "cust_a", ...over };
}

afterEach(() => {
  auditHooks.onSupportAccess = undefined;
});

describe("decideEmployerAccess — active employer", () => {
  test("platform_admin allowed, no audit", () => {
    const captured: SupportAccessEvent[] = [];
    auditHooks.onSupportAccess = (e) => captured.push(e);
    expect(() => decideEmployerAccess(ctxFor("platform_admin"), employer(), false)).not.toThrow();
    expect(captured).toHaveLength(0);
  });

  test("benefits_support_admin allowed AND audited", () => {
    const captured: SupportAccessEvent[] = [];
    auditHooks.onSupportAccess = (e) => captured.push(e);
    expect(() => decideEmployerAccess(ctxFor("benefits_support_admin"), employer({ id: "empX" }), false)).not.toThrow();
    expect(captured).toHaveLength(1);
    expect(captured[0].employerId).toBe("empX");
    expect(captured[0].roleKey).toBe("benefits_support_admin");
  });

  test("agency_admin allowed only for matching agency", () => {
    expect(() => decideEmployerAccess(ctxFor("agency_admin", "agencyA"), employer({ agencyId: "agencyA" }), false)).not.toThrow();
    expect(() => decideEmployerAccess(ctxFor("agency_admin", "agencyA"), employer({ agencyId: "agencyB" }), false)).toThrow("agency");
  });

  test("broker/employer_admin/employee require explicit access", () => {
    for (const role of ["broker", "employer_admin", "employee"]) {
      expect(() => decideEmployerAccess(ctxFor(role), employer(), true)).not.toThrow();
      expect(() => decideEmployerAccess(ctxFor(role), employer(), false)).toThrow(AuthError);
    }
  });

  test("scoped role with access does NOT trigger the support audit hook", () => {
    const captured: SupportAccessEvent[] = [];
    auditHooks.onSupportAccess = (e) => captured.push(e);
    decideEmployerAccess(ctxFor("employer_admin"), employer(), true);
    expect(captured).toHaveLength(0);
  });
});

describe("decideEmployerAccess — archived/disabled employer fails closed", () => {
  test("non-platform roles are denied even with explicit access", () => {
    expect(() => decideEmployerAccess(ctxFor("employer_admin"), employer({ status: "archived" }), true)).toThrow("not active");
    expect(() => decideEmployerAccess(ctxFor("agency_admin", "agencyA"), employer({ status: "archived", agencyId: "agencyA" }), false)).toThrow("not active");
  });

  test("platform/support may still access archived employers", () => {
    expect(() => decideEmployerAccess(ctxFor("platform_admin"), employer({ status: "archived" }), false)).not.toThrow();
  });
});
