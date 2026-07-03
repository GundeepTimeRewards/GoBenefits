// Plan year query hooks. C1 hybrid: `planYears` + `currentPlanYear` read live when the
// gate allows; otherwise mock. `usePlanYearActivity` (deferred in C1) stays mock.
// `usePlanYearSetupSteps` (planYearSetupStatus, Phase D-1) reads live only when BOTH
// employerId and planYearId are live UUIDs; otherwise mock. Default remains mock.
import { useQuery } from "@tanstack/react-query";
import { getPlanYears, getPlanYearActivity, getEmployerProfile, getPlanYearChecklist } from "@/lib/mock/db";
import { summarizeChecklist, type PlanYearSetupView } from "@/lib/plan-year-checklist-mock";
import { resolveDataSource, resolvePlanYearScopedSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapPlanYear, mapPlanYearSetupStatus, type LivePlanYear, type LivePlanYearSetupStatus } from "./liveMappers";

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

/**
 * Plan Year Setup checklist (Phase D-1). Returns the wrapped `PlanYearSetupView`
 * ({ completionPct, blockers, steps }) so the page consumes server-authoritative
 * completion/blocker numbers in live mode. Goes live ONLY when the employer is a live
 * UUID (via the seam gate) AND the planYearId is a live UUID — never mixing a live
 * employer with a mock plan-year slug. Otherwise it wraps the mock checklist (mock
 * visuals unchanged; `getPlanYearChecklist` kept as the fallback source).
 */
export function usePlanYearSetupSteps(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("planYearSetupStatus", employerId, planYearId) === "live";
  return useQuery<PlanYearSetupView>({
    queryKey: ["planYearSetup", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.planYearSetupStatus, { employerId, planYearId })) as {
            planYearSetupStatus: LivePlanYearSetupStatus;
          };
          return mapPlanYearSetupStatus(r.planYearSetupStatus);
        }
      : () => summarizeChecklist(getPlanYearChecklist(employerId, planYearId)),
  });
}
