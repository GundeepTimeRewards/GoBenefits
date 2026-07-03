// C1 GraphQL operation definitions + typed wrappers (groundwork for the C2 seam swap).
// Each operation exposes its `document` (query/mutation text) and a `buildVariables`
// that maps typed args → the GraphQL variables object. Nothing here calls the network
// on its own; `runOperation` / the per-op wrappers take a client explicitly.
//
// Field selections mirror the shapes the mock getters already return, so the eventual
// hook swap is "call runOperation instead of getX()" with the same data shape. Kept in
// one place so the live operations stay in lockstep with the backend contract.
import type { GraphQLClient } from "./client";

export type OperationKind = "query" | "mutation";

export type C1Operation<Args, Data> = {
  readonly name: string;
  readonly kind: OperationKind;
  readonly document: string;
  readonly buildVariables: (args: Args) => Record<string, unknown>;
  /** phantom marker for the response type; not present at runtime */
  readonly __data?: Data;
};

/** Drop undefined keys so optional args don't send `null`/`undefined` variables. */
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// --- Arg types (mirror api/schema.graphql inputs/args) -----------------------
export type EmployerArgs = { employerId: string };
export type PlanYearScopedArgs = { employerId: string; planYearId: string };
export type EmployeesArgs = {
  employerId: string;
  planYearId: string;
  search?: string;
  limit?: number;
  nextToken?: string;
};
export type EmployeeArgs = { employerId: string; employeeId: string };
export type RemoveDependentArgs = { employerId: string; dependentId: string };

export type CreateEmployeeInput = {
  employerId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  employmentStatus?: string;
  hireDate?: string;
  terminationDate?: string;
  employeeClass?: string;
  eligibilityClassId?: string;
  payType?: string;
  salary?: number;
  employeeNumber?: string;
};
export type UpdateEmployeeInput = CreateEmployeeInput & { employeeId: string };
export type CreateDependentInput = {
  employerId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  relationship: string;
  disabled?: boolean;
  student?: boolean;
};
export type UpdateDependentInput = Omit<CreateDependentInput, "employeeId"> & {
  dependentId: string;
  employeeId?: string;
};
export type PlanDetailArgs = { employerId: string; planYearId: string; planId: string };
export type CreatePlanYearArgs = { employerId: string; year: number; label: string };
export type CopyFromPriorYearArgs = { employerId: string; fromPlanYearId: string; toYear: number };
export type PlanYearLifecycleArgs = { employerId: string; planYearId: string };
export type AddPlanArgs = { employerId: string; planYearId: string; line: string; planName: string; carrierName?: string };
export type DuplicatePlanArgs = { employerId: string; planId: string };
export type RateBandInput = { age?: number | null; rateEe: number; rateEeSpouse?: number | null; rateEeChild?: number | null; rateFamily?: number | null };
export type ImportRatesArgs = { employerId: string; planId: string; input: { effectiveDate: string; rows: RateBandInput[] } };
export type ContributionRuleInput = {
  name?: string;
  displayName?: string;
  pctEmployeeHealth?: number;
  pctEmployeeDental?: number;
  pctEmployeeVision?: number;
  pctDependentHealth?: number;
  pctDependentDental?: number;
  pctDependentVision?: number;
  fixedBasicLife?: number;
};
export type UpdateContributionRuleArgs = { employerId: string; input: ContributionRuleInput };

// --- Documents ---------------------------------------------------------------
const ME = `query Me { me { userId role agencyId email employerId } }`;

const MY_EMPLOYERS = `query MyEmployers {
  myEmployers { employerId name industry employeeCount activeCount currentPlanYearId currentPlanYearLabel setupStatus enrollmentState completion issues renewalMonth agency broker }
}`;

const EMPLOYER = `query Employer($employerId: ID!) {
  employer(employerId: $employerId) { employerId name legalName ein industry employeeCount activeCount locations renewalMonth agency broker currentPlanYearId currentPlanYearLabel status }
}`;

