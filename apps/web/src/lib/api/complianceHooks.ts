// Compliance query hooks. Future GraphQL: ACA/ALE snapshot + 1095 / COBRA summary.
import { useQuery } from "@tanstack/react-query";
import { getCompliance } from "@/lib/mock/db";

export function useAcaAleSummary(employerId: string) {
  return useQuery({ queryKey: ["acaAle", employerId], queryFn: () => getCompliance(employerId) });
}

export function useCobraSummary(employerId: string) {
  return useQuery({ queryKey: ["cobra", employerId], queryFn: () => getCompliance(employerId).cobra });
}
