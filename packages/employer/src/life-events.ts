/**
 * Life-events derivation (Phase E-4) — pure functions building the LifeEventQueue
 * (HR surface) and EmployeeLifeEvent (self surface) shapes from repository rows.
 *
 * DB status → display status: submitted/under_review AND approved-awaiting-window
 * all read "Needs Review" (the mock's task math counts approved-awaiting-window
 * under pendingReview → the "open election windows" task); rejected reads
 * Completed with a denied note in nextStep.
 */
import type { LifeEventCaseRow } from "./life-event-repository.js";

export type LifeEventCaseView = {
  id: string;
  employee: string;
  eventType: string;
  status: string;
  documents: string | null;
  electionWindow: string | null;
  nextStep: string | null;
  submitted: string | null;
};

export type LifeEventQueueCounts = {
  pendingReview: number;
  needsDocuments: number;
  electionWindowsOpen: number;
  carrierPending: number;
  completedThisMonth: number;
};

export type LifeEventTask = { key: string; label: string; count: number };

export type LifeEventQueue = {
  employerId: string;
  planYearId: string;
  readOnly: boolean;
  counts: LifeEventQueueCounts;
  tasks: LifeEventTask[];
  cases: LifeEventCaseView[];
};

export function displayStatus(r: LifeEventCaseRow): string {
  switch (r.status) {
    case "needs_documents": return "Needs Documents";
    case "election_window_open": return "Election Window Open";
    case "payroll_carrier_pending": return "Carrier Pending";
    case "completed": case "rejected": return "Completed";
    default: return "Needs Review"; // submitted / under_review / approved-awaiting-window
  }
}

export function documentsLabel(r: LifeEventCaseRow): string {
  if (!r.documentationRequired) return "N/A";
  if (r.docsMissing > 0) return `${r.docsMissing} missing`;
  if (r.docsVerified > 0) return "Verified";
  if (r.docsUploaded > 0) return "Uploaded";
  return "Requested";
}

export function nextStep(r: LifeEventCaseRow): string {
  switch (r.status) {
    case "submitted": case "under_review": return "Review request & documents";
    case "needs_documents": return "Awaiting documents from employee";
    case "approved": return "Open election window";
    case "election_window_open": return "Employee completing elections";
    case "payroll_carrier_pending": return "Update carrier & payroll";
    case "rejected": return `Denied${r.approvalNotes ? ` — ${r.approvalNotes}` : ""}`;
    default: return "—";
  }
}

export function toCaseView(r: LifeEventCaseRow): LifeEventCaseView {
  return {
    id: r.id,
    employee: r.employee,
    eventType: r.eventType,
    status: displayStatus(r),
    documents: documentsLabel(r),
    electionWindow: r.electionWindow ?? "Not opened",
    nextStep: nextStep(r),
    submitted: r.submitted,
  };
}

export function buildLifeEventQueue(
  employerId: string,
  planYearId: string,
  planYearStatus: string | null,
  rows: LifeEventCaseRow[]
): LifeEventQueue {
  const cases = rows.map(toCaseView);
  const counts: LifeEventQueueCounts = {
    pendingReview: cases.filter((c) => c.status === "Needs Review").length,
    needsDocuments: cases.filter((c) => c.status === "Needs Documents").length,
    electionWindowsOpen: cases.filter((c) => c.status === "Election Window Open").length,
    carrierPending: cases.filter((c) => c.status === "Carrier Pending").length,
    completedThisMonth: cases.filter((c) => c.status === "Completed").length,
  };
  const approvedAwaitingWindow = rows.filter((r) => r.status === "approved").length;
  const tasks: LifeEventTask[] = [
    { key: "docs", label: "Requests need documents", count: counts.needsDocuments },
    { key: "windows", label: "Approved events need election windows", count: approvedAwaitingWindow },
    { key: "carrier", label: "Completed elections need carrier update", count: counts.carrierPending },
  ].filter((t) => t.count > 0);
  return { employerId, planYearId, readOnly: planYearStatus === "archived", counts, tasks, cases };
}

export type EmployeeLifeEventView = { id: string; type: string; date: string | null; status: string; documents: string | null };

export function toEmployeeEvent(r: LifeEventCaseRow): EmployeeLifeEventView {
  return { id: r.id, type: r.eventType, date: r.eventDate, status: displayStatus(r), documents: documentsLabel(r) };
}
