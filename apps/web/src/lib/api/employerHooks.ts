// Employer/agency query hooks. C1 hybrid: `myEmployers`, `employer`, and `me` read live
// when the data-source gate allows; otherwise mock. `useEmployerOverview` (employerId-only,
// returns the EmployerProfile shape) stays mock and unchanged. D-4 adds the separate
// `useEmployerOverviewRollup(employerId, planYearId)` for the live `employerOverview`
// dashboard aggregate. Default remains mock.
import { useQuery } from "@tanstack/react-query";
import { listEmployers, getEmployerProfile, getPlanYears, getPlanCatalog, getEnrollment, getLaunchReadiness, getOpenEnrollmentSummary } from "@/lib/mock/db";
import { resolveDataSource, resolvePlanYearScopedSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapEmployer, mapEmployerSummary, mapEmployerOverview, type LiveEmployer, type LiveEmployerSummary, type LiveEmployerOverview, type EmployerOverviewRollup, type LiveAttentionItem } from "./liveMappers";

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

// Aggregate dashboard read model — NOT C1. Always mock for now. (Unchanged in D-4; it
// returns the EmployerProfile shape and is used by AgencyScreens.)
export function useEmployerOverview(employerId: string) {
  return useQuery({ queryKey: ["employerOverview", employerId], queryFn: () => getEmployerProfile(employerId) });
}

/** Compose the rollup from existing mock getters (non-authoritative fallback path). */
function composeMockOverviewRollup(employerId: string, planYearId: string): EmployerOverviewRollup {
  const profile = getEmployerProfile(employerId);
  const years = getPlanYears(employerId);
  const py = years.find((y) => y.id === planYearId) ?? years[0];
  const catalog = getPlanCatalog(employerId, planYearId);
  const enr = getEnrollment(employerId);
  const readiness = getLaunchReadiness(employerId, planYearId);
  const oe = getOpenEnrollmentSummary(employerId, planYearId);
  const sevOf = (s: "blocker" | "warning"): string => (s === "blocker" ? "high" : "medium");
  const needsAttention: LiveAttentionItem[] = readiness
    ? [...readiness.blockers, ...readiness.warnings].map((i) => ({ key: i.key, title: i.label, severity: sevOf(i.severity), route: i.area }))
    : [];
  return {
    planYearLabel: py?.label ?? "",
    planYearStatus: py?.status ?? "Setup",
    eligibleEmployees: profile.employeeCount,
    enrolled: enr.submitted,
    waived: enr.byCoverage.reduce((n, c) => n + c.waived, 0),
    benefitPlans: catalog.summary.total,
    setupReadinessPct: readiness?.readinessPercent ?? 0,
    enrollmentPct: oe?.completionPercent ?? 0,
    launchBlockers: readiness?.blockers.length ?? 0,
    needsAttention,
  };
}

/**
 * Employer Overview rollup (Phase D-4) — the live `employerOverview` dashboard aggregate.
 * Live (one call, composed server-side from D-1/D-2/D-3) only when employerId + planYearId
 * are both live UUIDs; otherwise composed from the existing mock getters. Distinct from the
 * employerId-only `useEmployerOverview` above (which stays mock and unchanged). Mock
 * fallback preserved.
 */
export function useEmployerOverviewRollup(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("employerOverview", employerId, planYearId) === "live";
  return useQuery<EmployerOverviewRollup>({
    queryKey: ["employerOverviewRollup", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.employerOverview, { employerId, planYearId })) as {
            employerOverview: LiveEmployerOverview;
          };
          return mapEmployerOverview(r.employerOverview);
        }
      : () => composeMockOverviewRollup(employerId, planYearId),
  });
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
