// Maps live C1 GraphQL responses into the mock TS shapes the components already consume,
// so hybrid mode is a drop-in for the mock getter. Census/employee/dependent live shapes
// already match the mock field names (near-identity); employer + plan-year need light
// remapping. Fields with no C1 source get documented null/0 defaults.
import type { EmployerProfile, PlanYearRow } from "@/lib/mock/db";
import type { CensusEmployee, EmployerCensusContext, EmployeeDetail, Dependent } from "@/lib/census-mock";

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

// Census / employee / dependent live shapes match the mock field names — cast through
// `unknown` for the union-typed fields (employmentStatus, relationship) and the
// CensusEmployee vs EmployeeDetail field differences.
export const asCensusEmployees = (items: unknown): CensusEmployee[] => (items as CensusEmployee[]) ?? [];
export const asCensusContext = (v: unknown): EmployerCensusContext => v as EmployerCensusContext;
export const asEmployeeDetail = (v: unknown): EmployeeDetail | null => (v as unknown as EmployeeDetail) ?? null;
export const asDependents = (v: unknown): Dependent[] => (v as Dependent[]) ?? [];
