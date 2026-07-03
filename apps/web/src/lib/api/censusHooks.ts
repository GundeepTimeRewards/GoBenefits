// Census/employee query hooks. C1 hybrid: employees / employerCensusContext /
// employeeDetail / dependents read live when the gate allows; otherwise mock. The two
// plan-year-scoped reads resolve the live current plan year first (falling back to mock if
// the employer has none). Default remains mock.
import { useQuery } from "@tanstack/react-query";
import { getCensus, getCensusContext, getEmployeeDetail } from "@/lib/mock/db";
import { resolveDataSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { asCensusContext, asCensusEmployees, asDependents, asEmployeeDetail } from "./liveMappers";

/** Resolve the employer's live current plan year id (employees/context are PY-scoped). */
async function liveCurrentPlanYearId(employerId: string): Promise<string | undefined> {
  const r = (await runOperation(graphqlClient, operations.currentPlanYear, { employerId })) as {
    currentPlanYear: { id: string } | null;
  };
  return r.currentPlanYear?.id;
}

export function useCensus(employerId: string) {
  const src = resolveDataSource("employees", employerId);
  return useQuery({
    queryKey: ["census", src, employerId],
    queryFn:
      src === "live"
        ? async () => {
            const planYearId = await liveCurrentPlanYearId(employerId);
            if (!planYearId) return getCensus(employerId); // no live plan year → mock
            const r = (await runOperation(graphqlClient, operations.employees, { employerId, planYearId })) as {
              employees: { items: unknown[] };
            };
            return asCensusEmployees(r.employees.items);
          }
        : () => getCensus(employerId),
  });
}

export function useCensusContext(employerId: string) {
  const src = resolveDataSource("employerCensusContext", employerId);
  return useQuery({
    queryKey: ["censusContext", src, employerId],
    queryFn:
      src === "live"
        ? async () => {
            const planYearId = await liveCurrentPlanYearId(employerId);
            if (!planYearId) return getCensusContext(employerId);
            const r = (await runOperation(graphqlClient, operations.employerCensusContext, { employerId, planYearId })) as {
              employerCensusContext: unknown;
            };
            return asCensusContext(r.employerCensusContext);
          }
        : () => getCensusContext(employerId),
  });
}

export function useEmployeeDetail(employerId: string, employeeId: string) {
  const src = resolveDataSource("employeeDetail", employerId);
  return useQuery({
    queryKey: ["employeeDetail", src, employerId, employeeId],
    queryFn:
      src === "live"
        ? async () => {
            const r = (await runOperation(graphqlClient, operations.employeeDetail, { employerId, employeeId })) as {
              employeeDetail: unknown;
            };
            return asEmployeeDetail(r.employeeDetail);
          }
        : () => getEmployeeDetail(employerId, employeeId), // null = wrong-employer/not-found
  });
}

export function useDependents(employerId: string, employeeId: string) {
  const src = resolveDataSource("dependents", employerId);
  return useQuery({
    queryKey: ["dependents", src, employerId, employeeId],
    queryFn:
      src === "live"
        ? async () => {
            const r = (await runOperation(graphqlClient, operations.dependents, { employerId, employeeId })) as {
              dependents: unknown;
            };
            return asDependents(r.dependents);
          }
        : () => getEmployeeDetail(employerId, employeeId)?.dependents ?? [],
  });
}
