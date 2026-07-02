// Centralized, employer-keyed MOCK "database". Screens derive their data from the
// active employerId (from the route). No AppSync/backend — mock only. Keep all
// per-employer variation here rather than scattering `if employerId === ...`.
import type { CensusEmployee, Dependent, EmployeeDetail, EmployerCensusContext } from "@/lib/census-mock";
import { planYearChecklist, type ChecklistStep, type ReadinessStatus } from "@/lib/plan-year-checklist-mock";

export type EmployerProfile = {
  id: string;
  name: string;
  industry: string;
  employeeCount: number;
  activeCount: number;
  locations: number;
  renewalMonth: string;
  agency: string;
  broker: string;
  currentPlanYearId: string;
  currentPlanYearLabel: string;
  setupStatus: string;
  enrollmentState: "in_progress" | "setup_incomplete" | "closed" | "not_started";
  completion: number;
  issues: number;
};

export const EMPLOYERS: EmployerProfile[] = [
  { id: "acme", name: "Acme Manufacturing", industry: "Manufacturing", employeeCount: 482, activeCount: 460, locations: 3, renewalMonth: "Jan 1, 2027", agency: "Northwind Benefits Group", broker: "Alex Romero", currentPlanYearId: "2027", currentPlanYearLabel: "2027 Benefits", setupStatus: "Open Enrollment", enrollmentState: "in_progress", completion: 64, issues: 3 },
  { id: "northstar", name: "Northstar Dental Group", industry: "Dental / Healthcare", employeeCount: 64, activeCount: 58, locations: 1, renewalMonth: "Mar 1, 2027", agency: "Northwind Benefits Group", broker: "Sam Carter", currentPlanYearId: "2027", currentPlanYearLabel: "2027 Benefits", setupStatus: "Setup", enrollmentState: "setup_incomplete", completion: 22, issues: 5 },
  { id: "harbor", name: "Harbor Logistics", industry: "Logistics & Warehousing", employeeCount: 210, activeCount: 205, locations: 4, renewalMonth: "Oct 1, 2026", agency: "Summit Advisors", broker: "Priya Nair", currentPlanYearId: "2026", currentPlanYearLabel: "2026 Benefits", setupStatus: "Active", enrollmentState: "closed", completion: 100, issues: 0 },
  { id: "brightpath", name: "BrightPath Nonprofit", industry: "Nonprofit", employeeCount: 128, activeCount: 120, locations: 2, renewalMonth: "Jul 1, 2026", agency: "Summit Advisors", broker: "Priya Nair", currentPlanYearId: "2027", currentPlanYearLabel: "2027 Benefits", setupStatus: "Not Started", enrollmentState: "not_started", completion: 0, issues: 2 },
];

export function listEmployers(): EmployerProfile[] { return EMPLOYERS; }
export function getEmployerProfile(id: string): EmployerProfile { return EMPLOYERS.find((e) => e.id === id) ?? EMPLOYERS[0]; }
/** True only for a real employer id — used to reject bad/undefined route params so
 *  a stale URL can't poison the active-employer context (all keyed getters return []). */
export function isKnownEmployer(id: string | undefined | null): boolean { return !!id && EMPLOYERS.some((e) => e.id === id); }
export const DEFAULT_EMPLOYER_ID = EMPLOYERS[0].id;

// --- Census -----------------------------------------------------------------
function ce(
  employeeId: string, employeeNumber: string, firstName: string, lastName: string,
  employmentStatus: CensusEmployee["employmentStatus"], eligibilityClass: string | null,
  dependentCount: number, eligibilityStatus: boolean | null, email: string | null,
  dob: string | null,
): CensusEmployee {
  return {
    employeeId, employeeNumber, firstName, lastName, email, phone: null, dateOfBirth: dob,
    gender: null, employmentStatus, hireDate: null, terminationDate: null,
    employmentClass: eligibilityClass, eligibilityClass, payType: null, salary: null,
    addressSummary: null, dependentCount, eligibilityStatus,
  };
}

const CENSUS: Record<string, CensusEmployee[]> = {
  acme: [
    ce("a1", "EMP-1001", "Jordan", "Lee", "active", "Full-Time", 2, true, "jordan.lee@acme.com", "1986-05-14"),
    ce("a2", "EMP-1003", "Chris", "Wong", "active", null, 0, true, null, "1995-02-20"),
    ce("a3", "EMP-1006", "Emily", "Johnson", "active", "Full-Time", 1, null, null, "1998-04-18"),
  ],
  northstar: [
    ce("n1", "NS-01", "Nina", "Patel", "active", "Full-Time", 1, true, "nina@northstar.com", "1984-09-03"),
    ce("n2", "NS-02", "Omar", "Reyes", "active", null, 0, null, null, "1991-12-11"),
    ce("n3", "NS-03", "Grace", "Kim", "active", "Part-Time Eligible", 0, false, "grace@northstar.com", "1999-06-27"),
  ],
  harbor: [
    ce("h1", "HL-100", "Marcus", "Bell", "active", "Full-Time", 3, true, "mbell@harbor.com", "1980-01-22"),
    ce("h2", "HL-101", "Sofia", "Ramirez", "active", "Full-Time", 0, true, "sramirez@harbor.com", "1990-07-08"),
    ce("h3", "HL-102", "Wade", "Foster", "terminated", null, 0, false, "wfoster@harbor.com", "1978-03-30"),
  ],
  brightpath: [
    ce("b1", "BP-7", "Ava", "Thompson", "active", "Full-Time", 2, true, "ava@brightpath.org", "1988-11-19"),
    ce("b2", "BP-8", "Leo", "Martins", "active", null, 0, true, null, "1994-08-05"),
    ce("b3", "BP-9", "Hana", "Suzuki", "active", "Full-Time", 1, true, "hana@brightpath.org", "1996-02-14"),
  ],
};

export function getCensus(employerId: string): CensusEmployee[] { return CENSUS[employerId] ?? []; }

export function getCensusContext(employerId: string): EmployerCensusContext {
  const p = getEmployerProfile(employerId);
  const rows = getCensus(employerId);
  const missingRequired = rows.filter((r) => !r.email).length;
  const missingClass = rows.filter((r) => r.employmentStatus === "active" && !r.eligibilityClass).length;
  const needsReview = rows.filter((r) => r.eligibilityStatus === null).length + missingClass;
  return {
    employerId: p.id, employerName: p.name, planYearLabel: p.currentPlanYearLabel,
    totalEmployees: p.employeeCount, activeEmployees: p.activeCount,
    missingRequiredCount: missingRequired, missingEligibilityClassCount: missingClass,
    dependentsMissingDataCount: employerId === "acme" ? 1 : 0, needsReviewCount: needsReview,
  };
}

// --- Dependents + Employee detail -------------------------------------------
const DEPENDENTS: Record<string, Dependent[]> = {
  a1: [
    { dependentId: "a1-d1", firstName: "Taylor", lastName: "Lee", dateOfBirth: "1987-08-09", gender: "F", relationship: "spouse", disabled: false, student: false, coveredStatus: "covered" },
    { dependentId: "a1-d2", firstName: "Avery", lastName: "Lee", dateOfBirth: "2016-02-18", gender: "F", relationship: "child", disabled: false, student: true, coveredStatus: "covered" },
  ],
  n1: [{ dependentId: "n1-d1", firstName: "Raj", lastName: "Patel", dateOfBirth: "1983-04-01", gender: "M", relationship: "domestic_partner", disabled: false, student: false, coveredStatus: "pending" }],
  h1: [
    { dependentId: "h1-d1", firstName: "Diane", lastName: "Bell", dateOfBirth: "1982-05-05", gender: "F", relationship: "spouse", disabled: false, student: false, coveredStatus: "covered" },
    { dependentId: "h1-d2", firstName: "Owen", lastName: "Bell", dateOfBirth: "2012-09-12", gender: "M", relationship: "child", disabled: false, student: true, coveredStatus: "covered" },
    { dependentId: "h1-d3", firstName: "Mia", lastName: "Bell", dateOfBirth: "2015-01-30", gender: "F", relationship: "child", disabled: false, student: true, coveredStatus: "covered" },
  ],
  b1: [{ dependentId: "b1-d1", firstName: "Sam", lastName: "Thompson", dateOfBirth: "2014-10-10", gender: "M", relationship: "child", disabled: false, student: true, coveredStatus: "not_covered" }],
};

export function getEmployeeDetail(employerId: string, employeeId: string): EmployeeDetail | null {
  const row = getCensus(employerId).find((r) => r.employeeId === employeeId);
  if (!row) return null; // wrong employer / not found
  return {
    ...row, middleName: null, altEmail: null, homePhone: null, cellPhone: row.phone,
    addressLine1: null, city: null, state: null, zip: null, originalHireDate: row.hireDate,
    jobTitle: row.eligibilityClass ? `${row.eligibilityClass} employee` : null,
    dependents: DEPENDENTS[employeeId] ?? [],
  };
}

// --- Plan years -------------------------------------------------------------
export type PlanYearRow = {
  id: string; label: string; status: "Setup" | "OpenEnrollment" | "Active" | "Archived";
  period: string; oe: string; plans: number; completion: number;
  eligible: number; enrollment: number; blockers: number;
  // Open-enrollment phase context (only meaningful when status === "OpenEnrollment").
  oeDaysLeft?: number; needAction?: number;
};
const PLAN_YEARS: Record<string, PlanYearRow[]> = {
  acme: [
    { id: "2027", label: "2027 Benefits", status: "OpenEnrollment", period: "Jan 1 – Dec 31, 2027", oe: "Nov 1 – Nov 20, 2026", plans: 18, completion: 100, eligible: 482, enrollment: 64, blockers: 0, oeDaysLeft: 8, needAction: 22 },
    { id: "2026", label: "2026 Benefits", status: "Active", period: "Jan 1 – Dec 31, 2026", oe: "Closed", plans: 14, completion: 100, eligible: 468, enrollment: 100, blockers: 0 },
    { id: "2025", label: "2025 Benefits", status: "Archived", period: "Jan 1 – Dec 31, 2025", oe: "Closed", plans: 12, completion: 100, eligible: 441, enrollment: 100, blockers: 0 },
  ],
  northstar: [
    { id: "2027", label: "2027 Benefits", status: "Setup", period: "Jan 1 – Dec 31, 2027", oe: "Not scheduled", plans: 6, completion: 22, eligible: 58, enrollment: 0, blockers: 5 },
  ],
  harbor: [
    { id: "2026", label: "2026 Benefits", status: "Active", period: "Oct 1 – Sep 30, 2026", oe: "Closed", plans: 12, completion: 100, eligible: 205, enrollment: 100, blockers: 0 },
    { id: "2025", label: "2025 Benefits", status: "Archived", period: "Oct 1 – Sep 30, 2025", oe: "Closed", plans: 10, completion: 100, eligible: 198, enrollment: 100, blockers: 0 },
  ],
  brightpath: [
    { id: "2027", label: "2027 Benefits", status: "Setup", period: "Jan 1 – Dec 31, 2027", oe: "Not scheduled", plans: 0, completion: 0, eligible: 120, enrollment: 0, blockers: 2 },
  ],
};
export function getPlanYears(employerId: string): PlanYearRow[] { return PLAN_YEARS[employerId] ?? []; }

