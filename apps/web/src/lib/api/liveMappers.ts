// Maps live C1 GraphQL responses into the mock TS shapes the components already consume,
// so hybrid mode is a drop-in for the mock getter. Census/employee/dependent live shapes
// already match the mock field names (near-identity); employer + plan-year need light
// remapping. Fields with no C1 source get documented null/0 defaults.
import type {
  EmployerProfile, PlanYearRow,
  PlanCatalog, PlanCatalogRow, BenefitPlanDetail,
  PlanBenefitRow, PlanRateRow, PlanContribRow, PlanEligRow, PlanDocRow,
  EnrollmentSummary,
  LaunchReadiness, OpenEnrollmentSummary, EnrollmentWindow, EnrollmentWindowType,
  OngoingWorkItem, OngoingWorkUrgency, OngoingWorkRoute, ReadinessItem, ReadinessCheck,
} from "@/lib/mock/db";
import type { CensusEmployee, EmployerCensusContext, EmployeeDetail, Dependent } from "@/lib/census-mock";
import type { ChecklistStep, ReadinessStatus, PlanYearSetupView } from "@/lib/plan-year-checklist-mock";

// --- Live response element shapes (the subset our operations select) ---------
export type LiveEmployerSummary = {
  employerId: string; name: string; industry: string | null;
  employeeCount: number | null; activeCount: number | null;
  currentPlanYearId: string | null; currentPlanYearLabel: string | null;
  setupStatus: string | null; enrollmentState: string | null;
  completion: number | null; issues: number | null;
  renewalMonth: string | null; agency: string | null; broker: string | null;
};
export type LiveEmployer = {
  employerId: string; name: string; legalName: string | null; ein: string | null;
  industry: string | null; employeeCount: number; activeCount: number | null; locations: number | null;
  renewalMonth: string | null; agency: string | null; broker: string | null;
  currentPlanYearId: string | null; currentPlanYearLabel: string | null; status: string;
};
export type LivePlanYear = {
  id: string; label: string; year: number; status: string;
  periodStart: string; periodEnd: string; oeStart: string | null; oeEnd: string | null; oeWindowLabel: string | null;
  planCount: number | null; completionPct: number | null; eligibleCount: number | null; enrollmentPct: number | null;
  launchBlockers: number | null; oeDaysLeft: number | null; needsActionCount: number | null;
};

const enrollmentStateOf = (s: string | null): EmployerProfile["enrollmentState"] => {
  switch (s) {
    case "in_progress": case "setup_incomplete": case "closed": case "not_started": return s;
    default: return "not_started"; // no direct C1 source (aggregate read-model later)
  }
};

export function mapEmployerSummary(e: LiveEmployerSummary): EmployerProfile {
  return {
    id: e.employerId, name: e.name, industry: e.industry ?? "",
    employeeCount: e.employeeCount ?? 0, activeCount: e.activeCount ?? 0, locations: 0,
    renewalMonth: e.renewalMonth ?? "", agency: e.agency ?? "", broker: e.broker ?? "",
    currentPlanYearId: e.currentPlanYearId ?? "", currentPlanYearLabel: e.currentPlanYearLabel ?? "",
    setupStatus: e.setupStatus ?? "", enrollmentState: enrollmentStateOf(e.enrollmentState),
    completion: e.completion ?? 0, issues: e.issues ?? 0,
  };
}

export function mapEmployer(e: LiveEmployer): EmployerProfile {
  return {
    id: e.employerId, name: e.name, industry: e.industry ?? "",
    employeeCount: e.employeeCount, activeCount: e.activeCount ?? 0, locations: e.locations ?? 0,
    renewalMonth: e.renewalMonth ?? "", agency: e.agency ?? "", broker: e.broker ?? "",
    currentPlanYearId: e.currentPlanYearId ?? "", currentPlanYearLabel: e.currentPlanYearLabel ?? "",
    setupStatus: e.status, enrollmentState: "not_started", completion: 0, issues: 0,
  };
}

export function mapPlanYearStatus(s: string): PlanYearRow["status"] {
  switch (s) {
    case "open_enrollment": return "OpenEnrollment";
    case "active": return "Active";
    case "archived": return "Archived";
    default: return "Setup";
  }
}