const PLAN_YEARS = `query PlanYears($employerId: ID!) {
  planYears(employerId: $employerId) { id label year status periodStart periodEnd oeStart oeEnd oeWindowLabel planCount completionPct eligibleCount enrollmentPct launchBlockers oeDaysLeft needsActionCount }
}`;

const CURRENT_PLAN_YEAR = `query CurrentPlanYear($employerId: ID!) {
  currentPlanYear(employerId: $employerId) { id label year status periodStart periodEnd }
}`;

const PLAN_YEAR_SETUP_STATUS = `query PlanYearSetupStatus($employerId: ID!, $planYearId: ID!) {
  planYearSetupStatus(employerId: $employerId, planYearId: $planYearId) {
    employerId planYearId completionPct blockers
    steps { key label description category requiredByDefault status route message }
  }
}`;

const EMPLOYER_OVERVIEW = `query EmployerOverview($employerId: ID!, $planYearId: ID!) {
  employerOverview(employerId: $employerId, planYearId: $planYearId) {
    employerId planYearId planYearLabel planYearStatus
    eligibleEmployees enrolled waived benefitPlans setupReadinessPct enrollmentPct launchBlockers
    needsAttention { key title severity route }
  }
}`;

const PLAN_CATALOG = `query PlanCatalog($employerId: ID!, $planYearId: ID!) {
  planCatalog(employerId: $employerId, planYearId: $planYearId) {
    employerId planYearId readOnly
    summary { total ready missingRates missingContributions missingDocuments launchBlockers }
    plans { planId name carrier line benefitType subtype status effective enrolled coverageTiers
            rateStatus contributionStatus contributionRule documentStatus eligibleClasses launchBlocker warnings }
  }
}`;

const BENEFIT_PLAN_DETAIL = `query BenefitPlanDetail($employerId: ID!, $planYearId: ID!, $planId: ID!) {
  benefitPlanDetail(employerId: $employerId, planYearId: $planYearId, planId: $planId) {
    planId name carrier line subtype network fundingType effective renewalDate enrolled status
    benefits { label inNetwork outNetwork }
    rates { tier total employer employee }
    contributions { tier employer employee }
    eligibility { class waiting note }
    documents { name type date }
  }
}`;

const ENROLLMENT_PROGRESS = `query EnrollmentProgress($employerId: ID!, $planYearId: ID!) {
  enrollmentProgress(employerId: $employerId, planYearId: $planYearId) {
    employerId planYearId status submitted inProgress notStarted notInvited
    byCoverage { name elected waived pending }
  }
}`;

const ENROLLMENT_CENTER = `query EnrollmentCenter($employerId: ID!, $planYearId: ID!) {
  enrollmentCenter(employerId: $employerId, planYearId: $planYearId) {
    employerId planYearId launchState
    launchReadiness { planYearStatus readinessPercent canLaunch launchState
      blockers { key label severity area description }
      warnings { key label severity area description }
      checklist { key label status } }
    openEnrollmentSummary { completionPercent eligible submitted inProgress notStarted needsAction enrolled waived lateMissing carrierFilesStatus }
    windows { id name type windowLabel effectiveRule employeesAffected status completion nextAction }
    ongoingWork { key label count countLabel status urgency nextAction route }
  }
}`;

const EMPLOYER_CENSUS_CONTEXT = `query EmployerCensusContext($employerId: ID!, $planYearId: ID!) {
  employerCensusContext(employerId: $employerId, planYearId: $planYearId) { employerId employerName planYearId planYearLabel totalEmployees activeEmployees missingRequiredCount missingEligibilityClassCount dependentsMissingDataCount needsReviewCount }
}`;

const EMPLOYEES = `query Employees($employerId: ID!, $planYearId: ID!, $search: String, $limit: Int, $nextToken: String) {
  employees(employerId: $employerId, planYearId: $planYearId, search: $search, limit: $limit, nextToken: $nextToken) {
    items { employeeId employeeNumber firstName lastName email phone dateOfBirth gender employmentStatus hireDate terminationDate employmentClass eligibilityClass payType salary addressSummary dependentCount eligibilityStatus }
    nextToken
  }
}`;

