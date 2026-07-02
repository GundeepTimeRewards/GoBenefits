// Operations query hooks. Future GraphQL: payrollDeductions / carrier export batches.
import { useQuery } from "@tanstack/react-query";
import { getPayroll, getCarrierExports, getPayrollWorkspace } from "@/lib/mock/db";

export function usePayrollDeductions(employerId: string) {
  return useQuery({ queryKey: ["payroll", employerId], queryFn: () => getPayroll(employerId) });
}

export function usePayrollWorkspace(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["payrollWorkspace", employerId, planYearId], queryFn: () => getPayrollWorkspace(employerId, planYearId) });
}

export function useCarrierExports(employerId: string) {
  return useQuery({ queryKey: ["carrierExports", employerId], queryFn: () => getCarrierExports(employerId) });
}
