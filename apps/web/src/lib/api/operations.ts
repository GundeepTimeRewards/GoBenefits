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
export type LaunchEnrollmentArgs = { employerId: string; planYearId: string };
export type SendRemindersArgs = { employerId: string; planYearId: string; audience?: string };
export type CreateEnrollmentWindowInput = {
  type: string;
  name?: string;
  windowStart: string;
  windowEnd: string;
  effectiveDate?: string;
};
export type CreateEnrollmentWindowArgs = { employerId: string; planYearId: string; input: CreateEnrollmentWindowInput };
export type ElectionActionArgs = { employerId: string; planYearId: string; electionId: string };
export type SendBackElectionArgs = ElectionActionArgs & { note?: string };
export type ElectionFlagArgs = { employerId: string; electionId: string };
export type MapDeductionCodeArgs = { employerId: string; deductionId: string; code: string };
export type LifeEventCaseArgs = { employerId: string; caseId: string };
export type DenyLifeEventArgs = LifeEventCaseArgs & { reason?: string };
export type ReconcileBatchArgs = { employerId: string; batchId: string };
export type PayrollRowInput = { employeeNumber: string; hours: number; wages?: number };
export type ImportPayrollArgs = { employerId: string; input: { source: string; fileName?: string; periodStart: string; periodEnd: string; payDate?: string; rows: PayrollRowInput[] } };

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

// Enrollment mutations (Phase D-7). Launch returns a minimal aggregate slice — the
// hooks invalidate the full enrollmentCenter read, so the payload only confirms state.
const LAUNCH_ENROLLMENT = `mutation LaunchEnrollment($employerId: ID!, $planYearId: ID!) {
  launchEnrollment(employerId: $employerId, planYearId: $planYearId) { launchState }
}`;
const SEND_ENROLLMENT_REMINDERS = `mutation SendEnrollmentReminders($employerId: ID!, $planYearId: ID!, $audience: String) {
  sendEnrollmentReminders(employerId: $employerId, planYearId: $planYearId, audience: $audience) { jobId status }
}`;
const CREATE_ENROLLMENT_WINDOW = `mutation CreateEnrollmentWindow($employerId: ID!, $planYearId: ID!, $input: CreateEnrollmentWindowInput!) {
  createEnrollmentWindow(employerId: $employerId, planYearId: $planYearId, input: $input) { id name type windowLabel status nextAction }
}`;

// Elections Review (Phase E-1). The read returns the whole exception queue; the
// row-returning mutations select a minimal row (hooks invalidate the full read).
const ELECTION_REVIEW_ROW_FIELDS = `{ id employee electionType plans tier dependents issue issueType eeCost submitted status action }`;
const ELECTION_REVIEW = `query ElectionReview($employerId: ID!, $planYearId: ID!) {
  electionReview(employerId: $employerId, planYearId: $planYearId) {
    readOnly
    counts { needsReview readyToApprove eoi dependent waiver cost approved }
    rows ${ELECTION_REVIEW_ROW_FIELDS}
  }
}`;
const APPROVE_ELECTION = `mutation ApproveElection($employerId: ID!, $planYearId: ID!, $electionId: ID!) {
  approveElection(employerId: $employerId, planYearId: $planYearId, electionId: $electionId) ${ELECTION_REVIEW_ROW_FIELDS}
}`;
const SEND_BACK_ELECTION = `mutation SendBackElection($employerId: ID!, $planYearId: ID!, $electionId: ID!, $note: String) {
  sendBackElection(employerId: $employerId, planYearId: $planYearId, electionId: $electionId, note: $note) ${ELECTION_REVIEW_ROW_FIELDS}
}`;
const REQUEST_EOI = `mutation RequestEoi($employerId: ID!, $electionId: ID!) {
  requestEoi(employerId: $employerId, electionId: $electionId) ${ACTION_RESULT_FIELDS}
}`;
const REQUEST_DEPENDENT_DOCS = `mutation RequestDependentDocs($employerId: ID!, $electionId: ID!) {
  requestDependentDocs(employerId: $employerId, electionId: $electionId) ${ACTION_RESULT_FIELDS}
}`;
const APPROVE_ALL_READY = `mutation ApproveAllReadyElections($employerId: ID!, $planYearId: ID!) {
  approveAllReadyElections(employerId: $employerId, planYearId: $planYearId) ${ACTION_RESULT_FIELDS}
}`;