export function mapPlanYear(p: LivePlanYear): PlanYearRow {
  const oe = p.oeWindowLabel ?? (p.oeStart && p.oeEnd ? `${p.oeStart} – ${p.oeEnd}` : "—");
  return {
    id: p.id, label: p.label, status: mapPlanYearStatus(p.status),
    period: `${p.periodStart} – ${p.periodEnd}`, oe,
    plans: p.planCount ?? 0, completion: p.completionPct ?? 0,
    eligible: p.eligibleCount ?? 0, enrollment: p.enrollmentPct ?? 0, blockers: p.launchBlockers ?? 0,
    oeDaysLeft: p.oeDaysLeft ?? undefined, needAction: p.needsActionCount ?? undefined,
  };
}

// --- Employer Overview rollup (Phase D-4) ------------------------------------
// GraphQL `EmployerOverview` (compact dashboard KPIs) → the view the additive
// CompanyDashboard card renders. planYearStatus is display-cased via mapPlanYearStatus;
// nullable Int fields default to 0; needsAttention passes through.
export type LiveAttentionItem = { key: string; title: string; severity: string; route: string | null };
export type LiveEmployerOverview = {
  employerId: string; planYearId: string; planYearLabel: string; planYearStatus: string;
  eligibleEmployees: number; enrolled: number | null; waived: number | null; benefitPlans: number | null;
  setupReadinessPct: number | null; enrollmentPct: number | null; launchBlockers: number | null;
  needsAttention: LiveAttentionItem[];
};
export type EmployerOverviewRollup = {
  planYearLabel: string; planYearStatus: string; eligibleEmployees: number;
  enrolled: number; waived: number; benefitPlans: number; setupReadinessPct: number;
  enrollmentPct: number; launchBlockers: number; needsAttention: LiveAttentionItem[];
};

export function mapEmployerOverview(v: LiveEmployerOverview): EmployerOverviewRollup {
  return {
    planYearLabel: v.planYearLabel,
    planYearStatus: mapPlanYearStatus(v.planYearStatus),
    eligibleEmployees: v.eligibleEmployees,
    enrolled: v.enrolled ?? 0,
    waived: v.waived ?? 0,
    benefitPlans: v.benefitPlans ?? 0,
    setupReadinessPct: v.setupReadinessPct ?? 0,
    enrollmentPct: v.enrollmentPct ?? 0,
    launchBlockers: v.launchBlockers ?? 0,
    needsAttention: v.needsAttention,
  };
}

// --- Plan Year Setup checklist (Phase D-1) -----------------------------------
// GraphQL `PlanYearSetupStatus` → the `PlanYearSetupView` the page renders. The one
// remap is `key` → `stepKey`; server status values already match `ReadinessStatus`.
// A live `not_applicable` step's message is an admin-override reason, so it routes to
// `overrideNote` (italic); other messages stay as the warning `message`.
export type LiveChecklistStep = {
  key: string; label: string; description: string | null; category: string | null;
  requiredByDefault: boolean; status: string; route: string | null; message: string | null;
};
export type LivePlanYearSetupStatus = {
  employerId: string; planYearId: string; completionPct: number; blockers: number; steps: LiveChecklistStep[];
};

function mapChecklistStep(s: LiveChecklistStep): ChecklistStep {
  const isNa = s.status === "not_applicable";
  return {
    stepKey: s.key,
    label: s.label,
    description: s.description ?? "",
    category: s.category ?? "",
    requiredByDefault: s.requiredByDefault,
    route: s.route ?? "",
    status: s.status as ReadinessStatus,
    message: isNa ? undefined : s.message ?? undefined,
    overrideNote: isNa ? s.message ?? undefined : undefined,
  };
}

export function mapPlanYearSetupStatus(v: LivePlanYearSetupStatus): PlanYearSetupView {
  return { completionPct: v.completionPct, blockers: v.blockers, steps: v.steps.map(mapChecklistStep) };
}

// --- Plans & Rates (Phase D-2) ----------------------------------------------
// The backend returns canonical SDL casing (lowercase enums + status keys); the mock
// components render display strings ("Medical", "Complete", "Configured", "Ready"). These
// mappers do the display-casing so hybrid mode is a drop-in for the mock getters.

