/**
 * Enrollment Center / Progress read models — PURE derivation (Phase D-3).
 *
 * Both `enrollmentProgress` and `enrollmentCenter` are server-computed over the same
 * enrollment_event / enrollment_window / employee_election / enrollment_invitation /
 * waiver data; the repository gathers a single `EnrollmentCounts` bundle and these
 * pure functions project it into the two GraphQL shapes. `launchReadiness` is composed
 * from the D-1 checklist (readinessPercent = completionPct), so D-3 reuses D-1 rather
 * than re-deriving readiness. Read-only; no election/enrollment mutations.
 *
 * Field names/casing mirror the GraphQL SDL; the FE mapper display-cases where needed.
 */
import type { ChecklistStep, PlanYearSetupStatus } from "./plan-year-checklist.js";

export type LaunchState = "not_launched" | "launched" | "closed" | "archived";

/** Per-line election tallies (line = CoverageLine). */
export type LineTally = { line: string; benefitLabel: string; elected: number; waived: number; pending: number };

/** The single raw bundle the repository produces; both read models derive from it. */
export type EnrollmentCounts = {
  eligible: number;
  invited: number;
  submittedEmployees: number;
  inProgressEmployees: number;
  waivedCount: number;
  byLine: LineTally[];
  hasEvent: boolean;
  eventName: string | null;
  eventType: string | null;
  hasWindow: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  windowOpen: boolean; // window_end >= CURDATE() (computed in SQL for determinism)
  planYearStatus: string | null;
};

export type CoverageProgress = { name: string; elected: number; waived: number; pending: number };

export type EnrollmentProgress = {
  employerId: string;
  planYearId: string;
  status: string;
  submitted: number;
  inProgress: number;
  notStarted: number;
  notInvited: number;
  byCoverage: CoverageProgress[];
  reminders: null; // no reminder-schedule source in D-3 (Phase E)
  byBenefit: { name: string; completed: number; total: number }[] | null;
};

/** LaunchState from event/window presence + plan-year status + whether the window is open. */
export function deriveLaunchState(c: EnrollmentCounts): LaunchState {
  if (c.planYearStatus === "archived") return "archived";
  if (!c.hasEvent || !c.hasWindow) return "not_launched";
  return c.windowOpen ? "launched" : "closed";
}

/** Human status string for the progress header, from the launch state. */
export function progressStatusLabel(state: LaunchState): string {
  switch (state) {
    case "launched": return "In Progress";
    case "closed": return "Closed";
    case "archived": return "Archived";
    default: return "Not Started";
  }
}

/** notStarted = invited employees who haven't submitted or started. */
function notStartedOf(c: EnrollmentCounts): number {
  return Math.max(0, c.invited - c.submittedEmployees - c.inProgressEmployees);
}

export function buildEnrollmentProgress(employerId: string, planYearId: string, c: EnrollmentCounts): EnrollmentProgress {
  const state = deriveLaunchState(c);
  return {
    employerId,
    planYearId,
    status: progressStatusLabel(state),
    submitted: c.submittedEmployees,
    inProgress: c.inProgressEmployees,
    notStarted: notStartedOf(c),
    notInvited: Math.max(0, c.eligible - c.invited),
    byCoverage: c.byLine.map((l) => ({ name: l.benefitLabel, elected: l.elected, waived: l.waived, pending: l.pending })),
    reminders: null,
    byBenefit: c.byLine.map((l) => ({ name: l.benefitLabel, completed: l.elected + l.waived, total: l.elected + l.waived + l.pending })),
  };
}

// --- Enrollment Center (aggregate) ------------------------------------------

export type ReadinessItem = { key: string; label: string; severity: string; area: string; description: string | null };
export type ReadinessCheck = { key: string; label: string; status: string };
export type LaunchReadiness = {
  planYearStatus: string;
  readinessPercent: number;
  canLaunch: boolean;
  launchState: LaunchState;
  blockers: ReadinessItem[];
  warnings: ReadinessItem[];
  checklist: ReadinessCheck[];
};
export type OpenEnrollmentSummary = {
  completionPercent: number;
  eligible: number;
  submitted: number;
  inProgress: number;
  notStarted: number;
  needsAction: number;
  enrolled: number;
  waived: number;
  lateMissing: number;
  carrierFilesStatus: string | null;
};
export type EnrollmentWindow = {
  id: string;
  name: string;
  type: string;
  windowLabel: string | null;
  effectiveRule: string | null;
  employeesAffected: string | null;
  status: string;
  completion: number | null;
  nextAction: string | null;
};
export type OngoingWorkItem = {
  key: string;
  label: string;
  count: number;
  countLabel: string | null;
  status: string | null;
  urgency: string | null;
  nextAction: string | null;
  route: string | null;
};
export type EnrollmentCenter = {
  employerId: string;
  planYearId: string;
  launchState: LaunchState;
  launchReadiness: LaunchReadiness;
  openEnrollmentSummary: OpenEnrollmentSummary;
  windows: EnrollmentWindow[];
  ongoingWork: OngoingWorkItem[];
};