const EMPLOYEE_DETAIL = `query EmployeeDetail($employerId: ID!, $employeeId: ID!) {
  employeeDetail(employerId: $employerId, employeeId: $employeeId) {
    employeeId employeeNumber firstName middleName lastName dateOfBirth gender email altEmail homePhone cellPhone addressLine1 city state zip employmentStatus hireDate originalHireDate terminationDate jobTitle employmentClass eligibilityClass payType salary
    dependents { dependentId firstName lastName dateOfBirth gender relationship disabled student }
  }
}`;

const DEPENDENTS = `query Dependents($employerId: ID!, $employeeId: ID!) {
  dependents(employerId: $employerId, employeeId: $employeeId) { dependentId firstName lastName dateOfBirth gender relationship disabled student }
}`;

const CREATE_EMPLOYEE = `mutation CreateEmployee($input: CreateEmployeeInput!) {
  createEmployee(input: $input) { employeeId employeeNumber firstName lastName employmentStatus }
}`;

const UPDATE_EMPLOYEE = `mutation UpdateEmployee($input: UpdateEmployeeInput!) {
  updateEmployee(input: $input) { employeeId employeeNumber firstName lastName employmentStatus }
}`;

const ADD_DEPENDENT = `mutation AddDependent($input: CreateDependentInput!) {
  addDependent(input: $input) { dependentId firstName lastName relationship }
}`;

const UPDATE_DEPENDENT = `mutation UpdateDependent($input: UpdateDependentInput!) {
  updateDependent(input: $input) { dependentId firstName lastName relationship }
}`;

const REMOVE_DEPENDENT = `mutation RemoveDependent($employerId: ID!, $dependentId: ID!) {
  removeDependent(employerId: $employerId, dependentId: $dependentId) { removed }
}`;

// Plan-year lifecycle mutations (Phase D-5). All return the same PlanYear selection the
// `planYears` read uses (aggregate/OE fields refresh via invalidation, not this payload).
const PLAN_YEAR_MUTATION_FIELDS = `{ id label year status periodStart periodEnd planCount }`;
const CREATE_PLAN_YEAR = `mutation CreatePlanYear($employerId: ID!, $year: Int!, $label: String!) {
  createPlanYear(employerId: $employerId, year: $year, label: $label) ${PLAN_YEAR_MUTATION_FIELDS}
}`;
const COPY_FROM_PRIOR_YEAR = `mutation CopyFromPriorYear($employerId: ID!, $fromPlanYearId: ID!, $toYear: Int!) {
  copyFromPriorYear(employerId: $employerId, fromPlanYearId: $fromPlanYearId, toYear: $toYear) ${PLAN_YEAR_MUTATION_FIELDS}
}`;
const ACTIVATE_PLAN_YEAR = `mutation ActivatePlanYear($employerId: ID!, $planYearId: ID!) {
  activatePlanYear(employerId: $employerId, planYearId: $planYearId) ${PLAN_YEAR_MUTATION_FIELDS}
}`;
const ARCHIVE_PLAN_YEAR = `mutation ArchivePlanYear($employerId: ID!, $planYearId: ID!) {
  archivePlanYear(employerId: $employerId, planYearId: $planYearId) ${PLAN_YEAR_MUTATION_FIELDS}
}`;

