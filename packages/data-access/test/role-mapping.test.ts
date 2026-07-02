/**
 * Role mapping unit tests (OFFLINE — pure function, no DB). Proves the explicit,
 * closed DB-role-key -> GraphQL Role mapping (decision R6) and its fail-closed
 * behavior for unmapped keys.
 */
import { test, expect, describe } from "bun:test";
import { mapRoleKeyToGraphQL, RoleMappingError } from "../src/roles";

describe("role mapping (R6)", () => {
  test("maps every known DB role key to the correct GraphQL Role", () => {
    expect(mapRoleKeyToGraphQL("platform_admin")).toBe("super_admin");
    expect(mapRoleKeyToGraphQL("benefits_support_admin")).toBe("support");
    expect(mapRoleKeyToGraphQL("agency_admin")).toBe("agency_admin");
    expect(mapRoleKeyToGraphQL("broker")).toBe("broker");
    expect(mapRoleKeyToGraphQL("employer_admin")).toBe("employer_admin");
    expect(mapRoleKeyToGraphQL("employee")).toBe("employee");
  });

  test("fails closed for specialized employer sub-roles not in the GraphQL enum", () => {
    for (const key of ["employer_read_only", "employer_payroll_admin", "cobra_admin"]) {
      expect(() => mapRoleKeyToGraphQL(key)).toThrow(RoleMappingError);
    }
  });

  test("fails closed for an unknown/garbage role key", () => {
    expect(() => mapRoleKeyToGraphQL("root")).toThrow(RoleMappingError);
    expect(() => mapRoleKeyToGraphQL("")).toThrow(RoleMappingError);
  });
});
