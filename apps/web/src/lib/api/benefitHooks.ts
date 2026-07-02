// Benefit plan query hooks. Future GraphQL: benefitPlans(employerId, planYear).
import { useQuery } from "@tanstack/react-query";
import { getBenefitPlans, getBenefitPlanDetail, getPlanCatalog } from "@/lib/mock/db";

export function useBenefitPlans(employerId: string) {
  return useQuery({ queryKey: ["benefitPlans", employerId], queryFn: () => getBenefitPlans(employerId) });
}

export function useBenefitPlanDetail(employerId: string, planId: string) {
  return useQuery({ queryKey: ["benefitPlanDetail", employerId, planId], queryFn: () => getBenefitPlanDetail(employerId, planId) });
}

export function usePlanCatalog(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["planCatalog", employerId, planYearId], queryFn: () => getPlanCatalog(employerId, planYearId) });
}
