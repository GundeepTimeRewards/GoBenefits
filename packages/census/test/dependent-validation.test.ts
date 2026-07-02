/** Pure unit tests for dependent validation — no DB required. */
import { test, expect, describe } from "bun:test";
import { validateDependentInput } from "../src/dependent-validation";
import { ValidationError } from "../src/validation";

const base = { employerId: "e1", employeeId: "emp1", firstName: "Taylor", lastName: "Lee", relationship: "spouse" };

describe("validateDependentInput", () => {
  test("accepts a valid dependent", () => {
    expect(() => validateDependentInput({ ...base, dateOfBirth: "1990-01-01" })).not.toThrow();
  });
  test("requires first and last name", () => {
    expect(() => validateDependentInput({ ...base, firstName: " " })).toThrow("first name");
    expect(() => validateDependentInput({ ...base, lastName: "" })).toThrow("last name");
  });
  test("requires a valid relationship", () => {
    expect(() => validateDependentInput({ ...base, relationship: "cousin" })).toThrow(ValidationError);
    for (const r of ["spouse", "child", "domestic_partner", "other"]) {
      expect(() => validateDependentInput({ ...base, relationship: r })).not.toThrow();
    }
  });
  test("rejects bad / future DOB", () => {
    expect(() => validateDependentInput({ ...base, dateOfBirth: "01-01-1990" })).toThrow("valid date");
    expect(() => validateDependentInput({ ...base, dateOfBirth: "3000-01-01" })).toThrow("future");
  });
});
