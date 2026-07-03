// Benefit plan query hooks. Phase D-2 hybrid: `planCatalog` + `benefitPlanDetail` read
// live when the gate allows (all relevant ids are live UUIDs); otherwise mock. Mock mode
// is the default and mock getters remain the fallback. `useBenefitPlans` stays mock
// (no dedicated live field — the catalog supersedes it).
import { useQuery } from "@tanstack/react-query";
import { getBenefitPlans, getBenefitPlanDetail, getPlanCatalog } from "@/lib/mock/db";
import { resolvePlanYearScopedSource, isLiveId } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapPlanCatalog, mapBenefitPlanDetail, type LivePlanCatalog, type LiveBenefitPlanDetail } from "./liveMappers";

export function useBenefitPlans(employerId: string) {
  return useQuery({ queryKey: ["benefitPlans", employerId], queryFn: () => getBenefitPlans(employerId) });
}

/**
 * Plan detail (Phase D-2). Live only when employerId + planYearId + planId are ALL live
 * UUIDs (no id-space mixing); otherwise the mock getter. `planYearId` is now threaded
 * (the schema requires it; the mock getter ignores it).
 */
export function useBenefitPlanDetail(employerId: string, planId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("benefitPlanDetail", employerId, planYearId) === "live" && isLiveId(planId);
  return useQuery({
    queryKey: ["benefitPlanDetail", live ? "live" : "mock", employerId, planYearId, planId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.benefitPlanDetail, { employerId, planYearId, planId })) as {
            benefitPlanDetail: LiveBenefitPlanDetail | null;
          };
          return r.benefitPlanDetail ? mapBenefitPlanDetail(r.benefitPlanDetail) : null;
        }
      : () => getBenefitPlanDetail(employerId, planId),
  });
}

/**
 * Plans & Rates catalog (Phase D-2). Live only when employerId + planYearId are both live
 * UUIDs; otherwise the mock getter (unchanged). Mock fallback preserved.
 */
export function usePlanCatalog(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("planCatalog", employerId, planYearId) === "live";
  return useQuery({
    queryKey: ["planCatalog", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.planCatalog, { employerId, planYearId })) as {
            planCatalog: LivePlanCatalog;
          };
          return mapPlanCatalog(r.planCatalog);
        }
      : () => getPlanCatalog(employerId, planYearId),
  });
}