const LINE_DISPLAY: Record<string, string> = {
  medical: "Medical", dental: "Dental", vision: "Vision", rx: "Voluntary",
  basic_life: "Life & Disability", vol_life: "Life & Disability", std: "Life & Disability", ltd: "Life & Disability",
  accident: "Voluntary", critical_illness: "Voluntary", hospital: "Voluntary",
};
const CONFIG_DISPLAY: Record<string, "Complete" | "Partial" | "Missing"> = { complete: "Complete", partial: "Partial", missing: "Missing" };
const STATUS_DISPLAY: Record<string, string> = {
  ready: "Ready", missing_rates: "Missing Rates", missing_contributions: "Missing Contributions",
  draft: "Draft", in_setup: "In Setup",
};
const displayLine = (l: string): string => LINE_DISPLAY[l] ?? "Voluntary / Supplemental";

export type LiveCatalogRow = {
  planId: string; name: string; carrier: string; line: string; benefitType: string; subtype: string | null;
  status: string; effective: string | null; enrolled: number | null; coverageTiers: number | null;
  rateStatus: string; contributionStatus: string; contributionRule: string | null; documentStatus: string;
  eligibleClasses: string | null; launchBlocker: boolean; warnings: string[];
};
export type LivePlanCatalog = {
  employerId: string; planYearId: string; readOnly: boolean;
  summary: { total: number; ready: number; missingRates: number; missingContributions: number; missingDocuments: number; launchBlockers: number };
  plans: LiveCatalogRow[];
};
export type LiveBenefitPlanDetail = {
  planId: string; name: string; carrier: string; line: string; subtype: string | null; network: string | null;
  fundingType: string | null; effective: string | null; renewalDate: string | null; enrolled: number | null; status: string | null;
  benefits: PlanBenefitRow[]; rates: PlanRateRow[]; contributions: PlanContribRow[]; eligibility: PlanEligRow[]; documents: PlanDocRow[];
};

export function mapPlanCatalog(v: LivePlanCatalog): PlanCatalog {
  const rows: PlanCatalogRow[] = v.plans.map((p) => ({
    id: p.planId, name: p.name, carrier: p.carrier, line: displayLine(p.line), benefitType: p.benefitType,
    subtype: p.subtype ?? "", status: STATUS_DISPLAY[p.status] ?? p.status, effective: p.effective ?? "",
    enrolled: p.enrolled ?? 0, coverageTiers: p.coverageTiers ?? 0,
    rateStatus: CONFIG_DISPLAY[p.rateStatus] ?? "Missing",
    contributionStatus: p.contributionStatus === "configured" ? "Configured" : "Missing",
    contributionRule: p.contributionRule ?? "Not configured",
    documentStatus: CONFIG_DISPLAY[p.documentStatus] ?? "Missing",
    eligibleClasses: p.eligibleClasses ?? "", launchBlocker: p.launchBlocker, warnings: p.warnings,
  }));
  return { readOnly: v.readOnly, summary: v.summary, rows };
}

export function mapBenefitPlanDetail(v: LiveBenefitPlanDetail): BenefitPlanDetail {
  return {
    id: v.planId, line: displayLine(v.line), name: v.name, carrier: v.carrier, subtype: v.subtype ?? "",
    enrolled: v.enrolled ?? 0, status: v.status ?? "", effective: v.effective ?? "", setupIssues: [],
    type: displayLine(v.line), network: v.network ?? "", fundingType: v.fundingType ?? "", renewalDate: v.renewalDate ?? "",
    benefits: v.benefits, rates: v.rates, contributions: v.contributions, eligibility: v.eligibility, documents: v.documents,
  };
}

// --- Enrollment Progress (Phase D-3) ----------------------------------------
// GraphQL `EnrollmentProgress` is flatter than the mock `EnrollmentSummary`; the page
// (EnrollmentProgressPage) only reads status/submitted/inProgress/notStarted/notInvited/
// byCoverage — a 1:1 with the live shape. eventLabel/window/invited are not in the SDL
// EnrollmentProgress (no schema change), so they get derived/placeholder values the page
// doesn't render: invited = submitted+inProgress+notStarted.
export type LiveEnrollmentProgress = {
  employerId: string; planYearId: string; status: string;
  submitted: number; inProgress: number; notStarted: number; notInvited: number;
  byCoverage: { name: string; elected: number; waived: number; pending: number }[];
};

export function mapEnrollmentProgress(v: LiveEnrollmentProgress): EnrollmentSummary {
  return {
    eventLabel: "", // not in the SDL EnrollmentProgress; the progress page doesn't render it
    window: "",
    status: v.status,
    invited: v.submitted + v.inProgress + v.notStarted,
    notInvited: v.notInvited,
    notStarted: v.notStarted,
    inProgress: v.inProgress,
    submitted: v.submitted,
    byCoverage: v.byCoverage,
  };
}

