import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarRange } from "lucide-react";
import { StatusPill } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYearId, useActivePlanYear, usePlanYearCtx } from "@/lib/plan-year-context";
import { usePlanYears } from "@/lib/api";
import type { PlanYearRow } from "@/lib/mock/db";

const statusLabel: Record<PlanYearRow["status"], string> = { Setup: "In Setup", OpenEnrollment: "Open Enrollment", Active: "Active", Archived: "Archived" };
const statusTone: Record<PlanYearRow["status"], "warning" | "success" | "muted" | "info"> = { Setup: "warning", OpenEnrollment: "info", Active: "success", Archived: "muted" };

// Active plan-year selector for the top bar. Changing it updates the active
// plan year; if the current route carries a $planYearId, it swaps that segment
// (preserving the screen); otherwise it just updates context and the page reacts.
export function PlanYearSwitcher() {
  const employerId = useActiveEmployerId();
  const activePyId = useActivePlanYearId();
  const activePy = useActivePlanYear();
  const { setSelectedPlanYearId } = usePlanYearCtx();
  const { data: years = [] } = usePlanYears(employerId);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function onChange(id: string) {
    setSelectedPlanYearId(id);
    // If the route embeds a plan year (…/plan-years/<id>/setup), swap it.
    if (/\/plan-years\/[^/]+\/setup/.test(pathname)) {
      navigate({ to: pathname.replace(/(\/plan-years\/)[^/]+(\/setup)/, `$1${id}$2`) as never });
    }
  }

  if (years.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarRange className="h-4 w-4" /> Plan Year
        <select
          value={activePyId}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>{y.label} · {statusLabel[y.status]}</option>
          ))}
        </select>
      </label>
      {activePy && <StatusPill label={`Status: ${statusLabel[activePy.status]}`} tone={statusTone[activePy.status]} />}
    </div>
  );
}