export type PlanYearActivity = { when: string; who: string; action: string };
const PLAN_YEAR_ACTIVITY: Record<string, PlanYearActivity[]> = {
  acme: [
    { when: "2h ago", who: "System", action: "Enrollment window opened for 2027 Benefits" },
    { when: "1d ago", who: "Jamie Bennett", action: "Updated medical plan rates for 2027" },
    { when: "3d ago", who: "Alex Romero", action: "Copied plans from 2026 into 2027" },
    { when: "Jan 1, 2026", who: "System", action: "Activated 2026 Benefits" },
    { when: "Dec 31, 2025", who: "System", action: "Archived 2025 Benefits" },
  ],
  northstar: [{ when: "5d ago", who: "Sam Carter", action: "Started 2027 plan year setup" }],
  harbor: [
    { when: "Sep 25, 2026", who: "System", action: "Closed 2026 open enrollment" },
    { when: "Oct 1, 2026", who: "System", action: "Activated 2026 Benefits" },
  ],
  brightpath: [{ when: "1w ago", who: "Priya Nair", action: "Created 2027 plan year" }],
};
export function getPlanYearActivity(employerId: string): PlanYearActivity[] { return PLAN_YEAR_ACTIVITY[employerId] ?? []; }

// --- Open-enrollment dashboard context (live OE phase) ----------------------
export type OeReminder = { date: string; audience: string; channel: string };
export type OeAttention = { title: string; priority: "High" | "Medium" | "Low"; to: string };
export type OeBenefitProgress = { name: string; completed: number; total: number };
export type OeDashboard = {
  insight: string;
  reminders: OeReminder[];
  attention: OeAttention[];
  byBenefit: OeBenefitProgress[];
};
const OE_DASHBOARD: Record<string, OeDashboard> = {
  acme: {
    insight: "Voluntary Life, Accident, and Critical Illness need the most follow-up.",
    reminders: [
      { date: "Nov 14, 2026", audience: "126 not started", channel: "Email" },
      { date: "Nov 17, 2026", audience: "47 in progress", channel: "Email + SMS" },
      { date: "Nov 19, 2026", audience: "All incomplete", channel: "Email + SMS" },
    ],
    attention: [
      { title: "22 employees need action (EOI, dependents, beneficiaries)", priority: "High", to: "/enrollment-progress" },
      { title: "126 employees have not started enrollment", priority: "High", to: "/enrollment-progress" },
      { title: "47 employees in progress with no activity in 3+ days", priority: "Medium", to: "/enrollment-progress" },
      { title: "Guardian Dental carrier export ready for validation", priority: "Low", to: "/carrier-exports" },
    ],
    byBenefit: [
      { name: "Medical", completed: 356, total: 482 },
      { name: "Dental", completed: 342, total: 482 },
      { name: "Vision", completed: 285, total: 482 },
      { name: "Voluntary Life", completed: 168, total: 482 },
      { name: "Accident", completed: 121, total: 482 },
      { name: "Critical Illness", completed: 98, total: 482 },
    ],
  },
};
export function getOpenEnrollmentDashboard(employerId: string): OeDashboard {
  return OE_DASHBOARD[employerId] ?? OE_DASHBOARD.acme;
}

// --- Enrollment events: launch readiness + enrollment windows ----------------
// Readiness/windows react to the ACTIVE PLAN YEAR status:
//   Setup → blockers/warnings + Launch flow · OpenEnrollment → live/launched
//   Active → closed · Archived → read-only archive.
export type ReadinessItem = { key: string; label: string; severity: "blocker" | "warning"; area: string; description: string };
export type ReadinessCheck = { key: string; label: string; status: "ready" | "blocker" | "warning" };
export type LaunchState = "not_launched" | "launched" | "closed" | "archived";
export type LaunchReadiness = {
  planYearStatus: PlanYearRow["status"];
  readinessPercent: number;
  blockers: ReadinessItem[];
  warnings: ReadinessItem[];
  canLaunch: boolean;
  launchState: LaunchState;
  checklist: ReadinessCheck[];
};

// Areas a broker/agency shouldn't be gated by — payroll is an employer concern.
export const PAYROLL_READINESS_AREAS = new Set(["Payroll", "Carriers"]);
const CHECK_AREAS = ["Eligibility", "Plans", "Rates", "Documents", "Window", "Invitation", "Payroll", "Carriers"];

const READINESS_ITEMS: Record<string, { blockers: ReadinessItem[]; warnings: ReadinessItem[] }> = {
  northstar: {
    blockers: [
      { key: "rates", label: "Medical rates not loaded", severity: "blocker", area: "Rates", description: "Aetna Open Access is missing tier rates." },
      { key: "eligibility", label: "Eligibility rules incomplete", severity: "blocker", area: "Eligibility", description: "2 classes need waiting-period rules." },
      { key: "invite", label: "Employee invitation email not approved", severity: "blocker", area: "Invitation", description: "Approve the OE announcement before launch." },
      { key: "window", label: "Enrollment window not scheduled", severity: "blocker", area: "Window", description: "Set the open enrollment open/close dates." },
      { key: "docs", label: "Plan documents missing", severity: "blocker", area: "Documents", description: "Upload SBCs for medical & vision." },
    ],
    warnings: [
      { key: "payroll", label: "3 payroll deduction exceptions", severity: "warning", area: "Payroll", description: "Review mapping before the first payroll." },
      { key: "carrier", label: "Carrier export mapping incomplete", severity: "warning", area: "Carriers", description: "Delta Dental 834 mapping is unfinished." },
    ],
  },
  brightpath: {
    blockers: [
      { key: "plans", label: "No benefit plans configured", severity: "blocker", area: "Plans", description: "Add at least one medical plan." },
      { key: "window", label: "Enrollment window not scheduled", severity: "blocker", area: "Window", description: "Set the open enrollment open/close dates." },
    ],
    warnings: [
      { key: "census", label: "8 employees missing required data", severity: "warning", area: "Eligibility", description: "Resolve census gaps before first payroll." },
    ],
  },
};
const DEFAULT_READINESS = {
  blockers: [{ key: "window", label: "Enrollment window not scheduled", severity: "blocker" as const, area: "Window", description: "Set the open enrollment open/close dates." }],
  warnings: [] as ReadinessItem[],
};

function readyChecklist(blockers: ReadinessItem[], warnings: ReadinessItem[], allReady = false): ReadinessCheck[] {
  return CHECK_AREAS.map((a) => {
    if (allReady) return { key: a, label: `${a} ready`, status: "ready" };
    if (blockers.some((b) => b.area === a)) return { key: a, label: `${a} ready`, status: "blocker" };
    if (warnings.some((w) => w.area === a)) return { key: a, label: `${a} ready`, status: "warning" };
    return { key: a, label: `${a} ready`, status: "ready" };
  });
}

export function getLaunchReadiness(employerId: string, planYearId: string): LaunchReadiness | null {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  if (!py) return null;
  if (py.status === "OpenEnrollment")
    return { planYearStatus: py.status, readinessPercent: 100, blockers: [], warnings: [], canLaunch: false, launchState: "launched", checklist: readyChecklist([], [], true) };
  if (py.status === "Active")
    return { planYearStatus: py.status, readinessPercent: 100, blockers: [], warnings: [], canLaunch: false, launchState: "closed", checklist: readyChecklist([], [], true) };
  if (py.status === "Archived")
    return { planYearStatus: py.status, readinessPercent: 100, blockers: [], warnings: [], canLaunch: false, launchState: "archived", checklist: readyChecklist([], [], true) };
  // Setup
  const items = READINESS_ITEMS[employerId] ?? DEFAULT_READINESS;
  return {
    planYearStatus: py.status,
    readinessPercent: py.completion,
    blockers: items.blockers,
    warnings: items.warnings,
    canLaunch: items.blockers.length === 0,
    launchState: "not_launched",
    checklist: readyChecklist(items.blockers, items.warnings),
  };
}

export type EnrollmentWindowType = "Open Enrollment" | "New Hire" | "Life Event" | "Special Enrollment";
export type EnrollmentWindow = {
  id: string; name: string; type: EnrollmentWindowType; windowLabel: string;
  effectiveRule: string; employeesAffected: string; status: string; completion: number; nextAction: string;
};

function oeWindowStatus(py: PlanYearRow): string {
  if (py.status === "OpenEnrollment") return "Open";
  if (py.status === "Active") return "Closed";
  if (py.status === "Archived") return "Closed";
  return py.blockers > 0 ? "Needs Attention" : "Ready to Launch"; // Setup
}
export function windowNextAction(status: string): string {
  switch (status) {
    case "Needs Attention": return "Resolve Blockers";
    case "Ready to Launch": return "Review Launch";
    case "Open": return "View Progress";
    case "Active": return "View Progress";
    case "Rolling": return "View Progress";
    case "Closed": return "View Results";
    case "Draft": return "Configure Window";
    default: return "Review";
  }
}
export function getEnrollmentWindows(employerId: string, planYearId: string): EnrollmentWindow[] {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  if (!py) return [];
  const oeStatus = oeWindowStatus(py);
  const effective = `Effective ${py.period.split("–")[0].trim()}`;
  const windows: EnrollmentWindow[] = [
    { id: "oe", name: `${py.label} Open Enrollment`, type: "Open Enrollment", windowLabel: py.oe, effectiveRule: effective, employeesAffected: `${py.eligible} eligible`, status: oeStatus, completion: py.enrollment, nextAction: windowNextAction(oeStatus) },
  ];
  if (py.status !== "Archived") {
    windows.push(
      { id: "nh", name: "New Hire Enrollment", type: "New Hire", windowLabel: "Rolling 30-day window", effectiveRule: "First of month after waiting period", employeesAffected: "12 pending", status: "Rolling", completion: 25, nextAction: windowNextAction("Rolling") },
      { id: "qle", name: "Life Event / QLE", type: "Life Event", windowLabel: "Rolling", effectiveRule: "Event based", employeesAffected: "3 pending", status: "Needs Attention", completion: 0, nextAction: "Review" },
      { id: "se", name: "Special Enrollment", type: "Special Enrollment", windowLabel: "As needed", effectiveRule: "Case based", employeesAffected: "—", status: "Draft", completion: 0, nextAction: windowNextAction("Draft") },
    );
  }
  return windows;
}

