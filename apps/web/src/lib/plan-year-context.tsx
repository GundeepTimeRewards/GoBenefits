import { createContext, useContext, useState, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { useActiveEmployerId } from "@/lib/employer-context";
import { getPlanYears, getEmployerProfile, type PlanYearRow } from "@/lib/mock/db";
import { DATA_SOURCE_MODE, isLiveId } from "@/lib/api/dataSource";
import { usePlanYears, useCurrentPlanYear } from "@/lib/api";
import { resolveActivePlanYearId } from "@/lib/active-selection";

// Active plan year, per employer. Source of truth: the URL ($planYearId) when
// present; otherwise a remembered selection (from the top-bar dropdown), falling
// back to the employer's current/upcoming plan year.
//
// C2-FE-4: in hybrid/live mode (a live UUID employer), the plan-year id-space is
// live UUIDs resolved from `planYears` / `currentPlanYear`. Mock mode is unchanged
// (synchronous mock getters). Employers with no current plan year resolve to "".
const HYBRID = DATA_SOURCE_MODE !== "mock";

const Ctx = createContext<{ selectedPlanYearId: string | null; setSelectedPlanYearId: (id: string) => void } | null>(null);

export function PlanYearProvider({ children }: { children: ReactNode }) {
  const [selectedPlanYearId, setSelectedPlanYearId] = useState<string | null>(null);
  return <Ctx.Provider value={{ selectedPlanYearId, setSelectedPlanYearId }}>{children}</Ctx.Provider>;
}

export function usePlanYearCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlanYearCtx outside PlanYearProvider");
  return c;
}

/** Active plan year id for the active employer (route > context > employer default).
 *  Live UUIDs in hybrid (for a live employer), mock ids otherwise; "" when the employer
 *  has no plan year yet. */
export function useActivePlanYearId(): string {
  const employerId = useActiveEmployerId();
  const routePlanYearId = useParams({ strict: false }).planYearId as string | undefined;
  const { selectedPlanYearId } = usePlanYearCtx();
  // Hooks are always called (Rules of Hooks); their data is used only when the employer
  // is a live UUID. In mock mode they return the same mock data the getters below do.
  const liveYears = usePlanYears(employerId);
  const liveCurrent = useCurrentPlanYear(employerId);
  const mockYears = getPlanYears(employerId);

  return resolveActivePlanYearId({
    hybrid: HYBRID,
    employerIsLive: isLiveId(employerId),
    routeId: routePlanYearId,
    selectedId: selectedPlanYearId,
    liveIds: (liveYears.data ?? []).map((y) => y.id),
    liveCurrentId: liveCurrent.data?.id,
    liveFirstId: liveYears.data?.[0]?.id,
    mockYearIds: mockYears.map((y) => y.id),
    mockCurrentId: getEmployerProfile(employerId).currentPlanYearId,
  });
}

/** The active PlanYearRow for the active employer. */
export function useActivePlanYear(): PlanYearRow | undefined {
  const employerId = useActiveEmployerId();
  const pyId = useActivePlanYearId();
  const liveYears = usePlanYears(employerId);
  if (HYBRID && isLiveId(employerId)) {
    return (liveYears.data ?? []).find((y) => y.id === pyId) ?? liveYears.data?.[0];
  }
  const years = getPlanYears(employerId);
  return years.find((y) => y.id === pyId) ?? years[0];
}
