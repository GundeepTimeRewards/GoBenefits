import { createContext, useContext, useState, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { useActiveEmployerId } from "@/lib/employer-context";
import { getPlanYears, getEmployerProfile, type PlanYearRow } from "@/lib/mock/db";

// Active plan year, per employer. Source of truth: the URL ($planYearId) when
// present; otherwise a remembered selection (from the top-bar dropdown), falling
// back to the employer's current/upcoming plan year.
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

/** Active plan year id for the active employer (route > context > employer default). */
export function useActivePlanYearId(): string {
  const employerId = useActiveEmployerId();
  const routePlanYearId = useParams({ strict: false }).planYearId as string | undefined;
  const { selectedPlanYearId } = usePlanYearCtx();
  const years = getPlanYears(employerId);

  if (routePlanYearId && years.some((y) => y.id === routePlanYearId)) return routePlanYearId;
  if (selectedPlanYearId && years.some((y) => y.id === selectedPlanYearId)) return selectedPlanYearId;
  return getEmployerProfile(employerId).currentPlanYearId;
}

/** The active PlanYearRow for the active employer. */
export function useActivePlanYear(): PlanYearRow | undefined {
  const employerId = useActiveEmployerId();
  const pyId = useActivePlanYearId();
  const years = getPlanYears(employerId);
  return years.find((y) => y.id === pyId) ?? years[0];
}