// Plans & Rates mutations (Phase D-6). All return ActionResult (id = affected plan/rule).
const ACTION_RESULT_FIELDS = `{ ok message id }`;
const ADD_PLAN = `mutation AddPlan($employerId: ID!, $planYearId: ID!, $line: CoverageLine!, $planName: String!, $carrierName: String) {
  addPlan(employerId: $employerId, planYearId: $planYearId, line: $line, planName: $planName, carrierName: $carrierName) ${ACTION_RESULT_FIELDS}
}`;
const DUPLICATE_PLAN = `mutation DuplicatePlan($employerId: ID!, $planId: ID!) {
  duplicatePlan(employerId: $employerId, planId: $planId) ${ACTION_RESULT_FIELDS}
}`;
const IMPORT_RATES = `mutation ImportRates($employerId: ID!, $planId: ID!, $input: ImportRatesInput!) {
  importRates(employerId: $employerId, planId: $planId, input: $input) ${ACTION_RESULT_FIELDS}
}`;
const UPDATE_CONTRIBUTION_RULE = `mutation UpdateContributionRule($employerId: ID!, $input: ContributionRuleInput!) {
  updateContributionRule(employerId: $employerId, input: $input) ${ACTION_RESULT_FIELDS}
}`;

// --- Operation registry (the 14 C1 operations) -------------------------------
export const operations = {
  // Queries
  me: { name: "me", kind: "query", document: ME, buildVariables: () => ({}) } as C1Operation<void, unknown>,
  myEmployers: { name: "myEmployers", kind: "query", document: MY_EMPLOYERS, buildVariables: () => ({}) } as C1Operation<void, unknown>,
  employer: { name: "employer", kind: "query", document: EMPLOYER, buildVariables: (a: EmployerArgs) => ({ employerId: a.employerId }) } as C1Operation<EmployerArgs, unknown>,
  planYears: { name: "planYears", kind: "query", document: PLAN_YEARS, buildVariables: (a: EmployerArgs) => ({ employerId: a.employerId }) } as C1Operation<EmployerArgs, unknown>,
  currentPlanYear: { name: "currentPlanYear", kind: "query", document: CURRENT_PLAN_YEAR, buildVariables: (a: EmployerArgs) => ({ employerId: a.employerId }) } as C1Operation<EmployerArgs, unknown>,
  planYearSetupStatus: { name: "planYearSetupStatus", kind: "query", document: PLAN_YEAR_SETUP_STATUS, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  employerOverview: { name: "employerOverview", kind: "query", document: EMPLOYER_OVERVIEW, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  planCatalog: { name: "planCatalog", kind: "query", document: PLAN_CATALOG, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  benefitPlanDetail: { name: "benefitPlanDetail", kind: "query", document: BENEFIT_PLAN_DETAIL, buildVariables: (a: PlanDetailArgs) => ({ employerId: a.employerId, planYearId: a.planYearId, planId: a.planId }) } as C1Operation<PlanDetailArgs, unknown>,
  enrollmentProgress: { name: "enrollmentProgress", kind: "query", document: ENROLLMENT_PROGRESS, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  enrollmentCenter: { name: "enrollmentCenter", kind: "query", document: ENROLLMENT_CENTER, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  employerCensusContext: { name: "employerCensusContext", kind: "query", document: EMPLOYER_CENSUS_CONTEXT, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  employees: { name: "employees", kind: "query", document: EMPLOYEES, buildVariables: (a: EmployeesArgs) => compact({ employerId: a.employerId, planYearId: a.planYearId, search: a.search, limit: a.limit, nextToken: a.nextToken }) } as C1Operation<EmployeesArgs, unknown>,
  employeeDetail: { name: "employeeDetail", kind: "query", document: EMPLOYEE_DETAIL, buildVariables: (a: EmployeeArgs) => ({ employerId: a.employerId, employeeId: a.employeeId }) } as C1Operation<EmployeeArgs, unknown>,
  dependents: { name: "dependents", kind: "query", document: DEPENDENTS, buildVariables: (a: EmployeeArgs) => ({ employerId: a.employerId, employeeId: a.employeeId }) } as C1Operation<EmployeeArgs, unknown>,
  // Mutations
  createEmployee: { name: "createEmployee", kind: "mutation", document: CREATE_EMPLOYEE, buildVariables: (a: { input: CreateEmployeeInput }) => ({ input: compact(a.input) }) } as C1Operation<{ input: CreateEmployeeInput }, unknown>,
  updateEmployee: { name: "updateEmployee", kind: "mutation", document: UPDATE_EMPLOYEE, buildVariables: (a: { input: UpdateEmployeeInput }) => ({ input: compact(a.input) }) } as C1Operation<{ input: UpdateEmployeeInput }, unknown>,
  addDependent: { name: "addDependent", kind: "mutation", document: ADD_DEPENDENT, buildVariables: (a: { input: CreateDependentInput }) => ({ input: compact(a.input) }) } as C1Operation<{ input: CreateDependentInput }, unknown>,
  updateDependent: { name: "updateDependent", kind: "mutation", document: UPDATE_DEPENDENT, buildVariables: (a: { input: UpdateDependentInput }) => ({ input: compact(a.input) }) } as C1Operation<{ input: UpdateDependentInput }, unknown>,
  removeDependent: { name: "removeDependent", kind: "mutation", document: REMOVE_DEPENDENT, buildVariables: (a: RemoveDependentArgs) => ({ employerId: a.employerId, dependentId: a.dependentId }) } as C1Operation<RemoveDependentArgs, unknown>,
  createPlanYear: { name: "createPlanYear", kind: "mutation", document: CREATE_PLAN_YEAR, buildVariables: (a: CreatePlanYearArgs) => ({ employerId: a.employerId, year: a.year, label: a.label }) } as C1Operation<CreatePlanYearArgs, unknown>,
  copyFromPriorYear: { name: "copyFromPriorYear", kind: "mutation", document: COPY_FROM_PRIOR_YEAR, buildVariables: (a: CopyFromPriorYearArgs) => ({ employerId: a.employerId, fromPlanYearId: a.fromPlanYearId, toYear: a.toYear }) } as C1Operation<CopyFromPriorYearArgs, unknown>,
  activatePlanYear: { name: "activatePlanYear", kind: "mutation", document: ACTIVATE_PLAN_YEAR, buildVariables: (a: PlanYearLifecycleArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearLifecycleArgs, unknown>,
  archivePlanYear: { name: "archivePlanYear", kind: "mutation", document: ARCHIVE_PLAN_YEAR, buildVariables: (a: PlanYearLifecycleArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearLifecycleArgs, unknown>,
  addPlan: { name: "addPlan", kind: "mutation", document: ADD_PLAN, buildVariables: (a: AddPlanArgs) => compact({ employerId: a.employerId, planYearId: a.planYearId, line: a.line, planName: a.planName, carrierName: a.carrierName }) } as C1Operation<AddPlanArgs, unknown>,
  duplicatePlan: { name: "duplicatePlan", kind: "mutation", document: DUPLICATE_PLAN, buildVariables: (a: DuplicatePlanArgs) => ({ employerId: a.employerId, planId: a.planId }) } as C1Operation<DuplicatePlanArgs, unknown>,
  importRates: { name: "importRates", kind: "mutation", document: IMPORT_RATES, buildVariables: (a: ImportRatesArgs) => ({ employerId: a.employerId, planId: a.planId, input: a.input }) } as C1Operation<ImportRatesArgs, unknown>,
  updateContributionRule: { name: "updateContributionRule", kind: "mutation", document: UPDATE_CONTRIBUTION_RULE, buildVariables: (a: UpdateContributionRuleArgs) => ({ employerId: a.employerId, input: compact(a.input) }) } as C1Operation<UpdateContributionRuleArgs, unknown>,
} as const;

export type C1OperationName = keyof typeof operations;

/** Live-capable operation names (the C1 slice + Phase D-1 `planYearSetupStatus`). */
export const C1_OPERATION_NAMES = Object.keys(operations) as C1OperationName[];

/** Execute an operation against a client. Groundwork helper — no screen calls it yet. */
export function runOperation<Args, Data>(
  client: GraphQLClient,
  operation: C1Operation<Args, Data>,
  args: Args
): Promise<Data> {
  return client.request<Data>(operation.document, operation.buildVariables(args));
}
