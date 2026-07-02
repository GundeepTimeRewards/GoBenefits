/**
 * AppSync handler dispatch + argument-mapping tests (requires local MySQL — Phase 0).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the handler: dispatches each Phase C field to the right service, reads the
 * PUBLIC `employerId` arg (never `customerId`), maps DB role -> GraphQL Role in `me`,
 * returns the correct read-model SHAPES (incl. EmployerCensusContext non-null
 * completeness and the no-fan-out myEmployers shape), and fails closed.
 */
import { test, expect, describe, beforeAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { handler } from "../src/handler";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const EMP_B = "eeee0000-0000-0000-0000-0000000000b2";
const PY_2026 = "a2220000-0000-0000-0000-000000000002";
const ALICE_IN_A = "a1110000-0000-0000-0000-000000000001";

/** Invoke the resolver like AppSync would. */
function invoke(fieldName: string, sub: string | undefined, args: Record<string, any> = {}) {
  return handler({ info: { fieldName }, identity: { sub }, arguments: args });
}

beforeAll(async () => {
  await setupLocal();
});

describe("me — identity + role mapping (R6)", () => {
  test("platform admin -> super_admin, no bound employer", async () => {
    const me: any = await invoke("me", "sub-platform");
    expect(me.role).toBe("super_admin");
    expect(me.employerId).toBeNull();
    expect(me.userId).toBeTruthy();
    expect(me.email).toBe("platform@test");
  });

  test("employer admin -> employer_admin, bound to their single employer", async () => {
    const me: any = await invoke("me", "sub-emp-admin-a");
    expect(me.role).toBe("employer_admin");
    expect(me.employerId).toBe(EMP_A);
  });

  test("broker -> broker, no single bound employer (uses selector)", async () => {
    const me: any = await invoke("me", "sub-broker-a");
    expect(me.role).toBe("broker");
    expect(me.employerId).toBeNull();
  });
});

describe("myEmployers — control-plane only (no fan-out, R1)", () => {
  test("broker A sees only A; per-tenant metrics are null (not computed)", async () => {
    const list: any[] = (await invoke("myEmployers", "sub-broker-a")) as any[];
    expect(list.map((e) => e.employerId)).toEqual([EMP_A]);
    expect(list[0].name).toBe("Employer A");
    // R1: no per-tenant fan-out — counts/enrollment stay null in C1.
    expect(list[0].employeeCount).toBeNull();
    expect(list[0].currentPlanYearId).toBeNull();
  });
});

describe("employer / plan-year dispatch", () => {
  test("employer returns the composed detail read model", async () => {
    const emp: any = await invoke("employer", "sub-emp-admin-a", { employerId: EMP_A });
    expect(emp.employerId).toBe(EMP_A);
    expect(emp.name).toBe("Employer A");
    expect(emp.employeeCount).toBeGreaterThanOrEqual(2);
  });

  test("planYears + currentPlanYear dispatch to the employer service", async () => {
    const years: any[] = (await invoke("planYears", "sub-emp-admin-a", { employerId: EMP_A })) as any[];
    expect(years.length).toBeGreaterThanOrEqual(2);
    const current: any = await invoke("currentPlanYear", "sub-emp-admin-a", { employerId: EMP_A });
    expect(current.status).toBe("active");
  });
});

describe("census dispatch + arg mapping", () => {
  test("employees returns a connection { items, nextToken }", async () => {
    const conn: any = await invoke("employees", "sub-emp-admin-a", { employerId: EMP_A, planYearId: PY_2026 });
    expect(Array.isArray(conn.items)).toBe(true);
    expect(conn.items.length).toBeGreaterThanOrEqual(2);
    expect(conn.nextToken).toBeNull();
  });

  test("employerCensusContext satisfies ALL non-null GraphQL fields", async () => {
    const c: any = await invoke("employerCensusContext", "sub-emp-admin-a", { employerId: EMP_A, planYearId: PY_2026 });
    // Non-null in the schema:
    expect(c.employerId).toBe(EMP_A);
    expect(c.employerName).toBe("Employer A");
    expect(typeof c.totalEmployees).toBe("number");
    expect(typeof c.activeEmployees).toBe("number");
    expect(typeof c.missingRequiredCount).toBe("number");
    expect(typeof c.missingEligibilityClassCount).toBe("number");
    expect(typeof c.dependentsMissingDataCount).toBe("number");
    expect(typeof c.needsReviewCount).toBe("number");
    // planYearId is echoed from the request arg (nullable, but provided here).
    expect(c.planYearId).toBe(PY_2026);
  });

  test("handler reads employerId, NOT customerId (fails closed if only customerId given)", async () => {
    // A client passing the legacy `customerId` (and no employerId) must NOT be
    // silently honored — the handler only reads `employerId`.
    await expect(invoke("employees", "sub-emp-admin-a", { customerId: EMP_A })).rejects.toThrow();
  });
});

describe("dependents + mutation dispatch", () => {
  test("employeeDetail + dependents + add/remove dependent round-trip", async () => {
    const detail: any = await invoke("employeeDetail", "sub-emp-admin-a", { employerId: EMP_A, employeeId: ALICE_IN_A });
    expect(detail.firstName).toBe("Alice");

    const dep: any = await invoke("addDependent", "sub-emp-admin-a", {
      input: { employerId: EMP_A, employeeId: ALICE_IN_A, firstName: "Handler", lastName: "Dep", relationship: "child" },
    });
    expect(dep.firstName).toBe("Handler");

    const list: any[] = (await invoke("dependents", "sub-emp-admin-a", { employerId: EMP_A, employeeId: ALICE_IN_A })) as any[];
    expect(list.some((d) => d.dependentId === dep.dependentId)).toBe(true);

    const removed: any = await invoke("removeDependent", "sub-emp-admin-a", { employerId: EMP_A, dependentId: dep.dependentId });
    expect(removed.removed).toBe(true);
  });

  test("createEmployee dispatches with the employerId-carrying input", async () => {
    const num = `HND-${Date.now()}`;
    const created: any = await invoke("createEmployee", "sub-emp-admin-a", {
      input: { employerId: EMP_A, firstName: "Made", lastName: "ByHandler", employeeNumber: num },
    });
    expect(created.employeeNumber).toBe(num);
  });
});

describe("fail closed", () => {
  test("unknown identity is rejected before any dispatch", async () => {
    await expect(invoke("me", "sub-does-not-exist")).rejects.toThrow();
    await expect(invoke("me", undefined)).rejects.toThrow();
  });

  test("cross-tenant access is denied (employer admin A -> employer B)", async () => {
    await expect(invoke("employees", "sub-emp-admin-a", { employerId: EMP_B })).rejects.toThrow();
    await expect(invoke("planYears", "sub-emp-admin-a", { employerId: EMP_B })).rejects.toThrow();
  });

  test("unknown field has no resolver", async () => {
    await expect(invoke("notAField", "sub-platform")).rejects.toThrow("No resolver");
  });
});

/**
 * Error-surface mapping for AppSync (Option A). The handler sets the thrown error's
 * `name` (the channel the Lambda runtime reports as errorType, which the APPSYNC_JS
 * response handler surfaces via ctx.error.type) and keeps `errorType` for direct
 * inspection. These assert the type an AppSync client would receive.
 */
async function caught(p: Promise<unknown>): Promise<any> {
  try {
    await p;
    throw new Error("expected the call to reject, but it resolved");
  } catch (e) {
    return e;
  }
}

describe("typed error mapping (AppSync surface)", () => {
  test("AuthError (cross-tenant) -> Unauthorized", async () => {
    const e = await caught(invoke("employees", "sub-emp-admin-a", { employerId: EMP_B }));
    expect(e.name).toBe("Unauthorized");
    expect(e.errorType).toBe("Unauthorized");
  });

  test("AuthError (no identity) -> Unauthorized", async () => {
    const e = await caught(invoke("me", undefined));
    expect(e.name).toBe("Unauthorized");
    expect(e.errorType).toBe("Unauthorized");
  });

  test("ValidationError (missing last name) -> ValidationError", async () => {
    const e = await caught(
      invoke("createEmployee", "sub-emp-admin-a", { input: { employerId: EMP_A, firstName: "No", lastName: "" } })
    );
    expect(e.name).toBe("ValidationError");
    expect(e.errorType).toBe("ValidationError");
  });

  test("success path is unchanged (no error name/type leaks onto results)", async () => {
    const me: any = await invoke("me", "sub-platform");
    expect(me.role).toBe("super_admin");
    expect(me.errorType).toBeUndefined();
    expect(me.name).toBeUndefined();
  });
});

describe("all 14 C1 fields are wired to a resolver branch", () => {
  // Every C1 field must dispatch to a service (not fall through to the default
  // "No resolver" case). Args are intentionally minimal — a field may still reject
  // downstream (e.g. missing employerId -> Unauthorized), but NEVER with "No resolver".
  const FIELDS: Array<[string, Record<string, any>]> = [
    ["me", {}],
    ["myEmployers", {}],
    ["employer", {}],
    ["planYears", {}],
    ["currentPlanYear", {}],
    ["employerCensusContext", {}],
    ["employees", {}],
    ["employeeDetail", {}],
    ["dependents", {}],
    ["createEmployee", { input: {} }],
    ["updateEmployee", { input: {} }],
    ["addDependent", { input: {} }],
    ["updateDependent", { input: {} }],
    ["removeDependent", {}],
  ];

  test("count is exactly 14 (scope guard)", () => {
    expect(FIELDS.length).toBe(14);
  });

  for (const [field, args] of FIELDS) {
    test(`${field} dispatches (never "No resolver")`, async () => {
      try {
        await invoke(field, "sub-platform", args);
      } catch (e: any) {
        expect(String(e?.message)).not.toContain("No resolver");
      }
    });
  }
});
