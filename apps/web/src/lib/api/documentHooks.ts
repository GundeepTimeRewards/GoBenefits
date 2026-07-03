// Documents workspace hook (Phase E-6): live when employer + plan year are live
// UUIDs; the mock getter stays the fallback.
import { useQuery } from "@tanstack/react-query";
import { getDocumentWorkspace } from "@/lib/mock/db";
import { resolvePlanYearScopedSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapDocumentWorkspace, type LiveDocumentWorkspace } from "./liveMappers";

export function useDocumentWorkspace(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("documentWorkspace", employerId, planYearId) === "live";
  return useQuery({
    queryKey: ["documentWorkspace", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.documentWorkspace, { employerId, planYearId })) as {
            documentWorkspace: LiveDocumentWorkspace;
          };
          return mapDocumentWorkspace(r.documentWorkspace);
        }
      : () => getDocumentWorkspace(employerId, planYearId),
  });
}