// Deductions workspace (Phase E-2b).
const DEDUCTION_ROW_FIELDS = `{ id employee plan tier effective payrollGroup code ee er changeType status issue }`;
const DEDUCTIONS_WORKSPACE = `query DeductionsWorkspace($employerId: ID!, $planYearId: ID!) {
  deductionsWorkspace(employerId: $employerId, planYearId: $planYearId) {
    readOnly
    deductionSummary { readyToExport needsReview missingCode amountChanged effectiveThisPeriod totalEe totalEr }
    deductionReview ${DEDUCTION_ROW_FIELDS}
    deductionChanges { id employee changeType previous new effective status }
    exportBatches { id batchDate payPeriod employees totalEe totalEr status file issues }
  }
}`;
const MAP_DEDUCTION_CODE = `mutation MapDeductionCode($employerId: ID!, $deductionId: ID!, $code: String!) {
  mapDeductionCode(employerId: $employerId, deductionId: $deductionId, code: $code) ${DEDUCTION_ROW_FIELDS}
}`;
const EXPORT_READY_DEDUCTIONS = `mutation ExportReadyDeductions($employerId: ID!, $planYearId: ID!) {
  exportReadyDeductions(employerId: $employerId, planYearId: $planYearId) { jobId status }
}`;
const RECONCILE_BATCH = `mutation ReconcileBatch($employerId: ID!, $batchId: ID!) {
  reconcileBatch(employerId: $employerId, batchId: $batchId) { id status }
}`;

// Life events (Phase E-4) + Documents (Phase E-3).
const LIFE_EVENT_CASE_FIELDS = `{ id employee eventType status documents electionWindow nextStep submitted }`;
const LIFE_EVENT_QUEUE = `query LifeEventQueue($employerId: ID!, $planYearId: ID!) {
  lifeEventQueue(employerId: $employerId, planYearId: $planYearId) {
    readOnly
    counts { pendingReview needsDocuments electionWindowsOpen carrierPending completedThisMonth }
    tasks { key label count }
    cases ${LIFE_EVENT_CASE_FIELDS}
  }
}`;
const APPROVE_LIFE_EVENT = `mutation ApproveLifeEvent($employerId: ID!, $caseId: ID!) {
  approveLifeEvent(employerId: $employerId, caseId: $caseId) ${LIFE_EVENT_CASE_FIELDS}
}`;
const DENY_LIFE_EVENT = `mutation DenyLifeEvent($employerId: ID!, $caseId: ID!, $reason: String) {
  denyLifeEvent(employerId: $employerId, caseId: $caseId, reason: $reason) ${LIFE_EVENT_CASE_FIELDS}
}`;
const REQUEST_LIFE_EVENT_DOCS = `mutation RequestLifeEventDocs($employerId: ID!, $caseId: ID!) {
  requestLifeEventDocs(employerId: $employerId, caseId: $caseId) ${ACTION_RESULT_FIELDS}
}`;
const OPEN_ELECTION_WINDOW = `mutation OpenElectionWindow($employerId: ID!, $caseId: ID!) {
  openElectionWindow(employerId: $employerId, caseId: $caseId) ${ACTION_RESULT_FIELDS}
}`;
const DOCUMENT_WORKSPACE = `query DocumentWorkspace($employerId: ID!, $planYearId: ID!) {
  documentWorkspace(employerId: $employerId, planYearId: $planYearId) {
    readOnly readinessPercent missingCount employeeActionCount expiringSoonCount
    issues { key label count tone }
    tasks { key label related priority area }
    categories { title total sub }
    documents { documentId name category type coverage carrier relatedTo requiredFor status expiresAt uploadedAt }
  }
}`;
const GENERATE_CONFIRMATIONS = `mutation GenerateConfirmations($employerId: ID!, $planYearId: ID!) {
  generateConfirmations(employerId: $employerId, planYearId: $planYearId) { jobId status }
}`;

