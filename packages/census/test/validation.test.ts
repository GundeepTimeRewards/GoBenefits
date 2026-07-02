/**
 * Pure unit tests for census validation — NO database required, so these run
 * offline (no Docker/MySQL). Covers validateEmployeeInput rules.
 */
import { test, expect, describe } from "bun:test";
import { validateEmployeeInput, ValidationError } from "../src/validation";

const base = { employerId: "e1", firstName: "Ada", lastName: "Lovelace" };

describe("validateEmployeeInput", () => {
  test("accepts a minimal valid input", () => {
    expect(() => validateEmployeeInput({ ...base })).not.toThrow();
  });

  test("requires first name", () => {
    expect(() => validateEmployeeInput({ ...base, firstName: "" })).toThrow(ValidationError);
    expect(() => validateEmployeeInput({ ...base, firstName: "   " })).toThrow("First name");
  });

  test("requires last name", () => {
    expect(() => validateEmployeeInput({ ...base, lastName: "" })).toThrow("Last name");
  });

  test("requireEmail option enforces an email", () => {
    expect(() => validateEmployeeInput({ ...base }, { requireEmail: true })).toThrow("email is required");
    expect(() => validateEmployeeInput({ ...base, email: "a@b.co" }, { requireEmail: true })).not.toThrow();
  });

  test("rejects malformed email", () => {
    expect(() => validateEmployeeInput({ ...base, email: "not-an-email" })).toThrow("Email format");
  });

  test("rejects bad date formats", () => {
    expect(() => validateEmployeeInput({ ...base, hireDate: "03/15/2022" })).toThrow("valid date");
    expect(() => validateEmployeeInput({ ...base, dateOfBirth: "1986-13-40" })).toThrow("valid date");
  });

  test("accepts well-formed dates", () => {
    expect(() => validateEmployeeInput({ ...base, hireDate: "2022-03-15", terminationDate: "2024-01-01" })).not.toThrow();
  });

  test("rejects hire date after termination date", () => {
    expect(() => validateEmployeeInput({ ...base, hireDate: "2025-02-01", terminationDate: "2025-01-01" })).toThrow("after termination");
  });

  test("rejects invalid employment status", () => {
    expect(() => validateEmployeeInput({ ...base, employmentStatus: "vacationing" })).toThrow("employment status");
  });

  test("accepts valid employment status", () => {
    for (const s of ["active", "terminated", "cobra", "retired", "leave"]) {
      expect(() => validateEmployeeInput({ ...base, employmentStatus: s })).not.toThrow();
    }
  });

  test("empty/undefined optional dates are allowed", () => {
    expect(() => validateEmployeeInput({ ...base, hireDate: "", terminationDate: undefined })).not.toThrow();
  });
});