// --- Enrollment Center (Phase D-3b) -----------------------------------------
// GraphQL `EnrollmentCenter` → the four mock sub-shapes the command-center page consumes.
// Normalizations: launchState passes through (same enum); planYearStatus is display-cased
// via mapPlanYearStatus; ReadinessItem.severity is set per array (blockers→"blocker",
// warnings→"warning") since the backend uses high/medium; nullable fields default to ""/0.
export type LiveReadinessItem = { key: string; label: string; severity: string; area: string; description: string | null };
export type LiveLaunchReadiness = {
  planYearStatus: string; readinessPercent: number; canLaunch: boolean; launchState: string;
  blockers: LiveReadinessItem[]; warnings: LiveReadinessItem[];
  checklist: { key: string; label: string; status: string }[];
};
export type LiveEnrollmentWindow = {
  id: string; name: string; type: string; windowLabel: string | null; effectiveRule: string | null;
  employeesAffected: string | null; status: string; completion: number | null; nextAction: string | null;
};
export type LiveOngoingWorkItem = {
  key: string; label: string; count: number; countLabel: string | null; status: string | null;
  urgency: string | null; nextAction: string | null; route: string | null;
};
export type LiveEnrollmentCenter = {
  employerId: string; planYearId: string; launchState: string;
  launchReadiness: LiveLaunchReadiness | null;
  openEnrollmentSummary: OpenEnrollmentSummary | null;
  windows: LiveEnrollmentWindow[];
  ongoingWork: LiveOngoingWorkItem[];
};

/** The four-part bundle the command-center page reads (mirrors the mock hook outputs). */
export type EnrollmentCenterView = {
  launchReadiness: LaunchReadiness | null;
  openEnrollmentSummary: OpenEnrollmentSummary | null;
  windows: EnrollmentWindow[];
  ongoingWork: OngoingWorkItem[];
};

const mapReadinessItem = (i: LiveReadinessItem, severity: "blocker" | "warning"): ReadinessItem => ({
  key: i.key, label: i.label, severity, area: i.area, description: i.description ?? "",
});
const mapReadinessCheck = (c: { key: string; label: string; status: string }): ReadinessCheck => ({
  key: c.key, label: c.label, status: c.status as ReadinessCheck["status"],
});

function mapLaunchReadiness(r: LiveLaunchReadiness): LaunchReadiness {
  return {
    planYearStatus: mapPlanYearStatus(r.planYearStatus),
    readinessPercent: r.readinessPercent,
    blockers: r.blockers.map((b) => mapReadinessItem(b, "blocker")),
    warnings: r.warnings.map((w) => mapReadinessItem(w, "warning")),
    canLaunch: r.canLaunch,
    launchState: r.launchState as LaunchReadiness["launchState"],
    checklist: r.checklist.map(mapReadinessCheck),
  };
}

const mapWindow = (w: LiveEnrollmentWindow): EnrollmentWindow => ({
  id: w.id, name: w.name, type: w.type as EnrollmentWindowType, windowLabel: w.windowLabel ?? "",
  effectiveRule: w.effectiveRule ?? "", employeesAffected: w.employeesAffected ?? "",
  status: w.status, completion: w.completion ?? 0, nextAction: w.nextAction ?? "",
});

const mapOngoing = (o: LiveOngoingWorkItem): OngoingWorkItem => ({
  key: o.key, label: o.label, count: o.count, countLabel: o.countLabel ?? "",
  status: o.status ?? "", urgency: (o.urgency ?? "low") as OngoingWorkUrgency,
  nextAction: o.nextAction ?? "", route: (o.route ?? "enrollment-events") as OngoingWorkRoute,
});

export function mapEnrollmentCenter(v: LiveEnrollmentCenter): EnrollmentCenterView {
  return {
    launchReadiness: v.launchReadiness ? mapLaunchReadiness(v.launchReadiness) : null,
    openEnrollmentSummary: v.openEnrollmentSummary,
    windows: v.windows.map(mapWindow),
    ongoingWork: v.ongoingWork.map(mapOngoing),
  };
}

// Census / employee / dependent live shapes match the mock field names — cast through
// `unknown` for the union-typed fields (employmentStatus, relationship) and the
// CensusEmployee vs EmployeeDetail field differences.
export const asCensusEmployees = (items: unknown): CensusEmployee[] => (items as CensusEmployee[]) ?? [];
export const asCensusContext = (v: unknown): EmployerCensusContext => v as EmployerCensusContext;
export const asEmployeeDetail = (v: unknown): EmployeeDetail | null => (v as unknown as EmployeeDetail) ?? null;
export const asDependents = (v: unknown): Dependent[] => (v as Dependent[]) ?? [];

