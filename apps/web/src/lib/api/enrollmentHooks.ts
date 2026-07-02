// Enrollment query hooks. Future GraphQL: enrollmentEvents / enrollmentProgress.
import { useQuery } from "@tanstack/react-query";
import { getEnrollment, getOpenEnrollmentDashboard, getLaunchReadiness, getEnrollmentWindows, getOngoingEnrollmentWork, getOpenEnrollmentSummary, getElectionReview, getLifeEventQueue } from "@/lib/mock/db";

export function useEnrollmentEvents(employerId: string) {
  return useQuery({ queryKey: ["enrollmentEvents", employerId], queryFn: () => getEnrollment(employerId) });
}

export function useEnrollmentProgress(employerId: string) {
  return useQuery({ queryKey: ["enrollmentProgress", employerId], queryFn: () => getEnrollment(employerId) });
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
