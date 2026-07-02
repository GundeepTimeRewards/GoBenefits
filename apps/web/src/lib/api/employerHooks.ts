// Employer/agency query hooks. queryFns return MOCK today; swap for AppSync later.
// Future GraphQL: myEmployers / employer(id) / employerCensusContext(id).
import { useQuery } from "@tanstack/react-query";
import { listEmployers, getEmployerProfile } from "@/lib/mock/db";

export function useEmployers() {
  return useQuery({ queryKey: ["employers"], queryFn: () => listEmployers() });
}

export function useEmployer(employerId: string) {
  return useQuery({ queryKey: ["employer", employerId], queryFn: () => getEmployerProfile(employerId) });
}

export function useEmployerOverview(employerId: string) {
  return useQuery({ queryKey: ["employerOverview", employerId], queryFn: () => getEmployerProfile(employerId) });
}
