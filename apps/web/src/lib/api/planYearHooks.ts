// Plan year query hooks. Future GraphQL: planYears / planYear setup readiness.
import { useQuery } from "@tanstack/react-query";
import { getPlanYears, getPlanYearActivity, getEmployerProfile, getPlanYearChecklist } from "@/lib/mock/db";

export function usePlanYears(employerId: string) {
  return useQuery({ queryKey: ["planYears", employerId], queryFn: () => getPlanYears(employerId) });
}

export function usePlanYearActivity(employerId: string) {
  return useQuery({ queryKey: ["planYearActivity", employerId], queryFn: () => getPlanYearActivity(employerId) });
}

export function useCurrentPlanYear(employerId: string) {
  return useQuery({
    queryKey: ["currentPlanYear", employerId],
    queryFn: () => {
      const p = getEmployerProfile(employerId);
      return { id: p.currentPlanYearId, label: p.currentPlanYearLabel };
    },
  });
}

export function usePlanYearSetupSteps(employerId: string, planYearId: string) {
  return useQuery({
    queryKey: ["planYearSetup", employerId, planYearId],
    queryFn: () => getPlanYearChecklist(employerId, planYearId),
  });
}
