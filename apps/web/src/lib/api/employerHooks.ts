// Employer/agency query hooks. C1 hybrid: `myEmployers`, `employer`, and `me` read live
// when the data-source gate allows; otherwise mock. `useEmployerOverview` stays mock
// (aggregate read-model is Phase D). Default remains mock.
import { useQuery } from "@tanstack/react-query";
import { listEmployers, getEmployerProfile } from "@/lib/mock/db";
import { resolveDataSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapEmployer, mapEmployerSummary, type LiveEmployer, type LiveEmployerSummary } from "./liveMappers";

export function useEmployers() {
  const src = resolveDataSource("myEmployers");
  return useQuery({
    queryKey: ["employers", src],
    queryFn:
      src === "live"
        ? async () => {
            const r = (await runOperation(graphqlClient, operations.myEmployers, undefined)) as { myEmployers: LiveEmployerSummary[] };
            return r.myEmployers.map(mapEmployerSummary);
          }
        : () => listEmployers(),
  });
}

export function useEmployer(employerId: string) {
  const src = resolveDataSource("employer", employerId);
  return useQuery({
    queryKey: ["employer", src, employerId],
    queryFn:
      src === "live"
        ? async () => {
            const r = (await runOperation(graphqlClient, operations.employer, { employerId })) as { employer: LiveEmployer | null };
            return r.employer ? mapEmployer(r.employer) : getEmployerProfile(employerId);
          }
        : () => getEmployerProfile(employerId),
  });
}

// Aggregate dashboard read model — NOT C1. Always mock for now.
export function useEmployerOverview(employerId: string) {
  return useQuery({ queryKey: ["employerOverview", employerId], queryFn: () => getEmployerProfile(employerId) });
}

// Identity. C1 `me` when live; otherwise a mock identity for the default persona.
// `role` mirrors the GraphQL Role enum.
export type MeShape = { userId: string; role: string; agencyId: string | null; email: string; employerId: string | null };

export function useMe() {
  const src = resolveDataSource("me");
  return useQuery({
    queryKey: ["me", src],
    queryFn:
      src === "live"
        ? async () => {
            const r = (await runOperation(graphqlClient, operations.me, undefined)) as { me: MeShape };
            return r.me;
          }
        : (): MeShape => ({ userId: "mock-user", role: "platform_admin", agencyId: null, email: "mock@local", employerId: null }),
  });
}