// Compliance workspace (Phase F-4): ACA/ALE + affordability + 1095-C + COBRA + notices.
const PAYROLL_DATA_WORKSPACE = `query PayrollDataWorkspace($employerId: ID!, $planYearId: ID!) {
  payrollDataWorkspace(employerId: $employerId, planYearId: $planYearId) {
    readOnly
    connection { provider frequency currentGroup firstImported lastImported measurementPeriod stabilityPeriod lastSync nextSync dataSource connected lookbackReady }
    importSummary { importedPayPeriods matchedEmployees unmatchedEmployees lastSyncStatus }
    readiness { percent issues { key label count tone } }
    aca { measurementPeriod stabilityPeriod administrativePeriod calcStatus lastCalculated fullTimeDeterminationStatus affordabilityStatus form1095Status }
    payPeriods { id period payDate group employees hours wages status issues source }
    employeeRecords { id name employeeNumber group matchedCensus hours wages aca issues lastImported }
    settings { provider frequency deductionSchedule payrollGroups codeMapping syncSettings exportFormat }
  }
}`;
const IMPORT_PAYROLL_DATA = `mutation ImportPayrollData($employerId: ID!, $input: ImportPayrollInput!) {
  importPayrollData(employerId: $employerId, input: $input) { jobId status }
}`;
const SYNC_PAYROLL_PROVIDER = `mutation SyncPayrollProvider($employerId: ID!) {
  syncPayrollProvider(employerId: $employerId) { jobId status }
}`;
const RUN_ACA_LOOKBACK = `mutation RunAcaLookback($employerId: ID!, $planYearId: ID!) {
  runAcaLookback(employerId: $employerId, planYearId: $planYearId) { jobId status }
}`;
const COMPLIANCE_WORKSPACE = `query ComplianceWorkspace($employerId: ID!, $planYearId: ID!) {
  complianceWorkspace(employerId: $employerId, planYearId: $planYearId) {
    complianceYear filingStatus
    overview {
      acaReadinessPct aleStatus formsReady formsTotal cobraPending noticesDue
      needsAttention { key title severity route }
      deadlines { date item category status }
    }
    aca {
      readinessPercent blockedForms
      issues { key label count tone }
      ale { aleStatus avgMonthlyCount readinessPercent months { month fullTime ptHours fte total status } }
      affordability { safeHarborMethod affordable needsReview missing employees { employee basis wage premium result safeHarborCode status } }
      forms { employee acaStatus line14 line16 months status issues }
      filingHistory { year forms partner generated submitted irsStatus corrections }
    }
    cobra {
      activeParticipants qualifyingEvents overdueNotices paymentIssues
      events { id person relationship event noticeStatus cobraStatus paymentStatus tpaStatus nextStep }
      beneficiaries { name relationship event status }
    }
    notices { type audience due delivery status }
  }
}`;
const CALCULATE_ALE_STATUS = `mutation CalculateAleStatus($employerId: ID!, $complianceYear: Int!) {
  calculateAleStatus(employerId: $employerId, complianceYear: $complianceYear) { jobId status }
}`;
const GENERATE_1095C = `mutation Generate1095c($employerId: ID!, $complianceYear: Int!) {
  generate1095c(employerId: $employerId, complianceYear: $complianceYear) { jobId status }
}`;
const CREATE_COBRA_EVENT = `mutation CreateCobraEvent($employerId: ID!, $input: CreateCobraEventInput!) {
  createCobraEvent(employerId: $employerId, input: $input) { id person event cobraStatus }
}`;
const GENERATE_COBRA_NOTICE = `mutation GenerateCobraNotice($employerId: ID!, $cobraEventId: ID!) {
  generateCobraNotice(employerId: $employerId, cobraEventId: $cobraEventId) { ok message id }
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
  launchEnrollment: { name: "launchEnrollment", kind: "mutation", document: LAUNCH_ENROLLMENT, buildVariables: (a: LaunchEnrollmentArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<LaunchEnrollmentArgs, unknown>,
  sendEnrollmentReminders: { name: "sendEnrollmentReminders", kind: "mutation", document: SEND_ENROLLMENT_REMINDERS, buildVariables: (a: SendRemindersArgs) => compact({ employerId: a.employerId, planYearId: a.planYearId, audience: a.audience }) } as C1Operation<SendRemindersArgs, unknown>,
  createEnrollmentWindow: { name: "createEnrollmentWindow", kind: "mutation", document: CREATE_ENROLLMENT_WINDOW, buildVariables: (a: CreateEnrollmentWindowArgs) => ({ employerId: a.employerId, planYearId: a.planYearId, input: compact(a.input) }) } as C1Operation<CreateEnrollmentWindowArgs, unknown>,
  electionReview: { name: "electionReview", kind: "query", document: ELECTION_REVIEW, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  approveElection: { name: "approveElection", kind: "mutation", document: APPROVE_ELECTION, buildVariables: (a: ElectionActionArgs) => ({ employerId: a.employerId, planYearId: a.planYearId, electionId: a.electionId }) } as C1Operation<ElectionActionArgs, unknown>,
  sendBackElection: { name: "sendBackElection", kind: "mutation", document: SEND_BACK_ELECTION, buildVariables: (a: SendBackElectionArgs) => compact({ employerId: a.employerId, planYearId: a.planYearId, electionId: a.electionId, note: a.note }) } as C1Operation<SendBackElectionArgs, unknown>,
  requestEoi: { name: "requestEoi", kind: "mutation", document: REQUEST_EOI, buildVariables: (a: ElectionFlagArgs) => ({ employerId: a.employerId, electionId: a.electionId }) } as C1Operation<ElectionFlagArgs, unknown>,
  requestDependentDocs: { name: "requestDependentDocs", kind: "mutation", document: REQUEST_DEPENDENT_DOCS, buildVariables: (a: ElectionFlagArgs) => ({ employerId: a.employerId, electionId: a.electionId }) } as C1Operation<ElectionFlagArgs, unknown>,
  approveAllReadyElections: { name: "approveAllReadyElections", kind: "mutation", document: APPROVE_ALL_READY, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  deductionsWorkspace: { name: "deductionsWorkspace", kind: "query", document: DEDUCTIONS_WORKSPACE, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  mapDeductionCode: { name: "mapDeductionCode", kind: "mutation", document: MAP_DEDUCTION_CODE, buildVariables: (a: MapDeductionCodeArgs) => ({ employerId: a.employerId, deductionId: a.deductionId, code: a.code }) } as C1Operation<MapDeductionCodeArgs, unknown>,
  exportReadyDeductions: { name: "exportReadyDeductions", kind: "mutation", document: EXPORT_READY_DEDUCTIONS, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  reconcileBatch: { name: "reconcileBatch", kind: "mutation", document: RECONCILE_BATCH, buildVariables: (a: ReconcileBatchArgs) => ({ employerId: a.employerId, batchId: a.batchId }) } as C1Operation<ReconcileBatchArgs, unknown>,
  lifeEventQueue: { name: "lifeEventQueue", kind: "query", document: LIFE_EVENT_QUEUE, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  approveLifeEvent: { name: "approveLifeEvent", kind: "mutation", document: APPROVE_LIFE_EVENT, buildVariables: (a: LifeEventCaseArgs) => ({ employerId: a.employerId, caseId: a.caseId }) } as C1Operation<LifeEventCaseArgs, unknown>,
  denyLifeEvent: { name: "denyLifeEvent", kind: "mutation", document: DENY_LIFE_EVENT, buildVariables: (a: DenyLifeEventArgs) => compact({ employerId: a.employerId, caseId: a.caseId, reason: a.reason }) } as C1Operation<DenyLifeEventArgs, unknown>,
  requestLifeEventDocs: { name: "requestLifeEventDocs", kind: "mutation", document: REQUEST_LIFE_EVENT_DOCS, buildVariables: (a: LifeEventCaseArgs) => ({ employerId: a.employerId, caseId: a.caseId }) } as C1Operation<LifeEventCaseArgs, unknown>,
  openElectionWindow: { name: "openElectionWindow", kind: "mutation", document: OPEN_ELECTION_WINDOW, buildVariables: (a: LifeEventCaseArgs) => ({ employerId: a.employerId, caseId: a.caseId }) } as C1Operation<LifeEventCaseArgs, unknown>,
  documentWorkspace: { name: "documentWorkspace", kind: "query", document: DOCUMENT_WORKSPACE, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  generateConfirmations: { name: "generateConfirmations", kind: "mutation", document: GENERATE_CONFIRMATIONS, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  payrollDataWorkspace: { name: "payrollDataWorkspace", kind: "query", document: PAYROLL_DATA_WORKSPACE, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  importPayrollData: { name: "importPayrollData", kind: "mutation", document: IMPORT_PAYROLL_DATA, buildVariables: (a: ImportPayrollArgs) => ({ employerId: a.employerId, input: compact(a.input) }) } as C1Operation<ImportPayrollArgs, unknown>,
  syncPayrollProvider: { name: "syncPayrollProvider", kind: "mutation", document: SYNC_PAYROLL_PROVIDER, buildVariables: (a: { employerId: string }) => ({ employerId: a.employerId }) } as C1Operation<{ employerId: string }, unknown>,
  runAcaLookback: { name: "runAcaLookback", kind: "mutation", document: RUN_ACA_LOOKBACK, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  complianceWorkspace: { name: "complianceWorkspace", kind: "query", document: COMPLIANCE_WORKSPACE, buildVariables: (a: PlanYearScopedArgs) => ({ employerId: a.employerId, planYearId: a.planYearId }) } as C1Operation<PlanYearScopedArgs, unknown>,
  calculateAleStatus: { name: "calculateAleStatus", kind: "mutation", document: CALCULATE_ALE_STATUS, buildVariables: (a: { employerId: string; complianceYear: number }) => ({ employerId: a.employerId, complianceYear: a.complianceYear }) } as C1Operation<{ employerId: string; complianceYear: number }, unknown>,
  generate1095c: { name: "generate1095c", kind: "mutation", document: GENERATE_1095C, buildVariables: (a: { employerId: string; complianceYear: number }) => ({ employerId: a.employerId, complianceYear: a.complianceYear }) } as C1Operation<{ employerId: string; complianceYear: number }, unknown>,
  createCobraEvent: { name: "createCobraEvent", kind: "mutation", document: CREATE_COBRA_EVENT, buildVariables: (a: { employerId: string; input: Record<string, unknown> }) => ({ employerId: a.employerId, input: compact(a.input) }) } as C1Operation<{ employerId: string; input: Record<string, unknown> }, unknown>,
  generateCobraNotice: { name: "generateCobraNotice", kind: "mutation", document: GENERATE_COBRA_NOTICE, buildVariables: (a: { employerId: string; cobraEventId: string }) => ({ employerId: a.employerId, cobraEventId: a.cobraEventId }) } as C1Operation<{ employerId: string; cobraEventId: string }, unknown>,
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