const CHECK_STATUS: Record<string, string> = {
  complete: "ready", not_applicable: "ready", blocked: "blocker", needs_attention: "warning",
};
function checkStatusOf(s: string): string {
  return CHECK_STATUS[s] ?? "warning";
}

/** Map the D-1 checklist into the LaunchReadiness read model (reuse, don't re-derive). */
export function buildLaunchReadiness(checklist: PlanYearSetupStatus, planYearStatus: string, state: LaunchState): LaunchReadiness {
  const itemOf = (s: ChecklistStep): ReadinessItem => ({
    key: s.key, label: s.label, severity: s.status === "blocked" ? "high" : "medium", area: s.category ?? "Setup", description: s.message,
  });
  const blockers = checklist.steps.filter((s) => s.status === "blocked").map(itemOf);
  const warnings = checklist.steps.filter((s) => s.status === "needs_attention").map(itemOf);
  return {
    planYearStatus,
    readinessPercent: checklist.completionPct,
    canLaunch: blockers.length === 0,
    launchState: state,
    blockers,
    warnings,
    checklist: checklist.steps.map((s) => ({ key: s.key, label: s.label, status: checkStatusOf(s.status) })),
  };
}

export function buildOpenEnrollmentSummary(c: EnrollmentCounts): OpenEnrollmentSummary {
  const notStarted = notStartedOf(c);
  const done = c.submittedEmployees; // submitted counts as OE-complete
  const denom = c.eligible || 1;
  return {
    completionPercent: Math.round((100 * done) / denom),
    eligible: c.eligible,
    submitted: c.submittedEmployees,
    inProgress: c.inProgressEmployees,
    notStarted,
    needsAction: c.inProgressEmployees + notStarted,
    enrolled: c.submittedEmployees,
    waived: c.waivedCount,
    lateMissing: Math.max(0, c.eligible - c.invited),
    carrierFilesStatus: "Not started", // carrier export status is Phase E — placeholder
  };
}

function windowLabel(c: EnrollmentCounts): string | null {
  return c.windowStart && c.windowEnd ? `${c.windowStart} – ${c.windowEnd}` : null;
}

export function buildWindows(eventId: string | null, c: EnrollmentCounts): EnrollmentWindow[] {
  if (!c.hasWindow || !eventId) return [];
  const state = deriveLaunchState(c);
  const status = state === "launched" ? "Open" : state === "closed" ? "Closed" : "Scheduled";
  return [{
    id: eventId,
    name: c.eventName ?? "Open Enrollment",
    type: c.eventType === "open_enrollment" ? "Open Enrollment" : (c.eventType ?? "Open Enrollment"),
    windowLabel: windowLabel(c),
    effectiveRule: null,
    employeesAffected: `${c.eligible} eligible`,
    status,
    completion: c.eligible ? Math.round((100 * c.submittedEmployees) / c.eligible) : 0,
    nextAction: state === "launched" ? "Monitor progress" : null,
  }];
}

/** A few derived ongoing-work items from the counts (labels/routes are static). */
export function buildOngoingWork(c: EnrollmentCounts): OngoingWorkItem[] {
  const items: OngoingWorkItem[] = [];
  const notInvited = Math.max(0, c.eligible - c.invited);
  if (notInvited > 0) items.push({ key: "not_invited", label: "Employees not yet invited", count: notInvited, countLabel: `${notInvited} not invited`, status: "open", urgency: "medium", nextAction: "Send invitations", route: "enrollment-progress" });
  const notStarted = notStartedOf(c);
  if (notStarted > 0) items.push({ key: "not_started", label: "Invited but not started", count: notStarted, countLabel: `${notStarted} not started`, status: "open", urgency: "low", nextAction: "Send reminder", route: "enrollment-progress" });
  if (c.inProgressEmployees > 0) items.push({ key: "in_progress", label: "Elections in progress", count: c.inProgressEmployees, countLabel: `${c.inProgressEmployees} in progress`, status: "open", urgency: "low", nextAction: "Monitor", route: "enrollment-progress" });
  return items;
}

export function buildEnrollmentCenter(
  employerId: string,
  planYearId: string,
  eventId: string | null,
  c: EnrollmentCounts,
  checklist: PlanYearSetupStatus
): EnrollmentCenter {
  const state = deriveLaunchState(c);
  return {
    employerId,
    planYearId,
    launchState: state,
    launchReadiness: buildLaunchReadiness(checklist, c.planYearStatus ?? "setup", state),
    openEnrollmentSummary: buildOpenEnrollmentSummary(c),
    windows: buildWindows(eventId, c),
    ongoingWork: buildOngoingWork(c),
  };
}
