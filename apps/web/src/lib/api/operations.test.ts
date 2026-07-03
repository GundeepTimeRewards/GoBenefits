// C1 operation-wrapper tests: correct variable building + document coverage.
import { test, expect, describe } from "bun:test";
import { operations, C1_OPERATION_NAMES, runOperation } from "./operations";
import type { GraphQLClient } from "./client";

describe("C1 operation registry", () => {
  test("exposes the C1 operations + Phase D-1/D-2 read fields", () => {
    expect(C1_OPERATION_NAMES.length).toBe(17);
    for (const name of [
      "me", "myEmployers", "employer", "planYears", "currentPlanYear", "planYearSetupStatus",
      "planCatalog", "benefitPlanDetail", "employerCensusContext",
      "employees", "employeeDetail", "dependents",
      "createEmployee", "updateEmployee", "addDependent", "updateDependent", "removeDependent",
    ]) {
      expect(C1_OPERATION_NAMES).toContain(name as any);
    }
  });

  test("kinds are correct (12 queries, 5 mutations)", () => {
    const kinds = C1_OPERATION_NAMES.map((n) => operations[n].kind);
    expect(kinds.filter((k) => k === "query").length).toBe(12);
    expect(kinds.filter((k) => k === "mutation").length).toBe(5);
  });

  test("benefitPlanDetail builds employerId + planYearId + planId variables", () => {
    expect(operations.benefitPlanDetail.buildVariables({ employerId: "e", planYearId: "py", planId: "p" }))
      .toEqual({ employerId: "e", planYearId: "py", planId: "p" });
  });
});

describe("buildVariables — representative operations", () => {
  test("employees: includes provided args, omits undefined optionals", () => {
    const vars = operations.employees.buildVariables({ employerId: "e1", planYearId: "py1", search: "smith" });
    expect(vars).toEqual({ employerId: "e1", planYearId: "py1", search: "smith" });
    expect("limit" in vars).toBe(false);
    expect("nextToken" in vars).toBe(false);
  });

  test("employees: passes through all optionals when present", () => {
    const vars = operations.employees.buildVariables({ employerId: "e1", planYearId: "py1", limit: 25, nextToken: "tok" });
    expect(vars).toEqual({ employerId: "e1", planYearId: "py1", limit: 25, nextToken: "tok" });
  });

  test("employeeDetail: employerId + employeeId", () => {
    expect(operations.employeeDetail.buildVariables({ employerId: "e1", employeeId: "emp9" })).toEqual({
      employerId: "e1",
      employeeId: "emp9",
    });
  });

  test("dependents: employerId + employeeId", () => {
    expect(operations.dependents.buildVariables({ employerId: "e1", employeeId: "emp9" })).toEqual({
      employerId: "e1",
      employeeId: "emp9",
    });
  });

  test("planYears: employerId only", () => {
    expect(operations.planYears.buildVariables({ employerId: "e1" })).toEqual({ employerId: "e1" });
  });

  test("createEmployee: wraps input and drops undefined fields", () => {
    const vars = operations.createEmployee.buildVariables({
      input: { employerId: "e1", firstName: "Ada", lastName: "Lovelace", email: undefined },
    });
    expect(vars).toEqual({ input: { employerId: "e1", firstName: "Ada", lastName: "Lovelace" } });
  });

  test("addDependent: wraps input with relationship", () => {
    const vars = operations.addDependent.buildVariables({
      input: { employerId: "e1", employeeId: "emp9", firstName: "Kid", lastName: "Lovelace", relationship: "child" },
    });
    expect(vars).toEqual({ input: { employerId: "e1", employeeId: "emp9", firstName: "Kid", lastName: "Lovelace", relationship: "child" } });
  });
});

describe("documents mention their root field", () => {
  test("each operation's document references its GraphQL field name", () => {
    for (const name of C1_OPERATION_NAMES) {
      expect(operations[name].document).toContain(name);
    }
  });
});

describe("runOperation", () => {
  test("calls client.request with the document and built variables", async () => {
    const calls: Array<{ document: string; variables: unknown }> = [];
    const fakeClient: GraphQLClient = {
      configured: true,
      request: (async (document: string, variables: unknown) => {
        calls.push({ document, variables });
        return { employeeDetail: { employeeId: "emp9" } };
      }) as GraphQLClient["request"],
    };
    const data = await runOperation(fakeClient, operations.employeeDetail, { employerId: "e1", employeeId: "emp9" });
    expect(calls).toHaveLength(1);
    expect(calls[0].document).toBe(operations.employeeDetail.document);
    expect(calls[0].variables).toEqual({ employerId: "e1", employeeId: "emp9" });
    expect((data as any).employeeDetail.employeeId).toBe("emp9");
  });
});
