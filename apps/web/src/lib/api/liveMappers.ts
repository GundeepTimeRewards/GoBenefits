// Maps live C1 GraphQL responses into the mock TS shapes the components already consume,
// so hybrid mode is a drop-in for the mock getter. Census/employee/dependent live shapes
// already match the mock field names (near-identity); employer + plan-year need light
// remapping. Fields with no C1 source get documented null/0 defaults.
import type {
  EmployerProfile, PlanYearRow,
  PlanCatalog, PlanCatalogRow, BenefitPlanDetail,
  PlanBenefitRow, PlanRateRow, PlanContribRow, PlanEligRow, PlanDocRow,
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

// Census / employee / dependent live shapes match the mock field names — cast through
// `unknown` for the union-typed fields (employmentStatus, relationship) and the
// CensusEmployee vs EmployeeDetail field differences.
export const asCensusEmployees = (items: unknown): CensusEmployee[] => (items as CensusEmployee[]) ?? [];
export const asCensusContext = (v: unknown): EmployerCensusContext => v as EmployerCensusContext;
export const asEmployeeDetail = (v: unknown): EmployeeDetail | null => (v as unknown as EmployeeDetail) ?? null;
export const asDependents = (v: unknown): Dependent[] => (v as Dependent[]) ?? [];