// --- Elections Review (Phase E-1) --------------------------------------------
import type { ElectionReview, ElectionRow, ElectionStatus, ElectionAction, ElectionIssueType } from "@/lib/mock/db";

export type LiveElectionReviewRow = {
  id: string; employee: string; electionType: string; plans: string; tier: string;
  dependents: number; issue: string | null; issueType: string; eeCost: number;
  submitted: string | null; status: string; action: string;
};
export type LiveElectionReview = {
  readOnly: boolean;
  counts: ElectionReview["counts"];
  rows: LiveElectionReviewRow[];
};

/** Live row status (Submitted/Sent Back/Approved + issue) → the FE display status. */
function mapElectionStatus(r: LiveElectionReviewRow): ElectionStatus {
  if (r.status === "Approved") return "Approved";
  if (r.status === "Submitted" && r.issueType === "none") return "Ready to Approve";
  return "Needs Review"; // Submitted-with-issue and Sent Back both need HR attention
}

const ACTION_BY_LIVE: Record<string, ElectionAction> = {
  "Approve": "Approve",
  "View": "View",
  "Review EOI": "Request EOI",
  "Review Documents": "Request Documents",
  "Recalculate": "Review",
  "Awaiting Resubmission": "View",
};

export function mapElectionReview(v: LiveElectionReview): ElectionReview {
  return {
    readOnly: v.readOnly,
    counts: v.counts,
    rows: v.rows.map((r): ElectionRow => ({
      id: r.id,
      employee: r.employee,
      electionType: r.electionType,
      plans: r.plans,
      tier: r.tier,
      dependents: r.dependents,
      issue: r.issue ?? "No issues",
      issueType: (r.issueType as ElectionIssueType) ?? "none",
      eeCost: r.eeCost,
      submitted: r.submitted ?? "—",
      status: mapElectionStatus(r),
      action: ACTION_BY_LIVE[r.action] ?? "Review",
    })),
  };
}

// --- Deductions workspace (Phase E-2b) ----------------------------------------
import type {
  DeductionReviewRow as MockDeductionRow, DeductionReviewSummary as MockDeductionSummary,
  DeductionChange as MockDeductionChange, ExportBatch as MockExportBatch,
  DeductionReviewStatus, DeductionChangeType, DeductionChangeKind, ExportBatchStatus,
} from "@/lib/mock/db";

export type LiveDeductionsWorkspace = {
  readOnly: boolean;
  deductionSummary: MockDeductionSummary;
  deductionReview: Array<{
    id: string; employee: string; plan: string; tier: string; effective: string | null;
    payrollGroup: string | null; code: string | null; ee: string; er: string;
    changeType: string; status: string; issue: string | null;
  }>;
  deductionChanges: Array<{
    id: string; employee: string; changeType: string; previous: string; new: string;
    effective: string | null; status: string;
  }>;
  exportBatches: Array<{
    id: string; batchDate: string | null; payPeriod: string; employees: number;
    totalEe: string; totalEr: string; status: string; file: string | null; issues: string | null;
  }>;
};

export type DeductionsWorkspaceView = {
  readOnly: boolean;
  deductionSummary: MockDeductionSummary;
  deductionReview: MockDeductionRow[];
  deductionChanges: MockDeductionChange[];
  exportBatches: MockExportBatch[];
};

/** Live change type (add/change/none) → the FE row kind union. */
const ROW_CHANGE_KIND: Record<string, DeductionChangeKind> = {
  add: "New Election",
  change: "Rate Change",
  none: "Changed Election", // placeholder-least-wrong; live rows with no change rarely render a kind
};

/** Live batch status (DB enum, capitalized by the service) → the FE display union. */
const BATCH_STATUS: Record<string, ExportBatchStatus> = {
  Generated: "Exported", // generated & awaiting reconcile reads as Exported in the UI
  sent: "Exported",
  Reconciled: "Reconciled",
  draft: "Draft",
  failed: "Failed",
};