// --- Open Enrollment summary (ANNUAL OE ONLY — no new hire / QLE / special) --
// These numbers describe the annual open enrollment window exclusively. Mid-year
// work (new hire, QLE, special, corrections, COBRA) lives in OngoingEnrollmentWork.
export type OpenEnrollmentSummary = {
  completionPercent: number; // annual OE completion only
  eligible: number;
  submitted: number;   // completed during OE (elected or waived)
  inProgress: number;
  notStarted: number;
  needsAction: number;
  enrolled: number;    // elected during the annual OE window
  waived: number;      // waived during the annual OE window
  lateMissing: number; // eligible who didn't complete annual OE on time
  carrierFilesStatus: string; // carrier export readiness/result for annual OE
};
export function getOpenEnrollmentSummary(employerId: string, planYearId: string): OpenEnrollmentSummary | null {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  if (!py) return null;
  const en = getEnrollment(employerId);
  const eligible = py.eligible;
  const closedLike = py.status === "Active" || py.status === "Archived";
  const waived = Math.round(eligible * 0.12);          // ~12% waive rate during OE
  const enrolled = closedLike ? Math.max(0, eligible - waived) : Math.round((eligible * py.enrollment) / 100);
  return {
    completionPercent: py.enrollment,
    eligible,
    submitted: en.submitted,
    inProgress: en.inProgress,
    notStarted: en.notStarted,
    needsAction: py.needAction ?? 0,
    enrolled,
    waived,
    lateMissing: closedLike ? 0 : en.notStarted,
    carrierFilesStatus: closedLike ? "Ready" : "Pending",
  };
}

// --- Elections Review (review queues for submitted elections) ----------------
// Reviews submitted INTENT (employee_election). Active coverage (coverage_record)
// is created separately on approval + effective date. Plan-year aware.
export type ElectionIssueType = "none" | "eoi" | "dependent" | "waiver" | "cost";
export type ElectionStatus = "Needs Review" | "Ready to Approve" | "Approved";
export type ElectionAction = "Approve" | "Review" | "Request EOI" | "Request Documents" | "Review Waiver" | "Send Back" | "View";
export type ElectionRow = {
  id: string; employee: string; electionType: string; plans: string; tier: string;
  dependents: number; issue: string; issueType: ElectionIssueType; eeCost: number;
  submitted: string; status: ElectionStatus; action: ElectionAction;
};
export type ElectionReviewCounts = {
  needsReview: number; readyToApprove: number; eoi: number; dependent: number; waiver: number; cost: number; approved: number;
};
export type ElectionReview = { readOnly: boolean; counts: ElectionReviewCounts; rows: ElectionRow[] };

const ELECTION_BASE: ElectionRow[] = [
  { id: "1", employee: "Maria Patel", electionType: "OE Election", plans: "Medical + Dental + Vision", tier: "Family", dependents: 3, issue: "No issues", issueType: "none", eeCost: 310.6, submitted: "Nov 5, 2026", status: "Ready to Approve", action: "Approve" },
  { id: "2", employee: "Jordan Lee", electionType: "OE Election", plans: "HDHP + HSA", tier: "Employee + Spouse", dependents: 1, issue: "Dependent verification pending", issueType: "dependent", eeCost: 245.0, submitted: "Nov 6, 2026", status: "Needs Review", action: "Review" },
  { id: "3", employee: "Devon Brooks", electionType: "Voluntary Life", plans: "Voluntary Life", tier: "Employee Only", dependents: 0, issue: "EOI required", issueType: "eoi", eeCost: 18.0, submitted: "Nov 6, 2026", status: "Needs Review", action: "Request EOI" },
  { id: "4", employee: "Chris Wong", electionType: "Waiver", plans: "Waived Medical", tier: "No coverage", dependents: 0, issue: "Waiver reason missing", issueType: "waiver", eeCost: 0, submitted: "Nov 7, 2026", status: "Needs Review", action: "Review Waiver" },
  { id: "5", employee: "Dana Kim", electionType: "OE Election", plans: "Medical PPO", tier: "Family", dependents: 0, issue: "Tier / dependent mismatch", issueType: "dependent", eeCost: 286.42, submitted: "Nov 7, 2026", status: "Needs Review", action: "Send Back" },
  { id: "6", employee: "Priya Anand", electionType: "OE Election", plans: "Medical PPO", tier: "Employee + Child(ren)", dependents: 2, issue: "Deduction amount mismatch", issueType: "cost", eeCost: 210.3, submitted: "Nov 8, 2026", status: "Needs Review", action: "Review" },
  { id: "7", employee: "Sam Rivera", electionType: "OE Election", plans: "Dental", tier: "Employee Only", dependents: 0, issue: "No issues", issueType: "none", eeCost: 12.0, submitted: "Nov 3, 2026", status: "Approved", action: "View" },
  { id: "8", employee: "Alex Cho", electionType: "OE Election", plans: "Medical + Vision", tier: "Employee + Spouse", dependents: 1, issue: "No issues", issueType: "none", eeCost: 158.0, submitted: "Nov 4, 2026", status: "Approved", action: "View" },
];
function electionCounts(rows: ElectionRow[]): ElectionReviewCounts {
  const open = (t: ElectionIssueType) => rows.filter((r) => r.issueType === t && r.status !== "Approved").length;
  return {
    needsReview: rows.filter((r) => r.status === "Needs Review").length,
    readyToApprove: rows.filter((r) => r.status === "Ready to Approve").length,
    eoi: open("eoi"), dependent: open("dependent"), waiver: open("waiver"), cost: open("cost"),
    approved: rows.filter((r) => r.status === "Approved").length,
  };
}
export function getElectionReview(employerId: string, planYearId: string): ElectionReview {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  const status = py?.status ?? "Setup";
  if (status === "Setup") return { readOnly: false, counts: electionCounts([]), rows: [] }; // no submissions yet
  if (status === "Archived") {
    const rows = ELECTION_BASE.map((r) => ({ ...r, status: "Approved" as ElectionStatus, action: "View" as ElectionAction }));
    return { readOnly: true, counts: electionCounts(rows), rows };
  }
  return { readOnly: false, counts: electionCounts(ELECTION_BASE), rows: ELECTION_BASE }; // OpenEnrollment / Active
}

// --- Life Events work queue (HR/admin — manage submitted LE cases) ----------
// Employer/admin manages employee-submitted life event REQUESTS (separate from the
// employee Report Life Event wizard). Plan-year aware.
export type LifeEventCaseStatus = "Needs Review" | "Needs Documents" | "Election Window Open" | "Carrier Pending" | "Completed";
export type LifeEventCase = {
  id: string; employee: string; eventType: string; status: LifeEventCaseStatus;
  documents: string; electionWindow: string; nextStep: string; submitted: string;
};
export type LifeEventQueueCounts = { pendingReview: number; needsDocuments: number; electionWindowsOpen: number; carrierPending: number; completedThisMonth: number };
export type LifeEventTask = { key: string; label: string; count: number };
export type LifeEventQueue = { readOnly: boolean; counts: LifeEventQueueCounts; tasks: LifeEventTask[]; cases: LifeEventCase[] };

const LIFE_EVENT_CASES: LifeEventCase[] = [
  { id: "le1", employee: "Jordan Lee", eventType: "Birth or Adoption", status: "Needs Review", documents: "1 missing", electionWindow: "Not opened", nextStep: "Review request & documents", submitted: "Mar 15, 2027" },
  { id: "le2", employee: "Maria Patel", eventType: "Marriage", status: "Needs Documents", documents: "Requested", electionWindow: "Not opened", nextStep: "Await marriage certificate", submitted: "Feb 2, 2027" },
  { id: "le3", employee: "Devon Brooks", eventType: "Loss of Other Coverage", status: "Election Window Open", documents: "Verified", electionWindow: "Open · closes Apr 10", nextStep: "Employee completing elections", submitted: "Mar 20, 2027" },
  { id: "le4", employee: "Chris Wong", eventType: "Divorce", status: "Carrier Pending", documents: "Verified", electionWindow: "Closed", nextStep: "Update carrier & payroll", submitted: "Jan 28, 2027" },
  { id: "le5", employee: "Priya Anand", eventType: "Dependent Aging Out", status: "Needs Review", documents: "N/A", electionWindow: "Not opened", nextStep: "Confirm eligibility change", submitted: "Mar 25, 2027" },
  { id: "le6", employee: "Sam Rivera", eventType: "Birth or Adoption", status: "Completed", documents: "Verified", electionWindow: "Closed", nextStep: "—", submitted: "Jan 10, 2027" },
  { id: "le7", employee: "Alex Cho", eventType: "Marriage", status: "Completed", documents: "Verified", electionWindow: "Closed", nextStep: "—", submitted: "Jan 5, 2027" },
];
function lifeEventCounts(cases: LifeEventCase[]): LifeEventQueueCounts {
  return {
    pendingReview: cases.filter((c) => c.status === "Needs Review").length,
    needsDocuments: cases.filter((c) => c.status === "Needs Documents").length,
    electionWindowsOpen: cases.filter((c) => c.status === "Election Window Open").length,
    carrierPending: cases.filter((c) => c.status === "Carrier Pending").length,
    completedThisMonth: cases.filter((c) => c.status === "Completed").length,
  };
}
export function getLifeEventQueue(employerId: string, planYearId: string): LifeEventQueue {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  if ((py?.status ?? "Setup") === "Archived") {
    const cases = LIFE_EVENT_CASES.map((c) => ({ ...c, status: "Completed" as LifeEventCaseStatus, nextStep: "—", electionWindow: "Closed" }));
    return { readOnly: true, counts: lifeEventCounts(cases), tasks: [], cases };
  }
  const cases = LIFE_EVENT_CASES;
  const counts = lifeEventCounts(cases);
  const tasks: LifeEventTask[] = ([
    { key: "docs", label: "Requests need documents", count: counts.needsDocuments },
    { key: "windows", label: "Approved events need election windows", count: counts.pendingReview },
    { key: "carrier", label: "Completed elections need carrier update", count: counts.carrierPending },
    { key: "aging", label: "Dependent aging-out reviews due", count: cases.filter((c) => c.eventType === "Dependent Aging Out" && c.status !== "Completed").length },
  ]).filter((t) => t.count > 0);
  return { readOnly: false, counts, tasks, cases };
}

