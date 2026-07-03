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

describe("Plans & Rates mutation variable mapping (Phase D-6)", () => {
  test("addPlan drops omitted carrierName", () => {
    const vars = operations.addPlan.buildVariables({ employerId: "e1", planYearId: "py", line: "vision", planName: "VSP Choice" });
    expect(vars).toEqual({ employerId: "e1", planYearId: "py", line: "vision", planName: "VSP Choice" });
    expect("carrierName" in vars).toBe(false);
  });
  test("duplicatePlan passes employerId + planId", () => {
    expect(operations.duplicatePlan.buildVariables({ employerId: "e1", planId: "p1" })).toEqual({ employerId: "e1", planId: "p1" });
  });
  test("importRates passes input verbatim", () => {
    const input = { effectiveDate: "2026-07-01", rows: [{ age: null, rateEe: 100, rateEeSpouse: null, rateEeChild: null, rateFamily: 250 }] };
    expect(operations.importRates.buildVariables({ employerId: "e1", planId: "p1", input })).toEqual({ employerId: "e1", planId: "p1", input });
  });
  test("updateContributionRule compacts the patch", () => {
    const vars = operations.updateContributionRule.buildVariables({ employerId: "e1", input: { pctEmployeeHealth: 75, pctEmployeeDental: undefined } });
    expect(vars).toEqual({ employerId: "e1", input: { pctEmployeeHealth: 75 } });
  });
});

describe("enrollment mutation variable mapping (Phase D-7)", () => {
  test("launchEnrollment passes employerId + planYearId", () => {
    expect(operations.launchEnrollment.buildVariables({ employerId: "e1", planYearId: "py" })).toEqual({ employerId: "e1", planYearId: "py" });
  });
  test("sendEnrollmentReminders drops omitted audience", () => {
    const vars = operations.sendEnrollmentReminders.buildVariables({ employerId: "e1", planYearId: "py" });
    expect(vars).toEqual({ employerId: "e1", planYearId: "py" });
    expect("audience" in vars).toBe(false);
    expect(operations.sendEnrollmentReminders.buildVariables({ employerId: "e1", planYearId: "py", audience: "not_started" }))
      .toEqual({ employerId: "e1", planYearId: "py", audience: "not_started" });
  });
  test("createEnrollmentWindow compacts optional input fields", () => {
    const vars = operations.createEnrollmentWindow.buildVariables({
      employerId: "e1", planYearId: "py",
      input: { type: "new_hire", windowStart: "2026-01-01", windowEnd: "2026-02-01", name: undefined },
    });
    expect(vars).toEqual({ employerId: "e1", planYearId: "py", input: { type: "new_hire", windowStart: "2026-01-01", windowEnd: "2026-02-01" } });
  });
});