export function mapDeductionsWorkspace(v: LiveDeductionsWorkspace): DeductionsWorkspaceView {
  return {
    readOnly: v.readOnly,
    deductionSummary: v.deductionSummary,
    deductionReview: v.deductionReview.map((r) => ({
      id: r.id, employee: r.employee, plan: r.plan, tier: r.tier,
      effective: r.effective ?? "—", payrollGroup: r.payrollGroup ?? "—",
      code: r.code ?? "", ee: r.ee, er: r.er,
      changeType: ROW_CHANGE_KIND[r.changeType] ?? "Changed Election",
      status: r.status as DeductionReviewStatus,
      issue: r.issue ?? "",
    })),
    deductionChanges: v.deductionChanges.map((c) => ({
      id: c.id, employee: c.employee,
      changeType: (c.changeType === "Amount change" ? "Deduction amount changed" : c.changeType) as DeductionChangeType,
      prev: c.previous, next: c.new, effective: c.effective ?? "—", status: c.status,
    })),
    exportBatches: v.exportBatches.map((b) => ({
      id: b.id, batchDate: b.batchDate ?? "—", payPeriod: b.payPeriod, employees: b.employees,
      totalEe: b.totalEe, totalEr: b.totalEr,
      status: BATCH_STATUS[b.status] ?? (b.status as ExportBatchStatus),
      file: b.file ?? "—", issues: b.issues ?? "",
    })),
  };
}

// --- Life-event queue (Phase E-4) + Documents workspace (Phase E-3) ---------------
import type {
  LifeEventQueue as MockLifeEventQueue, LifeEventCase as MockLifeEventCase, LifeEventCaseStatus,
  DocumentWorkspace as MockDocumentWorkspace, DocRow, DocStatus, DocCategoryName,
  DocReadinessIssue, DocReadinessTone,
} from "@/lib/mock/db";

export type LiveLifeEventQueue = {
  readOnly: boolean;
  counts: MockLifeEventQueue["counts"];
  tasks: { key: string; label: string; count: number }[];
  cases: Array<{ id: string; employee: string; eventType: string; status: string; documents: string | null; electionWindow: string | null; nextStep: string | null; submitted: string | null }>;
};

export function mapLifeEventQueue(v: LiveLifeEventQueue): MockLifeEventQueue {
  return {
    readOnly: v.readOnly,
    counts: v.counts,
    tasks: v.tasks,
    cases: v.cases.map((c): MockLifeEventCase => ({
      id: c.id,
      employee: c.employee,
      eventType: c.eventType,
      status: c.status as LifeEventCaseStatus, // live statuses use the same 5 labels
      documents: c.documents ?? "N/A",
      electionWindow: c.electionWindow ?? "Not opened",
      nextStep: c.nextStep ?? "—",
      submitted: c.submitted ?? "—",
    })),
  };
}

export type LiveDocumentWorkspace = {
  readOnly: boolean; readinessPercent: number; missingCount: number;
  employeeActionCount: number; expiringSoonCount: number;
  issues: { key: string; label: string; count: number; tone: string }[];
  tasks: { key: string; label: string; related: string; priority: string; area: string }[];
  categories: { title: string; total: number; sub: string }[];
  documents: Array<{ documentId: string; name: string; category: string; type: string | null; coverage: string | null; carrier: string | null; relatedTo: string | null; requiredFor: string | null; status: string; expiresAt: string | null; uploadedAt: string | null }>;
};

const DOC_STATUS: Record<string, DocStatus> = {
  Active: "Published",
  "Signature Pending": "Pending Employee Action",
  Signed: "Published",
  Archived: "Archived",
};

export function mapDocumentWorkspace(v: LiveDocumentWorkspace): MockDocumentWorkspace {
  return {
    readOnly: v.readOnly,
    readinessPercent: v.readinessPercent,
    missingCount: v.missingCount,
    employeeActionCount: v.employeeActionCount,
    expiringSoonCount: v.expiringSoonCount,
    issues: v.issues.map((i): DocReadinessIssue => ({ key: i.key, label: i.label, count: i.count, tone: i.tone as DocReadinessTone })),
    tasks: v.tasks.map((t) => ({
      key: t.key, label: t.label, related: t.related, area: t.area,
      priority: ((t.priority.charAt(0).toUpperCase() + t.priority.slice(1)) as "High" | "Medium" | "Low"),
    })),
    categories: v.categories.map((c) => ({ title: c.title as DocCategoryName, total: c.total, sub: c.sub })),
    docs: v.documents.map((d): DocRow => ({
      id: d.documentId,
      name: d.name,
      type: d.type ?? "—",
      category: (d.category === "confirmation" ? "Employee Forms" : "Plan Documents") as DocCategoryName,
      coverage: d.coverage ?? "—",
      carrier: d.carrier ?? "—",
      related: d.relatedTo ?? "—",
      requiredFor: d.requiredFor ?? "—",
      status: DOC_STATUS[d.status] ?? "Published",
      uploaded: d.uploadedAt ? d.uploadedAt.slice(0, 10) : "—",
      expires: d.expiresAt ?? "—",
    })),
  };
}

