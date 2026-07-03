// Enrollment query hooks. Phase D-3/D-3b hybrid: `enrollmentProgress` and the consolidated
// `enrollmentCenter` read live when the gate allows (employer + plan year live UUIDs);
// otherwise mock. The 4 granular Enrollment Center getters stay exported (the mock branch of
// `useEnrollmentCenter` reuses them, and no other consumer must change). Mock mode is the
// default and mock getters remain the fallback.
import { useQuery } from "@tanstack/react-query";
import { getEnrollment, getOpenEnrollmentDashboard, getLaunchReadiness, getEnrollmentWindows, getOngoingEnrollmentWork, getOpenEnrollmentSummary, getElectionReview, getLifeEventQueue } from "@/lib/mock/db";
import { resolvePlanYearScopedSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapEnrollmentProgress, mapEnrollmentCenter, mapElectionReview, type LiveEnrollmentProgress, type LiveEnrollmentCenter, type EnrollmentCenterView, type LiveElectionReview } from "./liveMappers";

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

/**
 * Enrollment Center (Phase D-3b) — the consolidated command-center read. Returns the
 * 4-part bundle { launchReadiness, openEnrollmentSummary, windows, ongoingWork }. Live
 * (one `enrollmentCenter` aggregate) only when employerId + planYearId are both live
 * UUIDs; otherwise composed from the existing 4 mock getters — byte-identical to the
 * pre-D-3b page. Mock fallback preserved.
 */
export function useEnrollmentCenter(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("enrollmentCenter", employerId, planYearId) === "live";
  return useQuery<EnrollmentCenterView>({
    queryKey: ["enrollmentCenter", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.enrollmentCenter, { employerId, planYearId })) as {
            enrollmentCenter: LiveEnrollmentCenter;
          };
          return mapEnrollmentCenter(r.enrollmentCenter);
        }
      : () => ({
          launchReadiness: getLaunchReadiness(employerId, planYearId),
          openEnrollmentSummary: getOpenEnrollmentSummary(employerId, planYearId),
          windows: getEnrollmentWindows(employerId, planYearId),
          ongoingWork: getOngoingEnrollmentWork(employerId, planYearId),
        }),
  });
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

/**
 * Elections Review (Phase E-1b). Live only when employerId + planYearId are both live
 * UUIDs; mapped so the page's status/action unions keep working (live "Sent Back"
 * reads as Needs Review with a View action). Mock fallback preserved.
 */
export function useElectionReview(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("electionReview", employerId, planYearId) === "live";
  return useQuery({
    queryKey: ["electionReview", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.electionReview, { employerId, planYearId })) as {
            electionReview: LiveElectionReview;
          };
          return mapElectionReview(r.electionReview);
        }
      : () => getElectionReview(employerId, planYearId),
  });
}

export function useLifeEventQueue(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["lifeEventQueue", employerId, planYearId], queryFn: () => getLifeEventQueue(employerId, planYearId) });
}
