// Census/employee query hooks. Future GraphQL: employees / employerCensusContext /
// employeeDetail / dependents.
import { useQuery } from "@tanstack/react-query";
import { getCensus, getCensusContext, getEmployeeDetail } from "@/lib/mock/db";

export function useCensus(employerId: string) {
  return useQuery({ queryKey: ["census", employerId], queryFn: () => getCensus(employerId) });
}

export function useCensusContext(employerId: string) {
  return useQuery({ queryKey: ["censusContext", employerId], queryFn: () => getCensusContext(employerId) });
}

export function useEmployeeDetail(employerId: string, employeeId: string) {
  return useQuery({
    queryKey: ["employeeDetail", employerId, employeeId],
    queryFn: () => getEmployeeDetail(employerId, employeeId), // null = wrong-employer/not-found
  });
}

export function useDependents(employerId: string, employeeId: string) {
  return useQuery({
    queryKey: ["dependents", employerId, employeeId],
    queryFn: () => getEmployeeDetail(employerId, employeeId)?.dependents ?? [],
  });
}