// --- Compliance workspace (Phase F-4) ------------------------------------------
export type ComplianceView = {
  overview: { label: string; value: string; sub: string; tone: string; iconKey: string; iconCls: string }[];
  needsAttention: { label: string; tone: "danger" | "warning" | "info"; payroll?: boolean }[];
  deadlines: { date: string; item: string; category: string; status: string }[];
  readinessIssues: { label: string; count: number; tone: "danger" | "warning" | "info" }[];
  readinessPct: number;
  aleStatus: string;
  avgMonthly: string;
  affordabilityMethod: string;
  affordable: number;
  needsReviewCount: number;
  missingCount: number;
  forms: { employee: string; aca: string; line14: string; line16: string; months: string; status: string; issues: string }[];
  aleMonths: { month: string; ft: number; ptHours: string; fte: string; total: string; status: string }[];
  affordRows: { e: string; basis: string; wage: string; premium: string; result: string; code: string; status: string }[];
  cobraStats: { activeParticipants: number; qualifyingEvents: number; overdueNotices: number; paymentIssues: number };
  cobraEvents: { id: string; person: string; relationship: string; event: string; notice: string; cobra: string; payment: string; tpa: string; next: string }[];
  cobraBeneficiaries: { name: string; relationship: string; event: string; coverage: string; status: string }[];
  notices: { type: string; audience: string; due: string; delivery: string; status: string }[];
  filingStatus: string;
};

type LiveCompliance = {
  complianceYear: number;
  filingStatus: string | null;
  overview: {
    acaReadinessPct: number; aleStatus: string; formsReady: number | null; formsTotal: number | null;
    cobraPending: number | null; noticesDue: number | null;
    needsAttention: { key: string; title: string; severity: string; route: string | null }[];
    deadlines: { date: string; item: string; category: string; status: string }[];
  };
  aca: {
    readinessPercent: number; blockedForms: number;
    issues: { key: string; label: string; count: number; tone: string }[];
    ale: { aleStatus: string; avgMonthlyCount: number | null; readinessPercent: number | null; months: { month: string; fullTime: number; ptHours: string | null; fte: string | null; total: string | null; status: string }[] };
    affordability: { safeHarborMethod: string; affordable: number; needsReview: number; missing: number; employees: { employee: string; basis: string | null; wage: string | null; premium: string | null; result: string; safeHarborCode: string | null; status: string }[] };
    forms: { employee: string; acaStatus: string | null; line14: string | null; line16: string | null; months: string | null; status: string; issues: string | null }[];
    filingHistory: unknown[];
  };
  cobra: {
    activeParticipants: number; qualifyingEvents: number; overdueNotices: number; paymentIssues: number;
    events: { id: string; person: string; relationship: string | null; event: string; noticeStatus: string | null; cobraStatus: string | null; paymentStatus: string | null; tpaStatus: string | null; nextStep: string | null }[];
    beneficiaries: { name: string; relationship: string | null; event: string; status: string }[];
  };
  notices: { type: string; audience: string | null; due: string | null; delivery: string | null; status: string }[];
};

const OVERVIEW_TONE = (n: number) => (n === 0 ? "text-success" : "text-warning");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Live cobra_status enum → the page's short display labels.
const COBRA_STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending", notice_due: "Due", notice_overdue: "Overdue", notice_sent: "Sent",
  election_window_open: "Open", elected: "Elected", waived: "Waived", election_expired: "Expired", complete: "Complete",
};

