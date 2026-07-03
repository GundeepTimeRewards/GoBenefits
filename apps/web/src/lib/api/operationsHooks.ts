// Operations query hooks. Deductions workspace is live (Phase E-2c); payroll data /
// carrier export batches remain mock until their phases land.
import { useQuery } from "@tanstack/react-query";
import { getPayroll, getCarrierExports, getPayrollWorkspace } from "@/lib/mock/db";
import { resolvePlanYearScopedSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapDeductionsWorkspace, type LiveDeductionsWorkspace, type DeductionsWorkspaceView } from "./liveMappers";

export function usePayrollDeductions(employerId: string) {
  return useQuery({ queryKey: ["payroll", employerId], queryFn: () => getPayroll(employerId) });
}

export function usePayrollWorkspace(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["payrollWorkspace", employerId, planYearId], queryFn: () => getPayrollWorkspace(employerId, planYearId) });
}

export function useCarrierExports(employerId: string) {
  return useQuery({ queryKey: ["carrierExports", employerId], queryFn: () => getCarrierExports(employerId) });
}

/**
 * Deductions workspace (Phase E-2c) — the §10.5 hook split: the Deductions page
 * reads ONLY the deduction slice. Live when employer + plan year are live UUIDs;
 * mock falls back to the shared getPayrollWorkspace getter's deduction fields.
 */
export function useDeductionsWorkspace(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("deductionsWorkspace", employerId, planYearId) === "live";
  return useQuery<DeductionsWorkspaceView>({
    queryKey: ["deductionsWorkspace", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.deductionsWorkspace, { employerId, planYearId })) as {
            deductionsWorkspace: LiveDeductionsWorkspace;
          };
          return mapDeductionsWorkspace(r.deductionsWorkspace);
        }
      : () => {
          const ws = getPayrollWorkspace(employerId, planYearId);
          return {
            readOnly: ws.readOnly,
            deductionSummary: ws.deductionSummary,
            deductionReview: ws.deductionReview,
            deductionChanges: ws.deductionChanges,
            exportBatches: ws.exportBatches,
          };
        },
  });
}
