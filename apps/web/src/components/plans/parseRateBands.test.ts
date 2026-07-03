// parseRateBands unit tests (Phase D-6b): the CSV-style textarea → RateBandInput[]
// parser behind the Import Rates form.
import { test, expect, describe } from "bun:test";
import { parseRateBands } from "./PlanMutationForms";

describe("parseRateBands", () => {
  test("parses composite + age-banded rows with optional tiers", () => {
    const { rows, error } = parseRateBands("-, 612, 1285, 1150, 1835\n25, 300.50\n45, 495, , , 990");
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { age: null, rateEe: 612, rateEeSpouse: 1285, rateEeChild: 1150, rateFamily: 1835 },
      { age: 25, rateEe: 300.5, rateEeSpouse: null, rateEeChild: null, rateFamily: null },
      { age: 45, rateEe: 495, rateEeSpouse: null, rateEeChild: null, rateFamily: 990 },
    ]);
  });

  test("blank age means composite; blank lines are skipped", () => {
    const { rows } = parseRateBands("\n, 100\n\n");
    expect(rows).toEqual([{ age: null, rateEe: 100, rateEeSpouse: null, rateEeChild: null, rateFamily: null }]);
  });

  test("rejects empty input, bad age, missing EE, negative tier", () => {
    expect(parseRateBands("").error).toBe("Enter at least one rate row");
    expect(parseRateBands("abc, 100").error).toContain("bad age");
    expect(parseRateBands("25").error).toContain("EE rate is required");
    expect(parseRateBands("25, -3").error).toContain("bad EE rate");
    expect(parseRateBands("25, 100, -1").error).toContain("bad spouse rate");
  });
});