// --- Documents & Forms workspace (plan-year + employer aware) ----------------
export type DocStatus = "Published" | "Missing" | "Pending" | "Pending Employee Action" | "Generated" | "Expiring Soon" | "Draft" | "Archived";
export type DocCategoryName = "Plan Documents" | "Employee Forms" | "EOI Forms" | "Dependent Verification" | "Employer Forms" | "Compliance Notices";
export type DocRow = {
  id: string; name: string; type: string; category: DocCategoryName; coverage: string; carrier: string;
  related: string; requiredFor: string; status: DocStatus; uploaded: string; expires: string;
};
export type DocReadinessTone = "danger" | "warning" | "info" | "success";
export type DocReadinessIssue = { key: string; label: string; count: number; tone: DocReadinessTone };
export type DocTask = { key: string; label: string; related: string; priority: "High" | "Medium" | "Low"; area: string };
export type DocCategoryCount = { title: DocCategoryName; total: number; sub: string };
export type DocumentWorkspace = {
  readinessPercent: number; missingCount: number; employeeActionCount: number; expiringSoonCount: number;
  readOnly: boolean; issues: DocReadinessIssue[]; tasks: DocTask[]; categories: DocCategoryCount[]; docs: DocRow[];
};
const DOC_TYPE_BY_LINE: Record<string, string> = { Medical: "SBC", Dental: "Plan Summary", Vision: "Carrier Brochure", "Life & Disability": "Certificate", Voluntary: "Carrier Brochure" };

export function getDocumentWorkspace(employerId: string, planYearId: string): DocumentWorkspace {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  const employerName = getEmployerProfile(employerId).name;
  const status = py?.status ?? "Setup";
  const archived = status === "Archived";
  const closed = status === "Active";
  const live = status === "OpenEnrollment" || status === "Setup";
  const label = py?.label ?? "Plan Year";
  const expires = `Dec 31, ${py?.id ?? "2027"}`;
  const stForm = (open: DocStatus, act: DocStatus, arc: DocStatus): DocStatus => (archived ? arc : closed ? act : open);

  // Plan documents from the employer's ACTUAL benefit plans (SBC / summary / brochure).
  const plans = getBenefitPlans(employerId);
  const planDocs: DocRow[] = plans.map((p) => {
    const type = DOC_TYPE_BY_LINE[p.line] ?? "Plan Summary";
    const missingDoc = p.setupIssues.some((i) => /document|brochure/i.test(i));
    const st: DocStatus = archived ? "Archived" : closed ? "Published" : missingDoc ? "Missing" : "Published";
    return { id: `pd-${p.id}`, name: `${p.name} ${type}`, type, category: "Plan Documents", coverage: p.line, carrier: p.carrier, related: p.name, requiredFor: `${p.line} Enrollees`, status: st, uploaded: st === "Missing" ? "—" : "Oct 12, 2026", expires: st === "Missing" ? "—" : expires };
  });
  const hasVolLife = plans.some((p) => /life|voluntary/i.test(p.line));

  const standardDocs: DocRow[] = [
    { id: "guide", name: `${label} Benefits Guide`, type: "Benefit Guide", category: "Plan Documents", coverage: "All Coverages", carrier: employerName, related: `${label} Open Enrollment`, requiredFor: "All Employees", status: archived ? "Archived" : "Published", uploaded: "Oct 15, 2026", expires },
    ...(hasVolLife ? [{ id: "eoi", name: "Voluntary Life EOI Form", type: "EOI Form", category: "EOI Forms" as DocCategoryName, coverage: "Voluntary Life", carrier: "MetLife", related: "Voluntary Life", requiredFor: "Employees over GI limit", status: stForm("Pending Employee Action", "Published", "Archived"), uploaded: "Generated Nov 3, 2026", expires: "—" }] : []),
    { id: "verif", name: "Dependent Verification Request", type: "Verification Form", category: "Dependent Verification", coverage: "Medical/Dental/Vision", carrier: employerName, related: "Dependents", requiredFor: "Employees with new dependents", status: stForm("Pending", "Published", "Archived"), uploaded: "Generated Nov 1, 2026", expires: live ? "Nov 20, 2026" : "—" },
    { id: "confirm", name: `${label} Enrollment Confirmation Statement`, type: "Confirmation Statement", category: "Employee Forms", coverage: "All Coverages", carrier: employerName, related: "Employee Elections", requiredFor: "Submitted Employees", status: archived ? "Archived" : status === "Setup" ? "Draft" : "Generated", uploaded: "Nov 1–20, 2026", expires: "—" },
    { id: "empapp", name: `${label} Employer Application`, type: "Employer Application", category: "Employer Forms", coverage: "All Coverages", carrier: employerName, related: "Carrier Setup", requiredFor: "Employer Signature", status: archived ? "Archived" : status === "Setup" ? "Pending" : "Published", uploaded: status === "Setup" ? "—" : "Oct 1, 2026", expires: "—" },
    { id: "aca", name: `${label} ACA / Plan Notices`, type: "Compliance Notice", category: "Compliance Notices", coverage: "All Coverages", carrier: employerName, related: "Compliance", requiredFor: "All Employees", status: archived ? "Archived" : "Published", uploaded: "Oct 1, 2026", expires: "—" },
  ];
  const docs = [...planDocs, ...standardDocs];

  const READY = new Set<DocStatus>(["Published", "Generated", "Archived"]);
  const readinessPercent = docs.length ? Math.round((docs.filter((d) => READY.has(d.status)).length / docs.length) * 100) : 100;
  const missingCount = docs.filter((d) => d.status === "Missing").length;
  const eoiPending = live && hasVolLife ? 19 : 0;
  const verificationPending = live ? 14 : 0;
  const employeeActionCount = eoiPending + verificationPending;
  const expiringSoonCount = status === "OpenEnrollment" ? 3 : 0;
  const employerUnsigned = standardDocs.find((d) => d.id === "empapp")!.status !== "Published" ? 1 : 0;

  const issues: DocReadinessIssue[] = archived || closed ? [] : ([
    { key: "missing-sbc", label: "Missing SBCs", count: docs.filter((d) => d.status === "Missing" && (d.type === "SBC" || d.type === "Plan Summary")).length, tone: "danger" as const },
    { key: "missing-brochure", label: "Missing carrier brochures", count: docs.filter((d) => d.status === "Missing" && d.type === "Carrier Brochure").length, tone: "warning" as const },
    { key: "eoi", label: "EOI forms pending", count: eoiPending, tone: "warning" as const },
    { key: "verification", label: "Dependent verification pending", count: verificationPending, tone: "info" as const },
    { key: "employer-app", label: "Employer application not signed", count: employerUnsigned, tone: "danger" as const },
    { key: "expiring", label: "Plan documents expiring soon", count: expiringSoonCount, tone: "warning" as const },
  ]).filter((i) => i.count > 0);

  const liveTasks: DocTask[] = [
    ...docs.filter((d) => d.status === "Missing").map((d) => ({ key: `up-${d.id}`, label: `Upload ${d.name}`, related: `${d.coverage} · ${d.type}`, priority: "High" as const, area: "carrier" })),
    ...(eoiPending ? [{ key: "eoi", label: `Review ${eoiPending} EOI-required elections`, related: "Voluntary Life", priority: "High" as const, area: "eoi" }] : []),
    ...(verificationPending ? [{ key: "verif", label: `Request ${verificationPending} dependent verification documents`, related: "Medical/Dental/Vision", priority: "Medium" as const, area: "verification" }] : []),
    ...(employerUnsigned ? [{ key: "empapp", label: "Employer application signature pending", related: "Employer Forms", priority: "Medium" as const, area: "employer" }] : []),
    ...(expiringSoonCount ? [{ key: "expiring", label: `${expiringSoonCount} plan documents expire within 30 days`, related: "Plan Documents", priority: "Medium" as const, area: "plan" }] : []),
    { key: "payroll", label: "Collect payroll deduction authorization forms", related: "Payroll", priority: "Low" as const, area: "payroll" },
  ];
  const tasks: DocTask[] = archived ? [] : closed ? [{ key: "archive", label: "Archive prior-year confirmation statements", related: "Employee Forms", priority: "Low", area: "plan" }] : liveTasks;

  const CATS: DocCategoryName[] = ["Plan Documents", "Employee Forms", "EOI Forms", "Dependent Verification", "Employer Forms", "Compliance Notices"];
  const categories: DocCategoryCount[] = CATS.map((title) => {
    const inCat = docs.filter((d) => d.category === title);
    const pending = inCat.filter((d) => !READY.has(d.status)).length;
    const sub = archived ? "Archived" : pending > 0 ? `${pending} need action` : inCat.length ? "Ready" : "None yet";
    return { title, total: inCat.length, sub };
  });

  return { readinessPercent, missingCount, employeeActionCount, expiringSoonCount, readOnly: archived, issues, tasks, categories, docs };
}

