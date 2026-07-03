// C1 mutation hooks. Same data-source gate as the read hooks: in mock/fallback mode
// these are a NO-OP (matching today's placeholder buttons — nothing is persisted); in
// hybrid/api mode with a live (UUID) employer + configured endpoint they call the C1
// GraphQL mutation and invalidate the relevant live reads. Errors are surfaced as
// form-friendly typed errors (validation / unauthorized / error). No non-C1 mutations.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveDataSource } from "./dataSource";
import { graphqlClient, GraphQLClientError } from "./client";
import {
  operations,
  runOperation,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
  type CreateDependentInput,
  type UpdateDependentInput,
  type CreatePlanYearArgs,
  type CopyFromPriorYearArgs,
  type AddPlanArgs,
  type ImportRatesArgs,
  type ContributionRuleInput,
  type CreateEnrollmentWindowInput,
} from "./operations";

export type MutationErrorType = "validation" | "unauthorized" | "error";
export class FormMutationError extends Error {
  readonly type: MutationErrorType;
  constructor(type: MutationErrorType, message: string) {
    super(message);
    this.name = "FormMutationError";
    this.type = type;
  }
}

/** Map a client error to a form-friendly typed error. */
export function toFormError(e: unknown): FormMutationError {
  if (e instanceof GraphQLClientError) {
    if (e.type === "ValidationError") return new FormMutationError("validation", e.message);
    if (e.type === "Unauthorized") return new FormMutationError("unauthorized", e.message);
    return new FormMutationError("error", e.message);
  }
  if (e instanceof FormMutationError) return e;
  return new FormMutationError("error", (e as Error)?.message ?? "Unexpected error");
}

/** Result flag returned when a mutation is a no-op (mock/fallback mode). */
export type MutationResult<T> = { live: boolean; data: T | null };

function useInvalidate() {
  const qc = useQueryClient();
  // Invalidate by key PREFIX — matches all variants (src/employerId/employeeId in the key).
  return (keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

async function runLive<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    throw toFormError(e);
  }
}

// --- Employee mutations ------------------------------------------------------
const EMPLOYEE_READS = ["census", "censusContext", "employeeDetail"];

