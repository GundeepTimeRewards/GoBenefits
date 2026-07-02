// Documents & Forms query hooks. Future GraphQL: documentWorkspace(employerId, planYear).
import { useQuery } from "@tanstack/react-query";
import { getDocumentWorkspace } from "@/lib/mock/db";

export function useDocumentWorkspace(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["documentWorkspace", employerId, planYearId], queryFn: () => getDocumentWorkspace(employerId, planYearId) });
}