// --- Ongoing enrollment work (year-round, outside annual OE) -----------------
// New hires, QLEs, special enrollments, and pending documents keep flowing even
// after annual open enrollment closes. Employer + plan-year aware; [] for archived.
export type OngoingWorkUrgency = "high" | "medium" | "low";
export type OngoingWorkRoute = "enrollment-progress" | "life-events" | "documents" | "enrollment-events";
export type OngoingWorkItem = {
  key: string; label: string; count: number; countLabel: string;
  status: string; urgency: OngoingWorkUrgency; nextAction: string; route: OngoingWorkRoute;
};
const ONGOING_COUNTS: Record<string, { newHire: number; qle: number; special: number; docs: number }> = {
  acme: { newHire: 12, qle: 3, special: 1, docs: 7 },
  northstar: { newHire: 2, qle: 0, special: 0, docs: 4 },
  harbor: { newHire: 5, qle: 1, special: 0, docs: 0 },
  brightpath: { newHire: 0, qle: 0, special: 0, docs: 2 },
};
export function getOngoingEnrollmentWork(employerId: string, planYearId: string): OngoingWorkItem[] {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  if (!py || py.status === "Archived") return []; // archived → ongoing work hidden
  const c = ONGOING_COUNTS[employerId] ?? { newHire: 0, qle: 0, special: 0, docs: 0 };
  return [
    { key: "newhire", label: "New Hire Enrollment", count: c.newHire, countLabel: c.newHire ? `${c.newHire} pending` : "None pending", status: "Rolling 30-day window", urgency: c.newHire > 10 ? "high" : c.newHire > 0 ? "medium" : "low", nextAction: "View Progress", route: "enrollment-progress" },
    { key: "qle", label: "Life Event / QLE", count: c.qle, countLabel: c.qle ? `${c.qle} need review` : "None open", status: "Documentation pending", urgency: c.qle > 0 ? "high" : "low", nextAction: "Review", route: "life-events" },
    { key: "special", label: "Special Enrollment", count: c.special, countLabel: c.special ? `${c.special} draft window` : "None active", status: "Configuration", urgency: c.special > 0 ? "medium" : "low", nextAction: "Configure", route: "enrollment-events" },
    { key: "docs", label: "Pending Documents", count: c.docs, countLabel: c.docs ? `${c.docs} missing forms` : "All received", status: "Awaiting upload", urgency: c.docs > 5 ? "high" : c.docs > 0 ? "medium" : "low", nextAction: "View Issues", route: "documents" },
  ];
}

// --- Plan year setup checklist (statuses vary by employer) ------------------
function statusForEmployer(employerId: string, base: ReadinessStatus, index: number): ReadinessStatus {
  switch (employerId) {
    case "harbor": // fully set up
      return base === "not_applicable" ? "not_applicable" : "complete";
    case "brightpath": // nothing started
      return base === "not_applicable" ? "not_applicable" : "not_started";
    case "northstar": // early setup, a couple problems
      if (index < 2) return "complete";
      if (index === 5) return "needs_attention"; // rates
      if (index >= 14) return "blocked"; // carrier steps
      return index < 4 ? "in_progress" : "not_started";
    default: // acme keeps the varied base statuses
      return base;
  }
}
export function getPlanYearChecklist(employerId: string, _planYearId: string): ChecklistStep[] {
  return planYearChecklist.map((s, i) => ({ ...s, status: statusForEmployer(employerId, s.status, i) }));
}

// --- Benefit plans ----------------------------------------------------------
export type BenefitPlanRow = {
  id: string; line: string; name: string; carrier: string; subtype: string;
  enrolled: number; status: string; effective: string; setupIssues: string[];
};
const BENEFIT_PLANS: Record<string, BenefitPlanRow[]> = {
  acme: [
    { id: "1", line: "Medical", name: "UHC Choice Plus PPO", carrier: "UnitedHealthcare", subtype: "PPO", enrolled: 312, status: "Active", effective: "Jan 1, 2027", setupIssues: [] },
    { id: "2", line: "Medical", name: "UHC HDHP HSA", carrier: "UnitedHealthcare", subtype: "HDHP", enrolled: 68, status: "Active", effective: "Jan 1, 2027", setupIssues: [] },
    { id: "3", line: "Dental", name: "Guardian Dental PPO", carrier: "Guardian", subtype: "PPO", enrolled: 298, status: "Active", effective: "Jan 1, 2027", setupIssues: [] },
    { id: "4", line: "Vision", name: "VSP Choice", carrier: "VSP", subtype: "PPO", enrolled: 241, status: "Needs Attention", effective: "Jan 1, 2027", setupIssues: ["Contribution review"] },
    { id: "5", line: "Life & Disability", name: "MetLife Basic Life", carrier: "MetLife", subtype: "Basic Life", enrolled: 220, status: "Active", effective: "Jan 1, 2027", setupIssues: [] },
    { id: "6", line: "Life & Disability", name: "MetLife Voluntary Life", carrier: "MetLife", subtype: "Voluntary Life", enrolled: 0, status: "In Setup", effective: "Jan 1, 2027", setupIssues: ["EOI rules", "Payroll mapping"] },
    { id: "7", line: "Voluntary", name: "Aflac Accident Advantage", carrier: "Aflac", subtype: "Accident", enrolled: 0, status: "In Setup", effective: "Jan 1, 2027", setupIssues: ["Documents missing", "Carrier mapping"] },
    { id: "8", line: "Voluntary", name: "Aflac Critical Illness", carrier: "Aflac", subtype: "Critical Illness", enrolled: 0, status: "In Setup", effective: "Jan 1, 2027", setupIssues: ["Contributions missing"] },
  ],
  northstar: [
    { id: "1", line: "Medical", name: "Aetna Open Access", carrier: "Aetna", subtype: "HMO", enrolled: 0, status: "Needs Attention", effective: "Jan 1, 2027", setupIssues: ["Rates missing", "Documents missing"] },
    { id: "2", line: "Dental", name: "Delta Dental PPO", carrier: "Delta Dental", subtype: "PPO", enrolled: 12, status: "Active", effective: "Jan 1, 2027", setupIssues: [] },
    { id: "3", line: "Vision", name: "EyeMed Insight", carrier: "EyeMed", subtype: "PPO", enrolled: 0, status: "Draft", effective: "Jan 1, 2027", setupIssues: ["Eligibility missing"] },
  ],
  harbor: [
    { id: "1", line: "Medical", name: "Anthem Blue PPO", carrier: "Anthem", subtype: "PPO", enrolled: 188, status: "Active", effective: "Oct 1, 2026", setupIssues: [] },
    { id: "2", line: "Dental", name: "MetLife Dental", carrier: "MetLife", subtype: "PPO", enrolled: 165, status: "Active", effective: "Oct 1, 2026", setupIssues: [] },
  ],
  brightpath: [
    { id: "1", line: "Medical", name: "Kaiser HMO", carrier: "Kaiser", subtype: "HMO", enrolled: 0, status: "Draft", effective: "Jan 1, 2027", setupIssues: ["Rates missing", "Documents missing", "Eligibility missing"] },
  ],
};
export function getBenefitPlans(employerId: string): BenefitPlanRow[] { return BENEFIT_PLANS[employerId] ?? []; }

// --- Benefit plan detail (Overview / Benefits / Rates / Eligibility / Docs) --
// Detail is composed from the row + a per-line template so every plan renders
// realistic coverage + rate tables without hand-authoring each one.
export type PlanBenefitRow = { label: string; inNetwork: string; outNetwork: string };
export type PlanRateRow = { tier: string; total: string; employer: string; employee: string };
export type PlanContribRow = { tier: string; employer: string; employee: string };
export type PlanEligRow = { class: string; waiting: string; note: string };
export type PlanDocRow = { name: string; type: string; date: string };
export type BenefitPlanDetail = BenefitPlanRow & {
  type: string; network: string; fundingType: string; renewalDate: string;
  benefits: PlanBenefitRow[]; rates: PlanRateRow[]; contributions: PlanContribRow[];
  eligibility: PlanEligRow[]; documents: PlanDocRow[];
};

