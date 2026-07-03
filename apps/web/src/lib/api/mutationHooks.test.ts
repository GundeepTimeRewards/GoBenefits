// C1 mutation-hook tests: typed error mapping + variable mapping via the operation
// wrappers. (Full live-call/invalidation behavior is proven end-to-end by the
// SMOKE_MUTATIONS round-trip in local/c1-smoke.ts.)
import { test, expect, describe } from "bun:test";
import { toFormError, FormMutationError } from "./mutationHooks";
import { GraphQLClientError } from "./client";
import { operations } from "./operations";

describe("toFormError mapping", () => {
  test("ValidationError → validation", () => {
    const e = toFormError(new GraphQLClientError("ValidationError", "Last name is required"));
    expect(e).toBeInstanceOf(FormMutationError);
    expect(e.type).toBe("validation");
    expect(e.message).toBe("Last name is required");
  });
  test("Unauthorized → unauthorized", () => {
    expect(toFormError(new GraphQLClientError("Unauthorized", "Not authorized for this employer")).type).toBe("unauthorized");
  });
  test("other GraphQL / network → error", () => {
    expect(toFormError(new GraphQLClientError("GraphQL", "boom")).type).toBe("error");
    expect(toFormError(new GraphQLClientError("Network", "down")).type).toBe("error");
    expect(toFormError(new Error("weird")).type).toBe("error");
  });
  test("passes through an existing FormMutationError", () => {
    const orig = new FormMutationError("validation", "x");
    expect(toFormError(orig)).toBe(orig);
  });
});

describe("C1 mutation operation variable mapping", () => {
  test("createEmployee wraps input, drops undefined", () => {
    expect(operations.createEmployee.buildVariables({ input: { employerId: "e1", firstName: "A", lastName: "B", email: undefined } }))
      .toEqual({ input: { employerId: "e1", firstName: "A", lastName: "B" } });
  });
  test("updateEmployee wraps input incl. employeeId", () => {
    expect(operations.updateEmployee.buildVariables({ input: { employerId: "e1", employeeId: "emp9", firstName: "A", lastName: "B" } }))
      .toEqual({ input: { employerId: "e1", employeeId: "emp9", firstName: "A", lastName: "B" } });
  });
  test("addDependent wraps input incl. relationship", () => {
    expect(operations.addDependent.buildVariables({ input: { employerId: "e1", employeeId: "emp9", firstName: "K", lastName: "D", relationship: "child" } }))
      .toEqual({ input: { employerId: "e1", employeeId: "emp9", firstName: "K", lastName: "D", relationship: "child" } });
  });
  test("updateDependent wraps input incl. dependentId", () => {
    expect(operations.updateDependent.buildVariables({ input: { employerId: "e1", dependentId: "dep7", firstName: "K", lastName: "D", relationship: "other" } }))
      .toEqual({ input: { employerId: "e1", dependentId: "dep7", firstName: "K", lastName: "D", relationship: "other" } });
  });
  test("removeDependent uses employerId + dependentId", () => {
    expect(operations.removeDependent.buildVariables({ employerId: "e1", dependentId: "dep7" }))
      .toEqual({ employerId: "e1", dependentId: "dep7" });
  });
});

describe("plan-year lifecycle mutation variable mapping (Phase D-5)", () => {
  test("createPlanYear passes employerId + year + label", () => {
    expect(operations.createPlanYear.buildVariables({ employerId: "e1", year: 2027, label: "PY 2027" }))
      .toEqual({ employerId: "e1", year: 2027, label: "PY 2027" });
  });
  test("copyFromPriorYear passes employerId + fromPlanYearId + toYear", () => {
    expect(operations.copyFromPriorYear.buildVariables({ employerId: "e1", fromPlanYearId: "py26", toYear: 2027 }))
      .toEqual({ employerId: "e1", fromPlanYearId: "py26", toYear: 2027 });
  });
  test("activate/archive pass employerId + planYearId", () => {
    expect(operations.activatePlanYear.buildVariables({ employerId: "e1", planYearId: "py27" }))
      .toEqual({ employerId: "e1", planYearId: "py27" });
    expect(operations.archivePlanYear.buildVariables({ employerId: "e1", planYearId: "py26" }))
      .toEqual({ employerId: "e1", planYearId: "py26" });
  });
});
