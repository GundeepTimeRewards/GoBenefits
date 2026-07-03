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