const RATE_TIERS = ["Employee Only", "Employee + Spouse", "Employee + Child(ren)", "Family"];
function lineTemplate(line: string): { network: string; funding: string; benefits: PlanBenefitRow[]; rates: Omit<PlanRateRow, "tier">[] } {
  switch (line) {
    case "Medical":
      return {
        network: "PPO — National", funding: "Fully Insured",
        benefits: [
          { label: "Deductible (Individual)", inNetwork: "$1,500", outNetwork: "$3,000" },
          { label: "Deductible (Family)", inNetwork: "$3,000", outNetwork: "$6,000" },
          { label: "Out-of-Pocket Max (Individual)", inNetwork: "$4,000", outNetwork: "$8,000" },
          { label: "Coinsurance", inNetwork: "20%", outNetwork: "40%" },
          { label: "Primary Care Visit", inNetwork: "$25 copay", outNetwork: "40% coinsurance" },
          { label: "Specialist Visit", inNetwork: "$50 copay", outNetwork: "40% coinsurance" },
          { label: "Emergency Room", inNetwork: "$350 copay", outNetwork: "$350 copay" },
          { label: "Preventive Care", inNetwork: "$0", outNetwork: "40% coinsurance" },
          { label: "Prescription (Generic)", inNetwork: "$10 copay", outNetwork: "Not covered" },
        ],
        rates: [
          { total: "$612.00", employer: "$520.00", employee: "$92.00" },
          { total: "$1,285.00", employer: "$900.00", employee: "$385.00" },
          { total: "$1,150.00", employer: "$820.00", employee: "$330.00" },
          { total: "$1,835.00", employer: "$1,150.00", employee: "$685.00" },
        ],
      };
    case "Dental":
      return {
        network: "PPO", funding: "Fully Insured",
        benefits: [
          { label: "Annual Deductible", inNetwork: "$50", outNetwork: "$50" },
          { label: "Annual Maximum", inNetwork: "$1,500", outNetwork: "$1,000" },
          { label: "Preventive (Cleanings / Exams)", inNetwork: "100%", outNetwork: "80%" },
          { label: "Basic (Fillings)", inNetwork: "80%", outNetwork: "60%" },
          { label: "Major (Crowns / Bridges)", inNetwork: "50%", outNetwork: "40%" },
          { label: "Orthodontia (Child)", inNetwork: "50% to $1,500", outNetwork: "Not covered" },
        ],
        rates: [
          { total: "$42.00", employer: "$30.00", employee: "$12.00" },
          { total: "$84.00", employer: "$50.00", employee: "$34.00" },
          { total: "$92.00", employer: "$55.00", employee: "$37.00" },
          { total: "$128.00", employer: "$75.00", employee: "$53.00" },
        ],
      };
    case "Vision":
      return {
        network: "PPO", funding: "Fully Insured",
        benefits: [
          { label: "Eye Exam", inNetwork: "$10 copay", outNetwork: "up to $45" },
          { label: "Frames Allowance", inNetwork: "$150", outNetwork: "up to $70" },
          { label: "Lenses (Single / Bifocal)", inNetwork: "$10 copay", outNetwork: "varies" },
          { label: "Contacts Allowance", inNetwork: "$150", outNetwork: "up to $105" },
          { label: "Frequency (Exam / Frames / Lenses)", inNetwork: "12 / 24 / 12 mo", outNetwork: "—" },
        ],
        rates: [
          { total: "$8.00", employer: "$4.00", employee: "$4.00" },
          { total: "$15.00", employer: "$7.00", employee: "$8.00" },
          { total: "$16.00", employer: "$8.00", employee: "$8.00" },
          { total: "$24.00", employer: "$12.00", employee: "$12.00" },
        ],
      };
    default: // Life & Disability / Voluntary / Other
      return {
        network: "N/A", funding: "Voluntary",
        benefits: [
          { label: "Benefit Amount", inNetwork: "1× salary to $50,000", outNetwork: "—" },
          { label: "Guarantee Issue", inNetwork: "$50,000", outNetwork: "—" },
          { label: "AD&D", inNetwork: "Included", outNetwork: "—" },
          { label: "Age Reduction", inNetwork: "35% at age 65", outNetwork: "—" },
          { label: "EOI Required Above GI", inNetwork: "Yes", outNetwork: "—" },
        ],
        rates: [
          { total: "$0.18 / $1,000", employer: "$0.18 / $1,000", employee: "$0.00" },
          { total: "$0.36 / $1,000", employer: "$0.18 / $1,000", employee: "$0.18 / $1,000" },
          { total: "$0.36 / $1,000", employer: "$0.18 / $1,000", employee: "$0.18 / $1,000" },
          { total: "$0.54 / $1,000", employer: "$0.18 / $1,000", employee: "$0.36 / $1,000" },
        ],
      };
  }
}
export function getBenefitPlanDetail(employerId: string, planId: string): BenefitPlanDetail | null {
  const row = (BENEFIT_PLANS[employerId] ?? []).find((p) => p.id === planId);
  if (!row) return null;
  const t = lineTemplate(row.line);
  const voluntary = row.line === "Voluntary" || row.line === "Life & Disability";
  return {
    ...row,
    type: row.line,
    network: t.network,
    fundingType: t.funding,
    renewalDate: row.effective.replace(/\d{4}$/, (y) => String(Number(y) + 1)),
    benefits: t.benefits,
    rates: RATE_TIERS.map((tier, i) => ({ tier, ...t.rates[i] })),
    contributions: voluntary
      ? [{ tier: "All Tiers", employer: "0%", employee: "100%" }]
      : [
          { tier: "Employee Only", employer: "85%", employee: "15%" },
          { tier: "Employee + Spouse", employer: "70%", employee: "30%" },
          { tier: "Employee + Child(ren)", employer: "72%", employee: "28%" },
          { tier: "Family", employer: "63%", employee: "37%" },
        ],
    eligibility: [
      { class: "Full-Time", waiting: "First of month after 30 days", note: "30+ hours/week" },
      { class: "Part-Time Eligible", waiting: "First of month after 60 days", note: "20–29 hours/week" },
    ],
    documents: [
      { name: `${row.name} — Summary of Benefits (SBC)`, type: "SBC", date: row.effective },
      { name: `${row.name} — Plan Summary`, type: "Summary", date: row.effective },
      { name: `${row.name} — Rate Sheet`, type: "Rates", date: row.effective },
    ],
  };
}

// --- Plan catalog (Plans & Rates readiness — plan-year aware) ----------------
// Setup view for HR: which plans are ready vs missing rates/contributions/docs,
// and which block enrollment launch. Feeds Plan Year Setup + Enrollment Center.
export type PlanConfigStatus = "Complete" | "Partial" | "Missing";
export type PlanCatalogRow = {
  id: string; name: string; carrier: string; line: string; benefitType: string; subtype: string;
  status: string; effective: string; enrolled: number; coverageTiers: number;
  rateStatus: PlanConfigStatus; contributionStatus: "Configured" | "Missing"; contributionRule: string;
  documentStatus: PlanConfigStatus; eligibleClasses: string; launchBlocker: boolean; warnings: string[];
};
export type PlanCatalogSummary = { total: number; ready: number; missingRates: number; missingContributions: number; missingDocuments: number; launchBlockers: number };
export type PlanCatalog = { readOnly: boolean; summary: PlanCatalogSummary; rows: PlanCatalogRow[] };

export const PLAN_CATEGORIES = ["All", "Medical", "Dental", "Vision", "Life & Disability", "Voluntary / Supplemental", "Spending Accounts", "Retirement / Other"] as const;
const BENEFIT_TYPE_BY_LINE: Record<string, string> = { Medical: "Medical", Dental: "Dental", Vision: "Vision", "Life & Disability": "Life & Disability", Voluntary: "Voluntary / Supplemental" };

export function getPlanCatalog(employerId: string, planYearId: string): PlanCatalog {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  const pStatus = py?.status ?? "Setup";
  const archived = pStatus === "Archived";
  const closed = pStatus === "Active";
  const rows: PlanCatalogRow[] = getBenefitPlans(employerId).map((p) => {
    const benefitType = BENEFIT_TYPE_BY_LINE[p.line] ?? "Retirement / Other";
    const voluntary = p.line === "Voluntary" || p.line === "Life & Disability";
    const coverageTiers = p.line === "Medical" || p.line === "Dental" || p.line === "Vision" ? 4 : 1;
    const hasRateIssue = p.setupIssues.some((i) => /rate/i.test(i));
    const hasContribIssue = p.setupIssues.some((i) => /contribution/i.test(i));
    const hasDocIssue = p.setupIssues.some((i) => /document|brochure/i.test(i));

    const rateStatus: PlanConfigStatus = archived || closed ? "Complete" : hasRateIssue ? "Missing" : "Complete";
    const contributionStatus: "Configured" | "Missing" = archived || closed ? "Configured" : hasContribIssue ? "Missing" : "Configured";
    const documentStatus: PlanConfigStatus = archived || closed ? "Complete" : hasDocIssue ? "Missing" : "Complete";
    const launchBlocker = !archived && !closed && (rateStatus === "Missing" || documentStatus === "Missing" || (contributionStatus === "Missing" && !voluntary));
    const contributionRule = contributionStatus === "Missing" ? "Not configured" : voluntary ? "Employee-paid (100%)" : "Percentage of premium (by tier)";

    let status: string;
    if (archived) status = "Archived";
    else if (closed) status = "Ready";
    else if (rateStatus === "Missing") status = "Missing Rates";
    else if (documentStatus === "Missing") status = "Missing Documents";
    else if (contributionStatus === "Missing") status = "Missing Contributions";
    else if (p.status === "Draft") status = "Draft";
    else status = "Ready";

    return { id: p.id, name: p.name, carrier: p.carrier, line: p.line, benefitType, subtype: p.subtype, status, effective: p.effective, enrolled: p.enrolled, coverageTiers, rateStatus, contributionStatus, contributionRule, documentStatus, eligibleClasses: "Full-Time, Part-Time Eligible", launchBlocker, warnings: archived || closed ? [] : p.setupIssues };
  });
  const summary: PlanCatalogSummary = {
    total: rows.length,
    ready: rows.filter((r) => r.status === "Ready" || r.status === "Archived").length,
    missingRates: rows.filter((r) => r.rateStatus === "Missing").length,
    missingContributions: rows.filter((r) => r.contributionStatus === "Missing").length,
    missingDocuments: rows.filter((r) => r.documentStatus === "Missing").length,
    launchBlockers: rows.filter((r) => r.launchBlocker).length,
  };
  return { readOnly: archived, summary, rows };
}

// --- Enrollment -------------------------------------------------------------
export type EnrollmentSummary = {
  eventLabel: string; window: string; status: string;
  invited: number; notInvited: number; notStarted: number; inProgress: number; submitted: number;
  byCoverage: { name: string; elected: number; waived: number; pending: number }[];
};
const ENROLLMENT: Record<string, EnrollmentSummary> = {
  acme: { eventLabel: "2027 Open Enrollment", window: "Nov 1 – Nov 20, 2026", status: "In Progress", invited: 450, notInvited: 32, notStarted: 126, inProgress: 47, submitted: 309, byCoverage: [{ name: "Medical", elected: 312, waived: 44, pending: 126 }, { name: "Dental", elected: 298, waived: 58, pending: 126 }, { name: "Vision", elected: 241, waived: 115, pending: 126 }] },
  northstar: { eventLabel: "2027 Open Enrollment", window: "Not scheduled", status: "Setup Incomplete", invited: 0, notInvited: 58, notStarted: 58, inProgress: 0, submitted: 0, byCoverage: [{ name: "Dental", elected: 12, waived: 0, pending: 46 }] },
  harbor: { eventLabel: "2026 Open Enrollment", window: "Closed Sep 20, 2026", status: "Closed", invited: 205, notInvited: 0, notStarted: 0, inProgress: 0, submitted: 205, byCoverage: [{ name: "Medical", elected: 188, waived: 17, pending: 0 }, { name: "Dental", elected: 165, waived: 40, pending: 0 }] },
  brightpath: { eventLabel: "2027 Open Enrollment", window: "Not scheduled", status: "Not Started", invited: 0, notInvited: 120, notStarted: 120, inProgress: 0, submitted: 0, byCoverage: [] },
};
export function getEnrollment(employerId: string): EnrollmentSummary { return ENROLLMENT[employerId] ?? ENROLLMENT.acme; }

