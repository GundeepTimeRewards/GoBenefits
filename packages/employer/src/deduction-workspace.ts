/**
 * Deductions workspace derivation (Phase E-2b) — pure functions building the
 * DeductionsWorkspace read model from repository rows. Money renders as strings
 * here (the contract's totals/amount fields are display strings).
 */

export type DeductionRepoRow = {
  id: string;
  electionId: string | null;
  employee: string;
  plan: string;
  tier: string;
  effective: string | null;
  code: string | null;
  ee: number;
  er: number;
  processed: boolean;
  /** cost_ee of the most recent superseded (exported) row for the same election. */
  priorEe: number | null;
};

export type DeductionReviewRow = {
  id: string;
  employee: string;
  plan: string;
  tier: string;
  effective: string | null;
  payrollGroup: string | null;
  code: string | null;
  ee: string;
  er: string;
  changeType: string; // add | change | none
  status: string; // Ready | Needs Review | Exported
  issue: string | null;
};

export type DeductionChange = {
  id: string;
  employee: string;
  changeType: string;
  previous: string;
  new: string;
  effective: string | null;
  status: string;
};

export type DeductionReviewSummary = {
  readyToExport: number;
  needsReview: number;
  missingCode: number;
  amountChanged: number;
  effectiveThisPeriod: number;
  totalEe: string;
  totalEr: string;
};

export function fmtMoney(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function deriveChangeType(r: DeductionRepoRow): string {
  if (r.priorEe == null) return r.processed ? "none" : "add";
  return r.priorEe === r.ee ? "none" : "change";
}

export function deriveDeductionRow(r: DeductionRepoRow): DeductionReviewRow {
  const changeType = deriveChangeType(r);
  const status = r.processed ? "Exported" : r.code ? "Ready" : "Needs Review";
  return {
    id: r.id,
    employee: r.employee,
    plan: r.plan,
    tier: r.tier,
    effective: r.effective,
    payrollGroup: null, // deduction_schedule pay groups land with the payroll-data slice
    code: r.code,
    ee: fmtMoney(r.ee),
    er: fmtMoney(r.er),
    changeType,
    status,
    issue: r.code ? null : "Missing payroll code",
  };
}

export function deriveChanges(rows: DeductionRepoRow[]): DeductionChange[] {
  return rows
    .filter((r) => deriveChangeType(r) === "change")
    .map((r) => ({
      id: r.id,
      employee: r.employee,
      changeType: "Amount change",
      previous: fmtMoney(r.priorEe ?? 0),
      new: fmtMoney(r.ee),
      effective: r.effective,
      status: r.processed ? "Exported" : "Pending export",
    }));
}

export function deriveSummary(rows: DeductionRepoRow[], monthStart: string, monthEnd: string): DeductionReviewSummary {
  const unprocessed = rows.filter((r) => !r.processed);
  const missingCode = unprocessed.filter((r) => !r.code).length;
  return {
    readyToExport: unprocessed.filter((r) => r.code).length,
    needsReview: missingCode,
    missingCode,
    amountChanged: rows.filter((r) => deriveChangeType(r) === "change").length,
    effectiveThisPeriod: rows.filter((r) => r.effective != null && r.effective >= monthStart && r.effective <= monthEnd).length,
    totalEe: fmtMoney(rows.reduce((s, r) => s + r.ee, 0)),
    totalEr: fmtMoney(rows.reduce((s, r) => s + r.er, 0)),
  };
}
