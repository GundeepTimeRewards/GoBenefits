/**
 * Elections Review derivation (Phase E-1) — pure functions building the
 * ElectionReview read model from repository rows. The queue is an EXCEPTION
 * queue (decision preserved from the roadmap): rows are one per election, and
 * the derived issue decides the action, not a mandatory per-election review.
 *
 * Issue precedence (first match wins):
 *   1. review_flag = eoi_requested   → eoi       (HR requested evidence of insurability)
 *   2. review_flag = docs_requested  → dependent  (HR requested dependent documents)
 *   3. employee_cost IS NULL         → cost       (deduction math not computed yet)
 *   4. none
 * Waivers are tracked in the dedicated `waiver` table (its own checklist step);
 * the counts surface them, the rows don't.
 */

export type ReviewRepoRow = {
  id: string;
  employeeName: string;
  eventType: string; // open_enrollment | new_hire | life_event
  planName: string;
  tier: string; // ee | ee_spouse | ee_child | family | waived
  dependents: number;
  eeCost: number | null;
  submittedAt: string | null;
  status: string; // submitted | approved | in_progress
  reviewFlag: string; // none | eoi_requested | docs_requested
  reviewNote: string | null;
};

export type ElectionReviewRow = {
  id: string;
  employee: string;
  electionType: string;
  plans: string;
  tier: string;
  dependents: number;
  issue: string | null;
  issueType: string; // eoi | dependent | cost | none
  eeCost: number;
  submitted: string | null;
  status: string; // Submitted | Approved | Sent Back
  action: string;
};

export type ElectionReviewCounts = {
  needsReview: number;
  readyToApprove: number;
  eoi: number;
  dependent: number;
  waiver: number;
  cost: number;
  approved: number;
};

export type ElectionReview = {
  employerId: string;
  planYearId: string;
  readOnly: boolean;
  counts: ElectionReviewCounts;
  rows: ElectionReviewRow[];
};

const EVENT_LABEL: Record<string, string> = {
  open_enrollment: "Open Enrollment",
  new_hire: "New Hire",
  life_event: "Life Event",
};
const TIER_LABEL: Record<string, string> = {
  ee: "Employee Only",
  ee_spouse: "Employee + Spouse",
  ee_child: "Employee + Child(ren)",
  family: "Family",
  waived: "Waived",
};

export function deriveIssue(r: ReviewRepoRow): { issue: string | null; issueType: string } {
  if (r.status === "approved") return { issue: null, issueType: "none" };
  if (r.reviewFlag === "eoi_requested") return { issue: "Evidence of insurability requested", issueType: "eoi" };
  if (r.reviewFlag === "docs_requested") return { issue: "Dependent documents requested", issueType: "dependent" };
  if (r.eeCost == null) return { issue: "Missing cost calculation", issueType: "cost" };
  return { issue: null, issueType: "none" };
}

export function deriveReviewRow(r: ReviewRepoRow): ElectionReviewRow {
  const { issue, issueType } = deriveIssue(r);
  const status = r.status === "approved" ? "Approved" : r.status === "in_progress" ? "Sent Back" : "Submitted";
  const action =
    status === "Approved" ? "View"
    : status === "Sent Back" ? "Awaiting Resubmission"
    : issueType === "eoi" ? "Review EOI"
    : issueType === "dependent" ? "Review Documents"
    : issueType === "cost" ? "Recalculate"
    : "Approve";
  return {
    id: r.id,
    employee: r.employeeName,
    electionType: EVENT_LABEL[r.eventType] ?? r.eventType,
    plans: r.planName,
    tier: TIER_LABEL[r.tier] ?? r.tier,
    dependents: r.dependents,
    issue,
    issueType,
    eeCost: r.eeCost ?? 0,
    submitted: r.submittedAt,
    status,
    action,
  };
}

export function deriveCounts(rows: ElectionReviewRow[], waiverCount: number): ElectionReviewCounts {
  const open = rows.filter((r) => r.status === "Submitted");
  return {
    needsReview: open.filter((r) => r.issueType !== "none").length,
    readyToApprove: open.filter((r) => r.issueType === "none").length,
    eoi: open.filter((r) => r.issueType === "eoi").length,
    dependent: open.filter((r) => r.issueType === "dependent").length,
    waiver: waiverCount,
    cost: open.filter((r) => r.issueType === "cost").length,
    approved: rows.filter((r) => r.status === "Approved").length,
  };
}

export function buildElectionReview(
  employerId: string,
  planYearId: string,
  planYearStatus: string | null,
  repoRows: ReviewRepoRow[],
  waiverCount: number
): ElectionReview {
  const rows = repoRows.map(deriveReviewRow);
  return {
    employerId,
    planYearId,
    readOnly: planYearStatus === "archived",
    counts: deriveCounts(rows, waiverCount),
    rows,
  };
}
