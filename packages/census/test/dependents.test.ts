/**
 * Dependents + employee-detail integration tests (requires local MySQL — Phase 0).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves dependents enforce the same permission x scope x routing, can't cross
 * tenants, and attach only to employees in the same tenant DB.
 */
import { test, expect, describe, beforeAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, AuthError } from "@goben/data-access";
import { dependentService, ValidationError } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const EMP_B = "eeee0000-0000-0000-0000-0000000000b2";
const ALICE_IN_A = "a1110000-0000-0000-0000-000000000001"; // seeded employee in cust_employer_a

beforeAll(async () => {
  await setupLocal();
});

describe("dependents authorization & routing", () => {
  test("employer admin A can add, list, and see dependent in employee detail", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const dep = await dependentService.addDependent(ctx, {
      employerId: EMP_A, employeeId: ALICE_IN_A, firstName: "Dep", lastName: "Anderson", relationship: "child", dateOfBirth: "2015-05-01",
    });
    expect(dep.firstName).toBe("Dep");

    const list = await dependentService.listDependents(ctx, EMP_A, ALICE_IN_A);
    expect(list.some((d) => d.dependentId === dep.dependentId)).toBe(true);

    const detail = await dependentService.employeeDetail(ctx, EMP_A, ALICE_IN_A);
    expect(detail?.firstName).toBe("Alice");
    expect(detail?.dependents.some((d) => d.dependentId === dep.dependentId)).toBe(true);
  });

  test("employer admin A cannot add dependents for employer B", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(
      dependentService.addDependent(ctx, { employerId: EMP_B, employeeId: ALICE_IN_A, firstName: "X", lastName: "Y", relationship: "spouse" })
    ).rejects.toThrow(AuthError);
  });

  test("employer admin A cannot list dependents for employer B", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(dependentService.listDependents(ctx, EMP_B, ALICE_IN_A)).rejects.toThrow(AuthError);
  });

  test("broker assigned to A can manage A's dependents but not B's", async () => {
    const ctx = await buildAuthContext("sub-broker-a");
    const list = await dependentService.listDependents(ctx, EMP_A, ALICE_IN_A);
    expect(Array.isArray(list)).toBe(true);
    await expect(dependentService.listDependents(ctx, EMP_B, ALICE_IN_A)).rejects.toThrow(AuthError);
  });
});

describe("dependents validation", () => {
  test("cannot attach a dependent to a non-existent employee", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await expect(
      dependentService.addDependent(ctx, {
        employerId: EMP_A, employeeId: "ffffffff-0000-0000-0000-000000000000", firstName: "Ghost", lastName: "Child", relationship: "child",
      })
    ).rejects.toThrow(ValidationError);
  });

  test("update then remove a dependent", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const dep = await dependentService.addDependent(ctx, {
      employerId: EMP_A, employeeId: ALICE_IN_A, firstName: "Temp", lastName: "Dep", relationship: "other",
    });
    const updated = await dependentService.updateDependent(ctx, {
      employerId: EMP_A, dependentId: dep.dependentId, firstName: "Temp", lastName: "Dep", relationship: "spouse",
    });
    expect(updated.relationship).toBe("spouse");
    const res = await dependentService.removeDependent(ctx, EMP_A, dep.dependentId);
    expect(res.removed).toBe(true);
  });
});