export function useCreateEmployee(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, Omit<CreateEmployeeInput, "employerId">>({
    mutationFn: async (input) => {
      if (resolveDataSource("createEmployee", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.createEmployee, { input: { ...input, employerId } }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(EMPLOYEE_READS);
    },
  });
}

export function useUpdateEmployee(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, Omit<UpdateEmployeeInput, "employerId">>({
    mutationFn: async (input) => {
      if (resolveDataSource("updateEmployee", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.updateEmployee, { input: { ...input, employerId } }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(EMPLOYEE_READS);
    },
  });
}

// --- Dependent mutations -----------------------------------------------------
const DEPENDENT_READS = ["dependents", "employeeDetail", "censusContext"];

export function useAddDependent(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, Omit<CreateDependentInput, "employerId">>({
    mutationFn: async (input) => {
      if (resolveDataSource("addDependent", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.addDependent, { input: { ...input, employerId } }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(DEPENDENT_READS);
    },
  });
}

export function useUpdateDependent(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, Omit<UpdateDependentInput, "employerId">>({
    mutationFn: async (input) => {
      if (resolveDataSource("updateDependent", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.updateDependent, { input: { ...input, employerId } }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(DEPENDENT_READS);
    },
  });
}

export function useRemoveDependent(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { dependentId: string }>({
    mutationFn: async ({ dependentId }) => {
      if (resolveDataSource("removeDependent", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.removeDependent, { employerId, dependentId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(DEPENDENT_READS);
    },
  });
}

// --- Plan-year lifecycle mutations (Phase D-5) --------------------------------
// Invalidate every read whose payload shows plan-year identity/status/plan counts:
// the plan-year list + top-bar default, the employer detail (currentPlanYearId),
// and the plan-year-scoped aggregates (overview, setup checklist, catalog).
const PLAN_YEAR_READS = ["planYears", "currentPlanYear", "employer", "employerOverview", "planYearSetup", "planCatalog"];

export function useCreatePlanYear(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, Omit<CreatePlanYearArgs, "employerId">>({
    mutationFn: async (args) => {
      if (resolveDataSource("createPlanYear", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.createPlanYear, { ...args, employerId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(PLAN_YEAR_READS);
    },
  });
}

export function useCopyFromPriorYear(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, Omit<CopyFromPriorYearArgs, "employerId">>({
    mutationFn: async (args) => {
      if (resolveDataSource("copyFromPriorYear", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.copyFromPriorYear, { ...args, employerId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(PLAN_YEAR_READS);
    },
  });
}

export function useActivatePlanYear(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { planYearId: string }>({
    mutationFn: async ({ planYearId }) => {
      if (resolveDataSource("activatePlanYear", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.activatePlanYear, { employerId, planYearId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(PLAN_YEAR_READS);
    },
  });
}

export function useArchivePlanYear(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { planYearId: string }>({
    mutationFn: async ({ planYearId }) => {
      if (resolveDataSource("archivePlanYear", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.archivePlanYear, { employerId, planYearId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(PLAN_YEAR_READS);
    },
  });
}

// --- Plans & Rates mutations (Phase D-6) ---------------------------------------
// Invalidate every read whose payload shows plan/rate/contribution state: the
// catalog + plan detail, the setup checklist + overview (plan readiness feeds
// them), and planYears (planCount on the cards).
const PLAN_CATALOG_READS = ["planCatalog", "benefitPlanDetail", "planYearSetup", "employerOverview", "planYears"];

/** ActionResult payload shape shared by the Plans & Rates mutations. */
export type ActionResultData = { ok: boolean; message: string | null; id: string | null };

export function useAddPlan(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, Omit<AddPlanArgs, "employerId">>({
    mutationFn: async (args) => {
      if (resolveDataSource("addPlan", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.addPlan, { ...args, employerId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(PLAN_CATALOG_READS);
    },
  });
}

export function useDuplicatePlan(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { planId: string }>({
    mutationFn: async ({ planId }) => {
      if (resolveDataSource("duplicatePlan", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.duplicatePlan, { employerId, planId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(PLAN_CATALOG_READS);
    },
  });
}

export function useImportRates(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, Omit<ImportRatesArgs, "employerId">>({
    mutationFn: async (args) => {
      if (resolveDataSource("importRates", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.importRates, { ...args, employerId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(PLAN_CATALOG_READS);
    },
  });
}

export function useUpdateContributionRule(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, ContributionRuleInput>({
    mutationFn: async (input) => {
      if (resolveDataSource("updateContributionRule", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.updateContributionRule, { employerId, input }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(PLAN_CATALOG_READS);
    },
  });
}

// --- Enrollment mutations (Phase D-7) -------------------------------------------
// Launch/reminders/window changes show up in the enrollment aggregates and the
// dashboards that embed them.
const ENROLLMENT_READS = ["enrollmentCenter", "enrollmentProgress", "employerOverview", "planYearSetup"];

export function useLaunchEnrollment(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { planYearId: string }>({
    mutationFn: async ({ planYearId }) => {
      if (resolveDataSource("launchEnrollment", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.launchEnrollment, { employerId, planYearId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(ENROLLMENT_READS);
    },
  });
}

export function useSendEnrollmentReminders(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { planYearId: string; audience?: string }>({
    mutationFn: async (args) => {
      if (resolveDataSource("sendEnrollmentReminders", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.sendEnrollmentReminders, { ...args, employerId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(ENROLLMENT_READS);
    },
  });
}

export function useCreateEnrollmentWindow(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { planYearId: string; input: CreateEnrollmentWindowInput }>({
    mutationFn: async (args) => {
      if (resolveDataSource("createEnrollmentWindow", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.createEnrollmentWindow, { ...args, employerId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(ENROLLMENT_READS);
    },
  });
}

// --- Elections Review mutations (Phase E-1) --------------------------------------
const ELECTION_REVIEW_READS = ["electionReview", "employerOverview", "planYearSetup", "enrollmentCenter", "enrollmentProgress"];

function useElectionMutation<TArgs>(
  employerId: string,
  op: keyof typeof operations,
  buildArgs: (args: TArgs) => Record<string, unknown>
) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, TArgs>({
    mutationFn: async (args) => {
      if (resolveDataSource(op as string, employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations[op] as never, { ...buildArgs(args), employerId } as never));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(ELECTION_REVIEW_READS);
    },
  });
}

export function useApproveElection(employerId: string) {
  return useElectionMutation<{ planYearId: string; electionId: string }>(employerId, "approveElection", (a) => a);
}
export function useSendBackElection(employerId: string) {
  return useElectionMutation<{ planYearId: string; electionId: string; note?: string }>(employerId, "sendBackElection", (a) => a);
}
export function useRequestEoi(employerId: string) {
  return useElectionMutation<{ electionId: string }>(employerId, "requestEoi", (a) => a);
}
export function useRequestDependentDocs(employerId: string) {
  return useElectionMutation<{ electionId: string }>(employerId, "requestDependentDocs", (a) => a);
}
export function useApproveAllReadyElections(employerId: string) {
  return useElectionMutation<{ planYearId: string }>(employerId, "approveAllReadyElections", (a) => a);
}

// --- Deductions workspace mutations (Phase E-2b) ----------------------------------
const DEDUCTIONS_READS = ["deductionsWorkspace", "employerOverview", "planYearSetup"];

export function useMapDeductionCode(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { deductionId: string; code: string }>({
    mutationFn: async (args) => {
      if (resolveDataSource("mapDeductionCode", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.mapDeductionCode, { ...args, employerId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(DEDUCTIONS_READS);
    },
  });
}

export function useExportReadyDeductions(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { planYearId: string }>({
    mutationFn: async ({ planYearId }) => {
      if (resolveDataSource("exportReadyDeductions", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.exportReadyDeductions, { employerId, planYearId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(DEDUCTIONS_READS);
    },
  });
}

export function useReconcileBatch(employerId: string) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, { batchId: string }>({
    mutationFn: async ({ batchId }) => {
      if (resolveDataSource("reconcileBatch", employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations.reconcileBatch, { employerId, batchId }));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(DEDUCTIONS_READS);
    },
  });
}

// --- Life-event decisions + document confirmations (Phase E-6) --------------------
const LIFE_EVENT_READS = ["lifeEventQueue", "employerOverview", "enrollmentCenter"];
const DOCUMENT_READS = ["documentWorkspace", "planYearSetup", "planCatalog", "employerOverview"];

function useGatedMutation<TArgs>(op: keyof typeof operations, employerId: string, reads: string[]) {
  const invalidate = useInvalidate();
  return useMutation<MutationResult<unknown>, FormMutationError, TArgs>({
    mutationFn: async (args) => {
      if (resolveDataSource(op as string, employerId) !== "live") return { live: false, data: null };
      const data = await runLive(() => runOperation(graphqlClient, operations[op] as never, { ...(args as Record<string, unknown>), employerId } as never));
      return { live: true, data };
    },
    onSuccess: (res) => {
      if (res.live) return invalidate(reads);
    },
  });
}

export function useApproveLifeEvent(employerId: string) {
  return useGatedMutation<{ caseId: string }>("approveLifeEvent", employerId, LIFE_EVENT_READS);
}
export function useDenyLifeEvent(employerId: string) {
  return useGatedMutation<{ caseId: string; reason?: string }>("denyLifeEvent", employerId, LIFE_EVENT_READS);
}
export function useRequestLifeEventDocs(employerId: string) {
  return useGatedMutation<{ caseId: string }>("requestLifeEventDocs", employerId, LIFE_EVENT_READS);
}
export function useOpenElectionWindow(employerId: string) {
  return useGatedMutation<{ caseId: string }>("openElectionWindow", employerId, LIFE_EVENT_READS);
}
export function useGenerateConfirmations(employerId: string) {
  return useGatedMutation<{ planYearId: string }>("generateConfirmations", employerId, DOCUMENT_READS);
}
