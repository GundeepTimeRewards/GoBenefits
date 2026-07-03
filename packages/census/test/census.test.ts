/**
 * Census module tests (integration; requires local MySQL — see Phase 0).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the census slice enforces the SAME permission x scope x routing as the
 * foundation, plus validation.
 */
import { test, expect, describe, beforeAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, AuthError } from "@goben/data-access";
import { censusService, ValidationError } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const EMP_B = "eeee0000-0000-0000-0000-0000000000b2";
const EMP_C_ARCHIVED = "eeee0000-0000-0000-0000-0000000000c3";

beforeAll(async () => {
  await setupLocal();
});

describe("census authorization", () => {
  test("employer admin A can list employees for A", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const rows = await censusService.listEmployees(ctx, EMP_A, {});
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.lastName === "Anderson")).toBe(true);
  });

  test("employer admin A cannot list employees for B", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(censusService.listEmployees(ctx, EMP_B, {})).rejects.toThrow(AuthError);
  });

  test("broker assigned to A can list A but not B", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    const rows = await censusService.listEmployees(ctx, EMP_A, {});
    expect(rows.length).toBeGreaterThanOrEqual(2);
    await expect(censusService.listEmployees(ctx, EMP_B, {})).rejects.toThrow(AuthError);
  });

  test("employee role cannot list census (lacks employee.read)", async () => {
    const ctx = await buildAuthContext("sub-employee-a");
    await expect(censusService.listEmployees(ctx, EMP_A, {})).rejects.toThrow("Missing permission");
  });

  test("archived employer fails closed", async () => {
    const ctx = await buildAuthContext("sub-agency"); // has scope (same agency) + employee.read
    await expect(censusService.listEmployees(ctx, EMP_C_ARCHIVED, {})).rejects.toThrow("not active");
  });
});

describe("census writes", () => {
  test("createEmployee writes to the correct customer DB only", async () => {
    const ctxA = await buildAuthContext("sub-emp-admin-a");
    const num = `EMP-${Date.now()}`;
    const created = await censusService.createEmployee(ctxA, {
      employerId: EMP_A,
      firstName: "Test",
      lastName: "Person",
      email: "test.person@a.test",
      employeeNumber: num,
    });
    expect(created.firstName).toBe("Test");
    expect(created.employeeNumber).toBe(num);

    // Search by the unique number: the unfiltered list is LIMIT-windowed, and test
    // rows accumulate across local runs — presence must not depend on name ordering
    // keeping the new row inside the first page.
    const listA = await censusService.listEmployees(ctxA, EMP_A, { search: num });
    expect(listA.some((r) => r.employeeNumber === num)).toBe(true);

    // Must NOT appear in employer B (same targeted search on B's DB).
    const ctxB = await buildAuthContext("sub-emp-admin-b");
    const listB = await censusService.listEmployees(ctxB, EMP_B, { search: num });
    expect(listB.some((r) => r.employeeNumber === num)).toBe(false);
  });

  test("updateEmployee cannot cross tenants", async () => {
    const ctxA = await buildAuthContext("sub-emp-admin-a");
    // emp-admin-a has no scope on B -> blocked before any DB write.
    await expect(
      censusService.updateEmployee(ctxA, { employerId: EMP_B, employeeId: "b2220000-0000-0000-0000-000000000001", firstName: "x", lastName: "y" })
    ).rejects.toThrow(AuthError);
  });
});

describe("employee number", () => {
  test("create stores employeeNumber; duplicate is rejected (case-insensitive)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const num = `DUP-A${Date.now()}`;
    const created = await censusService.createEmployee(ctx, {
      employerId: EMP_A, firstName: "First", lastName: "One", employeeNumber: num,
    });
    expect(created.employeeNumber).toBe(num);
    // different case -> still a duplicate under utf8mb4_0900_ai_ci
    await expect(
      censusService.createEmployee(ctx, {
        employerId: EMP_A, firstName: "Second", lastName: "Two", employeeNumber: num.toLowerCase(),
      })
    ).rejects.toThrow("already exists");
  });

  test("update employeeNumber works and search finds it", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const created = await censusService.createEmployee(ctx, { employerId: EMP_A, firstName: "Up", lastName: "Date" });
    const newNum = `UPD-${Date.now()}`;
    const updated = await censusService.updateEmployee(ctx, {
      employerId: EMP_A, employeeId: created.employeeId, firstName: "Up", lastName: "Date", employeeNumber: newNum,
    });
    expect(updated.employeeNumber).toBe(newNum);
    const found = await censusService.listEmployees(ctx, EMP_A, { search: newNum });
    expect(found.some((r) => r.employeeId === created.employeeId)).toBe(true);
  });

  test("update cannot duplicate another employee's employeeNumber (but self is fine)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const stamp = Date.now();
    const n1 = `N1-${stamp}`;
    const n2 = `N2-${stamp}`;
    const e1 = await censusService.createEmployee(ctx, { employerId: EMP_A, firstName: "E", lastName: "One", employeeNumber: n1 });
    const e2 = await censusService.createEmployee(ctx, { employerId: EMP_A, firstName: "E", lastName: "Two", employeeNumber: n2 });
    await expect(
      censusService.updateEmployee(ctx, { employerId: EMP_A, employeeId: e2.employeeId, firstName: "E", lastName: "Two", employeeNumber: n1 })
    ).rejects.toThrow("already exists");
    // updating e1 to its own number must NOT conflict with itself
    const same = await censusService.updateEmployee(ctx, { employerId: EMP_A, employeeId: e1.employeeId, firstName: "E", lastName: "One", employeeNumber: n1 });
    expect(same.employeeNumber).toBe(n1);
  });
});

describe("census validation", () => {
  test("missing last name is rejected", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(
      censusService.createEmployee(ctx, { employerId: EMP_A, firstName: "NoLast", lastName: "" })
    ).rejects.toThrow(ValidationError);
  });

  test("hire date after termination date is rejected", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(
      censusService.createEmployee(ctx, {
        employerId: EMP_A,
        firstName: "Bad",
        lastName: "Dates",
        hireDate: "2025-02-01",
        terminationDate: "2025-01-01",
      })
    ).rejects.toThrow("after termination");
  });

  test("invalid employment status is rejected", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(
      censusService.createEmployee(ctx, { employerId: EMP_A, firstName: "Bad", lastName: "Status", employmentStatus: "vacationing" })
    ).rejects.toThrow(ValidationError);
  });
});

describe("employer census context", () => {
  test("returns employer name + counts for an authorized user", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const c = await censusService.employerCensusContext(ctx, EMP_A);
    expect(c.employerName).toBe("Employer A");
    expect(c.totalEmployees).toBeGreaterThanOrEqual(2);
  });

  test("satisfies all non-null GraphQL fields (incl. the C1 additions)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const c = await censusService.employerCensusContext(ctx, EMP_A, "a2220000-0000-0000-0000-000000000002");
    // Non-null in the schema — every one must be a concrete value.
    expect(c.employerId).toBe(EMP_A);
    expect(c.employerName).toBe("Employer A");
    expect(typeof c.totalEmployees).toBe("number");
    expect(typeof c.activeEmployees).toBe("number");
    expect(typeof c.missingRequiredCount).toBe("number");
    expect(typeof c.missingEligibilityClassCount).toBe("number");
    expect(typeof c.dependentsMissingDataCount).toBe("number");
    expect(typeof c.needsReviewCount).toBe("number");
    // planYearId echoes the requested plan year (contract is plan-year-scoped).
    expect(c.planYearId).toBe("a2220000-0000-0000-0000-000000000002");
  });
});
