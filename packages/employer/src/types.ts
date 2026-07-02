/**
 * Employer + plan-year read models (Phase C / C1).
 * Field names/types mirror the GraphQL `Employer` and `PlanYear` types in
 * api/schema.graphql. Dates are AWSDate-compatible "YYYY-MM-DD" strings (the pool
 * returns DATE columns as strings — see packages/data-access/src/pool.ts).
 */

/** GraphQL `EmployerStatus` (prospect | setup | active | archived). */
export type EmployerStatus = string;

/** GraphQL `PlanYearStatus`. DB enum is a subset (setup | active | archived). */
export type PlanYearStatus = string;

export type PlanYear = {
  id: string;
  label: string;
  year: number;
  status: PlanYearStatus;
  periodStart: string; // AWSDate
  periodEnd: string; // AWSDate
  // Below are the aggregate/OE fields on the GraphQL PlanYear. They are NULL in C1 —
  // the enrollment/OE + readiness read models that compute them are Phase D. Only
  // `planCount` is a real, single-tenant count (cheap; no fan-out).
  oeStart: string | null;
  oeEnd: string | null;
  oeWindowLabel: string | null;
  planCount: number | null;
  completionPct: number | null;
  eligibleCount: number | null;
  enrollmentPct: number | null;
  launchBlockers: number | null;
  oeDaysLeft: number | null;
  needsActionCount: number | null;
  /** `PlanYear.plans: [Plan!]!` — empty in C1; the Plan resolver is Phase D. */
  plans: [];
};

export type Employer = {
  employerId: string;
  name: string;
  legalName: string | null;
  ein: string | null;
  industry: string | null;
  employeeCount: number;
  activeCount: number | null;
  locations: number | null;
  renewalMonth: string | null;
  agency: string | null;
  broker: string | null;
  currentPlanYearId: string | null;
  currentPlanYearLabel: string | null;
  status: EmployerStatus;
};
