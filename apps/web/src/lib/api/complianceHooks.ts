// Compliance query hooks. Future GraphQL: ACA/ALE snapshot + 1095 / COBRA summary.
import { useQuery } from "@tanstack/react-query";
import { getCompliance } from "@/lib/mock/db";

export function useAcaAleSummary(employerId: string) {
  return useQuery({ queryKey: ["acaAle", employerId], queryFn: () => getCompliance(employerId) });
}

export function useCobraSummary(employerId: string) {
  return useQuery({ queryKey: ["cobra", employerId], queryFn: () => getCompliance(employerId).cobra });
}

// Compliance workspace (Phase F-4). Live when employer + plan year are live UUIDs;
// otherwise null so the page falls back to its representative mock constants.
import { resolvePlanYearScopedSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapComplianceWorkspace, type ComplianceView } from "./liveMappers";

export function useComplianceWorkspace(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("complianceWorkspace", employerId, planYearId) === "live";
  return useQuery<ComplianceView | null>({
    queryKey: ["complianceWorkspace", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.complianceWorkspace, { employerId, planYearId })) as {
            complianceWorkspace: Parameters<typeof mapComplianceWorkspace>[0];
          };
          return mapComplianceWorkspace(r.complianceWorkspace);
        }
      : () => null,
  });
}
