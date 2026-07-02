/** Pure unit tests for employee-number normalization — no DB. */
import { test, expect, describe } from "bun:test";
import { normalizeEmployeeNumber } from "../src/normalize";

describe("normalizeEmployeeNumber", () => {
  test("trims surrounding whitespace", () => {
    expect(normalizeEmployeeNumber("  EMP-1001  ")).toBe("EMP-1001");
  });
  test("blank or whitespace-only becomes null", () => {
    expect(normalizeEmployeeNumber("")).toBeNull();
    expect(normalizeEmployeeNumber("   ")).toBeNull();
  });
  test("null/undefined stays null", () => {
    expect(normalizeEmployeeNumber(null)).toBeNull();
    expect(normalizeEmployeeNumber(undefined)).toBeNull();
  });
  test("preserves internal characters and case (case-insensitivity is a DB concern)", () => {
    expect(normalizeEmployeeNumber("emp-1001")).toBe("emp-1001");
    expect(normalizeEmployeeNumber("EMP 1001")).toBe("EMP 1001");
  });
});
