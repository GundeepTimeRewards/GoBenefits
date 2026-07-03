// Plan year query hooks. C1 hybrid: `planYears` + `currentPlanYear` read live when the
// gate allows; otherwise mock. `usePlanYearActivity` (deferred in C1) and
// `usePlanYearSetupSteps` (planYearSetupStatus, not C1) stay mock. Default remains mock.
import { useQuery } from "@tanstack/react-query";
import { getPlanYears, getPlanYearActivity, getEmployerProfile, getPlanYearChecklist } from "@/lib/mock/db";
import { resolveDataSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapPlanYear, type LivePlanYear } from "./liveMappers";

export function usePlanYears(employerId: string) {
  const src = resolveDataSource("planYears", employerId);
  return useQuery({
    queryKey: ["planYears", src, employerId],
    queryFn:
      src === "live"
        ? async () => {
            const r = (await runOperation(graphqlClient, operations.planYears, { employerId })) as { planYears: LivePlanYear[] };
            return r.planYears.map(mapPlanYear);
          }
        : () => getPlanYears(employerId),
  });
}

// Deferred in C1 (audit feed) — always mock.
export function usePlanYearActivity(employerId: string) {
  return useQuery({ queryKey: ["planYearActivity", employerId], queryFn: () => getPlanYearActivity(employerId) });
}

export function useCurrentPlanYear(employerId: string) {
  const src = resolveDataSource("currentPlanYear", employerId);
  return useQuery({
    queryKey: ["currentPlanYear", src, employerId],
    queryFn:
      src === "live"
        ? async () => {
            const r = (await runOperation(graphqlClient, operations.currentPlanYear, { employerId })) as {
              currentPlanYear: { id: string; label: string } | null;
            };
            if (r.currentPlanYear) return { id: r.currentPlanYear.id, label: r.currentPlanYear.label };
            const p = getEmployerProfile(employerId);
            return { id: p.currentPlanYearId, label: p.currentPlanYearLabel };
          }
        : () => {
            const p = getEmployerProfile(employerId);
            return { id: p.currentPlanYearId, label: p.currentPlanYearLabel };
          },
  });
}

// planYearSetupStatus is NOT wired in C1 — always mock.
export function usePlanYearSetupSteps(employerId: string, planYearId: string) {
  return useQuery({
    queryKey: ["planYearSetup", employerId, planYearId],
    queryFn: () => getPlanYearChecklist(employerId, planYearId),
  });
}