// --- Payroll deductions -----------------------------------------------------
export type PayrollSummary = {
  cycle: string; reviewStatus: string; exportStatus: string;
  totalEe: number; totalEr: number; rows: { id: string; employee: string; plan: string; ee: number; er: number; status: string }[];
  changes: { employee: string; change: string; detail: string }[];
};
const PAYROLL: Record<string, PayrollSummary> = {
  acme: { cycle: "Biweekly", reviewStatus: "Needs Review", exportStatus: "Not Exported", totalEe: 4820.5, totalEr: 11200.0, rows: [{ id: "1", employee: "Jordan Lee", plan: "UHC PPO", ee: 168.0, er: 320.0, status: "Ready" }, { id: "2", employee: "Chris Wong", plan: "UHC PPO", ee: 142.5, er: 320.0, status: "Needs Review" }], changes: [{ employee: "Jordan Lee", change: "New", detail: "Added dental — +$24.18/pay" }, { employee: "Dana Kim", change: "Changed", detail: "Tier EE→Family — +$110/pay" }] },
  northstar: { cycle: "Monthly", reviewStatus: "Not Ready", exportStatus: "Not Exported", totalEe: 0, totalEr: 0, rows: [], changes: [] },
  harbor: { cycle: "Weekly", reviewStatus: "Approved", exportStatus: "Exported Sep 25, 2026", totalEe: 6210.0, totalEr: 14800.0, rows: [{ id: "1", employee: "Marcus Bell", plan: "Anthem PPO", ee: 96.0, er: 240.0, status: "Ready" }, { id: "2", employee: "Sofia Ramirez", plan: "Anthem PPO", ee: 88.0, er: 240.0, status: "Ready" }], changes: [{ employee: "Wade Foster", change: "Term", detail: "Terminated — deduction ended" }] },
  brightpath: { cycle: "Semi-monthly", reviewStatus: "Not Ready", exportStatus: "Not Exported", totalEe: 0, totalEr: 0, rows: [], changes: [] },
};
export function getPayroll(employerId: string): PayrollSummary { return PAYROLL[employerId] ?? PAYROLL.acme; }

// --- Payroll workspace (Payroll Data + Deductions — plan-year aware) ---------
// Payroll DATA = imported payroll history / ACA lookback. Deduction Review =
// benefit deductions from elections/rates/contributions. Employer-level only.
export type PayrollConnection = {
  provider: string; frequency: string; currentGroup: string; firstImported: string; lastImported: string;
  measurementPeriod: string; stabilityPeriod: string; lastSync: string; nextSync: string; dataSource: string;
  connected: boolean; lookbackReady: boolean;
};
export type PayrollReadinessIssue = { key: string; label: string; count: number; tone: "danger" | "warning" | "info" };
export type PayrollReadiness = { percent: number; issues: PayrollReadinessIssue[] };
export type PayPeriodStatus = "Imported" | "Needs Review" | "Failed" | "Partial" | "Replaced" | "Locked";
export type ImportedPayPeriod = { id: string; period: string; payDate: string; group: string; emps: number; hours: string; wages: string; status: PayPeriodStatus; issues: number; source: string };
export type PayrollAcaStatus = "Full-Time" | "Not Full-Time" | "Trending Full-Time" | "Unknown" | "Needs Review";
export type EmployeePayrollRecord = { id: string; name: string; empNumber: string; group: string; matchedCensus: string; hours: string; wages: string; aca: PayrollAcaStatus; issues: string; lastImported: string };
export type DeductionReviewStatus = "Ready" | "Needs Review" | "Missing Payroll Code" | "Amount Changed" | "Pending Export" | "Exported";
export type DeductionChangeKind = "New Election" | "Changed Election" | "Life Event" | "New Hire" | "Termination" | "Waiver" | "Rate Change" | "Payroll Group Change";
export type DeductionReviewRow = { id: string; employee: string; plan: string; tier: string; effective: string; payrollGroup: string; code: string; ee: string; er: string; changeType: DeductionChangeKind; status: DeductionReviewStatus; issue: string };
export type DeductionReviewSummary = { readyToExport: number; needsReview: number; missingCode: number; amountChanged: number; effectiveThisPeriod: number; totalEe: string; totalEr: string };
export type DeductionChangeType = "New election" | "Changed election" | "Waiver / Termination" | "Life event change" | "New hire" | "Payroll group change" | "Deduction amount changed";
export type DeductionChange = { id: string; employee: string; changeType: DeductionChangeType; prev: string; next: string; effective: string; status: string };
export type ExportBatchStatus = "Draft" | "Ready" | "Exported" | "Failed" | "Reconciled";
export type ExportBatch = { id: string; batchDate: string; payPeriod: string; employees: number; totalEe: string; totalEr: string; status: ExportBatchStatus; file: string; issues: string };
export type PayrollSettingsRow = { provider: string; frequency: string; deductionSchedule: string; payrollGroups: string; codeMapping: string; syncSettings: string; exportFormat: string };
export type PayrollImportSummary = { importedPayPeriods: number; matchedEmployees: number; unmatchedEmployees: number; lastSyncStatus: string };
export type PayrollAcaLookback = {
  measurementPeriod: string; stabilityPeriod: string; administrativePeriod: string;
  calcStatus: string; lastCalculated: string;
  fullTimeDeterminationStatus: string; affordabilityStatus: string; form1095Status: string;
};
export type PayrollWorkspace = {
  readOnly: boolean;
  connection: PayrollConnection; readiness: PayrollReadiness; importSummary: PayrollImportSummary; aca: PayrollAcaLookback;
  payPeriods: ImportedPayPeriod[]; employeeRecords: EmployeePayrollRecord[];
  deductionReview: DeductionReviewRow[]; deductionSummary: DeductionReviewSummary; deductionChanges: DeductionChange[];
  exportBatches: ExportBatch[]; settings: PayrollSettingsRow;
};

const PAY_PERIODS: ImportedPayPeriod[] = [
  { id: "pp-26", period: "Dec 16 – Dec 31, 2026", payDate: "Jan 5, 2027", group: "Biweekly", emps: 498, hours: "39,842.50", wages: "$1,248,920.00", status: "Imported", issues: 2, source: "ADP Sync" },
  { id: "pp-25", period: "Dec 1 – Dec 15, 2026", payDate: "Dec 20, 2026", group: "Biweekly", emps: 496, hours: "39,104.25", wages: "$1,211,480.00", status: "Imported", issues: 0, source: "ADP Sync" },
  { id: "pp-24", period: "Nov 16 – Nov 30, 2026", payDate: "Dec 5, 2026", group: "Biweekly", emps: 499, hours: "39,602.75", wages: "$1,230,210.00", status: "Needs Review", issues: 1, source: "CSV Upload" },
  { id: "pp-22", period: "Oct 16 – Oct 31, 2026", payDate: "Nov 5, 2026", group: "Biweekly", emps: 494, hours: "38,920.50", wages: "$1,196,210.00", status: "Partial", issues: 3, source: "ADP Sync" },
  { id: "pp-01", period: "Jan 1 – Jan 14, 2026", payDate: "Jan 20, 2026", group: "Biweekly", emps: 482, hours: "37,946.00", wages: "$1,098,700.00", status: "Locked", issues: 0, source: "ADP Sync" },
];
const EMP_PAYROLL: EmployeePayrollRecord[] = [
  { id: "emp-jordan", name: "Jordan Lee", empNumber: "EMP-1001", group: "Biweekly", matchedCensus: "Jordan Lee", hours: "2,080.00", wages: "$90,000.00", aca: "Full-Time", issues: "None", lastImported: "Jan 5, 2027" },
  { id: "emp-maria", name: "Maria Patel", empNumber: "EMP-1002", group: "Biweekly", matchedCensus: "Maria Patel", hours: "2,048.50", wages: "$78,640.00", aca: "Full-Time", issues: "None", lastImported: "Jan 5, 2027" },
  { id: "emp-dana", name: "Dana Kim", empNumber: "EMP-1004", group: "Biweekly", matchedCensus: "Dana Kim", hours: "1,476.25", wages: "$41,920.00", aca: "Not Full-Time", issues: "2 missing pay periods", lastImported: "Jan 5, 2027" },
  { id: "emp-emily", name: "Emily Johnson", empNumber: "EMP-1006", group: "Biweekly", matchedCensus: "Emily Johnson", hours: "1,622.40", wages: "$46,890.00", aca: "Trending Full-Time", issues: "Review eligibility", lastImported: "Jan 5, 2027" },
  { id: "emp-chris", name: "Chris Wong", empNumber: "EMP-1003", group: "Biweekly", matchedCensus: "Unmatched", hours: "Missing", wages: "$52,100.00", aca: "Unknown", issues: "Missing hours · not matched", lastImported: "Dec 20, 2026" },
];
const DEDUCTION_BASE: Omit<DeductionReviewRow, "status" | "issue">[] = [
  { id: "d1", employee: "Jordan Lee", plan: "UHC Choice Plus PPO", tier: "Family", effective: "Jan 1, 2027", payrollGroup: "Biweekly", code: "MED-UHC-PPO", ee: "$168.00", er: "$320.00", changeType: "New Election" },
  { id: "d2", employee: "Maria Patel", plan: "UHC HDHP HSA", tier: "Employee + Spouse", effective: "Mar 1, 2027", payrollGroup: "Biweekly", code: "MED-UHC-HDHP", ee: "$124.06", er: "$300.00", changeType: "Life Event" },
  { id: "d3", employee: "Dana Kim", plan: "Guardian Dental PPO", tier: "Family", effective: "Jan 1, 2027", payrollGroup: "Biweekly", code: "DEN-GUARD", ee: "$24.18", er: "$42.00", changeType: "Changed Election" },
  { id: "d4", employee: "Devon Brooks", plan: "MetLife Voluntary Life", tier: "Employee Only", effective: "Jan 1, 2027", payrollGroup: "Biweekly", code: "", ee: "$18.00", er: "$0.00", changeType: "New Election" },
  { id: "d5", employee: "Chris Wong", plan: "VSP Choice", tier: "Employee Only", effective: "Jan 1, 2027", payrollGroup: "Biweekly", code: "VIS-VSP", ee: "$8.00", er: "$4.00", changeType: "New Hire" },
  { id: "d6", employee: "Wade Foster", plan: "Anthem Blue PPO", tier: "Employee Only", effective: "Feb 15, 2027", payrollGroup: "Biweekly", code: "MED-ANTHEM", ee: "$0.00", er: "$0.00", changeType: "Termination" },
  { id: "d7", employee: "Sam Rivera", plan: "Guardian Dental PPO", tier: "Employee Only", effective: "Feb 1, 2027", payrollGroup: "Monthly", code: "DEN-GUARD", ee: "$12.00", er: "$24.00", changeType: "Payroll Group Change" },
  { id: "d8", employee: "Alex Cho", plan: "UHC Choice Plus PPO", tier: "Employee + Spouse", effective: "Jan 1, 2027", payrollGroup: "Biweekly", code: "MED-UHC-PPO", ee: "$142.00", er: "$310.00", changeType: "Rate Change" },
];