export function mapComplianceWorkspace(v: LiveCompliance): ComplianceView {
  const o = v.overview;
  return {
    overview: [
      { label: "ACA Readiness", value: `${o.acaReadinessPct}%`, sub: `${o.formsReady ?? 0} of ${o.formsTotal ?? 0} forms ready`, tone: OVERVIEW_TONE(100 - o.acaReadinessPct), iconKey: "shield", iconCls: "bg-success/10 text-success" },
      { label: "ALE / FTE Status", value: o.aleStatus, sub: v.aca.ale.avgMonthlyCount != null ? `Avg ${v.aca.ale.avgMonthlyCount} / month` : "Not calculated", tone: "text-info", iconKey: "users", iconCls: "bg-info/10 text-info" },
      { label: "1095-C Forms", value: `${o.formsReady ?? 0} / ${o.formsTotal ?? 0}`, sub: `${v.aca.blockedForms} blocked`, tone: OVERVIEW_TONE(v.aca.blockedForms), iconKey: "file", iconCls: "bg-warning/15 text-warning" },
      { label: "COBRA Pending", value: String(o.cobraPending ?? 0), sub: `${v.cobra.overdueNotices} notices overdue`, tone: OVERVIEW_TONE(o.cobraPending ?? 0), iconKey: "bar", iconCls: "bg-warning/15 text-warning" },
      { label: "Notices Due", value: String(o.noticesDue ?? 0), sub: `${v.cobra.overdueNotices} overdue`, tone: OVERVIEW_TONE(o.noticesDue ?? 0), iconKey: "bell", iconCls: "bg-warning/15 text-warning" },
    ],
    needsAttention: o.needsAttention.map((a) => ({ label: a.title, tone: a.severity === "high" ? "danger" : a.severity === "medium" ? "warning" : "info", payroll: /payroll|hours|wage/i.test(a.title) })),
    deadlines: o.deadlines.map((d) => ({ date: d.date, item: d.item, category: d.category, status: cap(d.status.replace(/_/g, " ")) })),
    readinessIssues: v.aca.issues.map((i) => ({ label: i.label, count: i.count, tone: (i.tone === "danger" ? "danger" : i.tone === "warning" ? "warning" : "info") })),
    readinessPct: v.aca.readinessPercent,
    aleStatus: v.aca.ale.aleStatus,
    avgMonthly: v.aca.ale.avgMonthlyCount != null ? String(v.aca.ale.avgMonthlyCount) : "—",
    affordabilityMethod: v.aca.affordability.safeHarborMethod,
    affordable: v.aca.affordability.affordable,
    needsReviewCount: v.aca.affordability.needsReview,
    missingCount: v.aca.affordability.missing,
    forms: v.aca.forms.map((f) => ({ employee: f.employee, aca: f.acaStatus ?? "—", line14: f.line14 ?? "Missing", line16: f.line16 ?? "Missing", months: f.months ?? "0", status: cap(f.status), issues: f.issues ?? "—" })),
    aleMonths: v.aca.ale.months.map((m) => ({ month: m.month, ft: m.fullTime, ptHours: m.ptHours ?? "—", fte: m.fte ?? "—", total: m.total ?? "—", status: "Ready" })),
    affordRows: v.aca.affordability.employees.map((e) => ({ e: e.employee, basis: e.basis ?? "—", wage: e.wage ?? "Missing", premium: e.premium ?? "—", result: e.result.startsWith("Affordable") ? "Affordable" : e.result.startsWith("Unaffordable") ? "Needs Review" : e.result, code: e.safeHarborCode ?? "Missing", status: e.status === "affordable" ? "Ready" : e.status === "needs_review" ? "Review" : "Issue" })),
    cobraStats: { activeParticipants: v.cobra.activeParticipants, qualifyingEvents: v.cobra.qualifyingEvents, overdueNotices: v.cobra.overdueNotices, paymentIssues: v.cobra.paymentIssues },
    cobraEvents: v.cobra.events.map((e) => ({ id: e.id, person: e.person, relationship: cap(e.relationship ?? "employee"), event: e.event, notice: e.noticeStatus ? cap(e.noticeStatus) : "—", cobra: COBRA_STATUS_LABEL[e.cobraStatus ?? ""] ?? "—", payment: "TPA", tpa: e.tpaStatus ?? "TPA", next: e.nextStep ?? "—" })),
    cobraBeneficiaries: v.cobra.beneficiaries.map((b) => ({ name: b.name, relationship: cap(b.relationship ?? ""), event: b.event, coverage: "—", status: COBRA_STATUS_LABEL[b.status] ?? cap(b.status) })),
    notices: v.notices.map((n) => ({ type: n.type, audience: n.audience ?? "—", due: n.due ?? "—", delivery: n.delivery ?? "—", status: cap(n.status) })),
    filingStatus: v.filingStatus ?? "In Preparation",
  };
}
