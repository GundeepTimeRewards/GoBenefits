// Enrollment query hooks. Phase D-3 hybrid: `enrollmentProgress` reads live when the gate
// allows (employer + plan year live UUIDs); otherwise mock. The broader Enrollment Center
// hooks (launchReadiness/windows/ongoingWork/openEnrollmentSummary) stay mock — their
// consolidation onto the live `enrollmentCenter` aggregate is deferred to D-3b. Mock
// mode is the default and mock getters remain the fallback.
import { useQuery } from "@tanstack/react-query";
import { getEnrollment, getOpenEnrollmentDashboard, getLaunchReadiness, getEnrollmentWindows, getOngoingEnrollmentWork, getOpenEnrollmentSummary, getElectionReview, getLifeEventQueue } from "@/lib/mock/db";
import { resolvePlanYearScopedSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapEnrollmentProgress, type LiveEnrollmentProgress } from "./liveMappers";

export function useEnrollmentEvents(employerId: string) {
  return useQuery({ queryKey: ["enrollmentEvents", employerId], queryFn: () => getEnrollment(employerId) });
}

/**
 * Enrollment Progress (Phase D-3). Live only when employerId + planYearId are both live
 * UUIDs; otherwise the mock getter. `planYearId` is now threaded (the schema requires it;
 * the mock getter ignores it). Mock fallback preserved.
 */
export function useEnrollmentProgress(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("enrollmentProgress", employerId, planYearId) === "live";
  return useQuery({
    queryKey: ["enrollmentProgress", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.enrollmentProgress, { employerId, planYearId })) as {
            enrollmentProgress: LiveEnrollmentProgress;
          };
          return mapEnrollmentProgress(r.enrollmentProgress);
        }
      : () => getEnrollment(employerId),
  });
}

export function useOpenEnrollmentDashboard(employerId: string) {
  return useQuery({ queryKey: ["oeDashboard", employerId], queryFn: () => getOpenEnrollmentDashboard(employerId) });
}

export function useLaunchReadiness(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["launchReadiness", employerId, planYearId], queryFn: () => getLaunchReadiness(employerId, planYearId) });
}

export function useEnrollmentWindows(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["enrollmentWindows", employerId, planYearId], queryFn: () => getEnrollmentWindows(employerId, planYearId) });
}

export function useOngoingEnrollmentWork(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["ongoingWork", employerId, planYearId], queryFn: () => getOngoingEnrollmentWork(employerId, planYearId) });
}

export function useOpenEnrollmentSummary(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["openEnrollmentSummary", employerId, planYearId], queryFn: () => getOpenEnrollmentSummary(employerId, planYearId) });
}

export function useElectionReview(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["electionReview", employerId, planYearId], queryFn: () => getElectionReview(employerId, planYearId) });
}

export function useLifeEventQueue(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["lifeEventQueue", employerId, planYearId], queryFn: () => getLifeEventQueue(employerId, planYearId) });
}
