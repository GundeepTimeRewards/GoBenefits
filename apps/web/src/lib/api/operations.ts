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

// --- Operation registry (the 14 C1 operations) -------------------------------
export const operations = {
  // Queries
  me: { name: "me", kind: "query", document: ME, buildVariables: () => ({}) } as C1Operation<void, unknown>,
  myEmployers: { name: "myEmployers", kind: "query", document: MY_EMPLOYERS, buildVariables: () => ({}) } as C1Operation<void, unknown>,
  employer: { name: "employer", kind: "query", document: EMPLOYER, buildVariables: (a: EmployerArgs) => ({ employerId: a.employerId }) } as C1Operation<EmployerArgs, unknown>,
  planYears: { name: "planYears", kind: "query", document: PLAN_YEARS, buildVariables: (a: EmployerArgs) => ({ employerId: a.employerId }) } as C1Operation<EmployerArgs, unknown>,
  currentPlanYear: { name: "currentPlanYear", kind: "query", document: CURRENT_PLAN_YEAR, buildVariables: (a: EmployerArgs) => ({ employerId: a.employerId }) } as C1Operation<EmployerArgs, unknown>,
  planYearSetupStatus: { name: "planYearSetupStatus", kind: "query", document: PLAN_YEAR_SETUP_STATUS, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  planCatalog: { name: "planCatalog", kind: "query", document: PLAN_CATALOG, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  benefitPlanDetail: { name: "benefitPlanDetail", kind: "query", document: BENEFIT_PLAN_DETAIL, buildVariables: (a: PlanDetailArgs) => ({ employerId: a.employerId, planYearId: a.planYearId, planId: a.planId }) } as C1Operation<PlanDetailArgs, unknown>,
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