export function getPayrollWorkspace(employerId: string, planYearId: string): PayrollWorkspace {
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  const s = py?.status ?? "Setup";
  const archived = s === "Archived";
  const closed = s === "Active";
  const live = s === "OpenEnrollment" || s === "Setup";

  const connection: PayrollConnection = {
    provider: "ADP Workforce Now", frequency: "Biweekly", currentGroup: "Biweekly Payroll",
    firstImported: "Jan 1 – Jan 14, 2026", lastImported: "Dec 16 – Dec 31, 2026",
    measurementPeriod: "Jan 1 – Dec 31, 2026", stabilityPeriod: "Jan 1 – Dec 31, 2027",
    lastSync: "Nov 4, 2026", nextSync: "Nov 18, 2026", dataSource: "Payroll Sync + Manual CSV",
    connected: true, lookbackReady: !live || s === "OpenEnrollment",
  };
  const readiness: PayrollReadiness = archived
    ? { percent: 100, issues: [] }
    : {
        percent: live && s === "Setup" ? 62 : 89,
        issues: [
          { key: "missing-records", label: "Missing payroll records", count: 12, tone: "danger" },
          { key: "missing-hours", label: "Missing hours for variable-hour employees", count: 9, tone: "warning" },
          { key: "missing-wages", label: "Missing W-2 wages", count: 4, tone: "warning" },
          { key: "unmapped-groups", label: "Unmapped payroll groups", count: 2, tone: "warning" },
          { key: "duplicate-records", label: "Duplicate payroll records", count: 3, tone: "info" },
          { key: "unmatched", label: "Employees not matched to census", count: 5, tone: "danger" },
        ],
      };

  // Deduction Review — the recurring per-pay-period workflow. Statuses depend on phase.
  const deductionReview: DeductionReviewRow[] = DEDUCTION_BASE.map((d): DeductionReviewRow => {
    if (archived) return { ...d, status: "Exported", issue: "—" };
    if (!d.code) return { ...d, status: "Missing Payroll Code", issue: "Assign a deduction code before export" };
    if (live) {
      if (d.changeType === "Changed Election") return { ...d, status: "Needs Review", issue: "Verify new amount before export" };
      return { ...d, status: "Pending Export", issue: "New for this plan year" };
    }
    // closed / active coverage year
    if (d.changeType === "Life Event" || d.changeType === "Rate Change") return { ...d, status: "Amount Changed", issue: "Amount changed — verify before export" };
    if (d.changeType === "Payroll Group Change") return { ...d, status: "Needs Review", issue: "Group change — confirm deduction schedule" };
    return { ...d, status: "Ready", issue: "—" };
  });
  const num = (v: string) => parseFloat(v.replace(/[$,]/g, "")) || 0;
  const deductionSummary: DeductionReviewSummary = {
    readyToExport: deductionReview.filter((r) => r.status === "Ready" || r.status === "Pending Export").length,
    needsReview: deductionReview.filter((r) => r.status === "Needs Review").length,
    missingCode: deductionReview.filter((r) => r.status === "Missing Payroll Code").length,
    amountChanged: deductionReview.filter((r) => r.status === "Amount Changed").length,
    effectiveThisPeriod: deductionReview.filter((r) => ["New Election", "Life Event", "New Hire", "Changed Election"].includes(r.changeType)).length,
    totalEe: `$${deductionReview.reduce((sum, r) => sum + num(r.ee), 0).toFixed(2)}`,
    totalEr: `$${deductionReview.reduce((sum, r) => sum + num(r.er), 0).toFixed(2)}`,
  };

  const deductionChanges: DeductionChange[] = archived ? [] : live
    ? [
        { id: "c1", employee: "Jordan Lee", changeType: "New election", prev: "$0.00", next: "$168.00", effective: "Jan 1, 2027", status: "Pending export" },
        { id: "c2", employee: "Dana Kim", changeType: "New election", prev: "$0.00", next: "$24.18", effective: "Jan 1, 2027", status: "Needs Review" },
        { id: "c3", employee: "Devon Brooks", changeType: "Deduction amount changed", prev: "$0.00", next: "$18.00", effective: "Jan 1, 2027", status: "Missing payroll code" },
      ]
    : [
        { id: "c1", employee: "Maria Patel", changeType: "Life event change", prev: "$124.06", next: "$210.00", effective: "Mar 1, 2027", status: "Pending export" },
        { id: "c2", employee: "Sam Rivera", changeType: "New hire", prev: "$0.00", next: "$96.00", effective: "Feb 1, 2027", status: "Ready" },
        { id: "c3", employee: "Wade Foster", changeType: "Waiver / Termination", prev: "$88.00", next: "$0.00", effective: "Feb 15, 2027", status: "Ready" },
        { id: "c4", employee: "Leo Martins", changeType: "Payroll group change", prev: "Biweekly", next: "Monthly", effective: "Feb 1, 2027", status: "Needs Review" },
      ];

  const exportBatches: ExportBatch[] = archived
    ? [{ id: "b0", batchDate: "Dec 20, 2025", payPeriod: "Dec 2025", employees: 441, totalEe: "$78,420.00", totalEr: "$186,200.00", status: "Reconciled", file: "payroll_2025_final.csv", issues: "0" }]
    : live
      ? [
          { id: "b1", batchDate: "—", payPeriod: "Jan 1 – Jan 14, 2027", employees: 0, totalEe: "$0.00", totalEr: "$0.00", status: "Draft", file: "—", issues: "Awaiting OE close" },
        ]
      : [
          { id: "b1", batchDate: "Feb 20, 2027", payPeriod: "Feb 1 – Feb 15, 2027", employees: 468, totalEe: "$82,940.00", totalEr: "$198,400.00", status: "Exported", file: "payroll_2027-02-15.csv", issues: "0" },
          { id: "b2", batchDate: "Feb 5, 2027", payPeriod: "Jan 16 – Jan 31, 2027", employees: 466, totalEe: "$82,110.00", totalEr: "$197,200.00", status: "Reconciled", file: "payroll_2027-01-31.csv", issues: "0" },
          { id: "b3", batchDate: "—", payPeriod: "Feb 16 – Feb 28, 2027", employees: 470, totalEe: "$83,020.00", totalEr: "$198,900.00", status: "Ready", file: "—", issues: "1 warning" },
        ];

  const settings: PayrollSettingsRow = {
    provider: "ADP Workforce Now", frequency: "Biweekly", deductionSchedule: "24 pay periods (skip 2 & 4)",
    payrollGroups: "Biweekly, Monthly", codeMapping: "42 codes mapped · 1 unmapped",
    syncSettings: "Auto-sync every 14 days", exportFormat: "ADP 401 CSV",
  };

  const importSummary: PayrollImportSummary = {
    importedPayPeriods: 26, matchedEmployees: 477, unmatchedEmployees: 5,
    lastSyncStatus: archived ? "Archived" : "Success",
  };
  const aca: PayrollAcaLookback = {
    measurementPeriod: connection.measurementPeriod,
    stabilityPeriod: connection.stabilityPeriod,
    administrativePeriod: "Nov 1 – Dec 31, 2026",
    calcStatus: archived ? "Final" : readiness.percent >= 90 ? "Ready to calculate" : "Blocked — resolve issues first",
    lastCalculated: archived ? "Dec 31, 2025" : "Oct 21, 2026",
    fullTimeDeterminationStatus: archived ? "Complete" : "In progress",
    affordabilityStatus: archived ? "Complete" : readiness.percent >= 90 ? "Ready" : "Missing wage data",
    form1095Status: archived ? "Filed" : "Draft",
  };
  return { readOnly: archived, connection, readiness, importSummary, aca, payPeriods: PAY_PERIODS, employeeRecords: EMP_PAYROLL, deductionReview, deductionSummary, deductionChanges, exportBatches, settings };
}

// --- Carrier exports --------------------------------------------------------
export type CarrierBatchRow = { id: string; carrier: string; format: string; lines: number; errors: number; status: string; generated: string };
const CARRIER: Record<string, CarrierBatchRow[]> = {
  acme: [
    { id: "1", carrier: "UnitedHealthcare", format: "EDI 834", lines: 312, errors: 0, status: "Sent", generated: "Dec 15, 2026" },
    { id: "2", carrier: "Guardian", format: "CSV", lines: 298, errors: 2, status: "Needs Attention", generated: "Dec 15, 2026" },
    { id: "3", carrier: "VSP", format: "EDI 834", lines: 0, errors: 0, status: "Not Started", generated: "—" },
  ],
  northstar: [{ id: "1", carrier: "Delta Dental", format: "CSV", lines: 0, errors: 0, status: "Not Started", generated: "—" }],
  harbor: [
    { id: "1", carrier: "Anthem", format: "EDI 834", lines: 188, errors: 0, status: "Sent", generated: "Sep 22, 2026" },
    { id: "2", carrier: "MetLife", format: "EDI 834", lines: 165, errors: 0, status: "Sent", generated: "Sep 22, 2026" },
  ],
  brightpath: [],
};
export function getCarrierExports(employerId: string): CarrierBatchRow[] { return CARRIER[employerId] ?? []; }

// --- ACA / COBRA ------------------------------------------------------------
export type ComplianceSummary = {
  isAle: boolean; ft: number; fte: number; total: number; form1095: { generated: number; filed: number; status: string };
  cobra: { open: number; noticesDue: number; elected: number };
};
const COMPLIANCE: Record<string, ComplianceSummary> = {
  acme: { isAle: true, ft: 410, fte: 38, total: 448, form1095: { generated: 482, filed: 0, status: "Draft" }, cobra: { open: 3, noticesDue: 1, elected: 1 } },
  northstar: { isAle: false, ft: 52, fte: 6, total: 58, form1095: { generated: 0, filed: 0, status: "Not Started" }, cobra: { open: 0, noticesDue: 0, elected: 0 } },
  harbor: { isAle: true, ft: 190, fte: 12, total: 202, form1095: { generated: 205, filed: 205, status: "Filed" }, cobra: { open: 2, noticesDue: 0, elected: 2 } },
  brightpath: { isAle: true, ft: 112, fte: 8, total: 120, form1095: { generated: 0, filed: 0, status: "Not Started" }, cobra: { open: 0, noticesDue: 0, elected: 0 } },
};
export function getCompliance(employerId: string): ComplianceSummary { return COMPLIANCE[employerId] ?? COMPLIANCE.acme; }
