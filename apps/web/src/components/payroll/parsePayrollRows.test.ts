// parsePayrollRows unit tests (FE-polish): the CSV-style import textarea parser.
import { test, expect, describe } from "bun:test";
import { parsePayrollRows } from "./PayrollDataForms";

describe("parsePayrollRows", () => {
  test("parses number+hours(+optional wages); blank lines skipped", () => {
    const { rows, error } = parsePayrollRows("EMP-1, 173.33, 7500\nEMP-2, 160\n\n");
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { employeeNumber: "EMP-1", hours: 173.33, wages: 7500 },
      { employeeNumber: "EMP-2", hours: 160 },
    ]);
  });
  test("rejects empty, missing number, bad hours, bad wages", () => {
    expect(parsePayrollRows("").error).toBe("Enter at least one payroll row");
    expect(parsePayrollRows(", 100").error).toContain("employee number is required");
    expect(parsePayrollRows("EMP-1, abc").error).toContain("bad hours");
    expect(parsePayrollRows("EMP-1, 2000").error).toContain("bad hours");
    expect(parsePayrollRows("EMP-1, 100, -5").error).toContain("bad wages");
  });
});
