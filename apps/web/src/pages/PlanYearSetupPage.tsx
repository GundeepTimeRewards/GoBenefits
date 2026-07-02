import { useParams } from "@tanstack/react-router";
import { PlanYearChecklist } from "@/components/plan-year/PlanYearChecklist";
import { LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useEmployer, usePlanYears } from "@/lib/api";

export function PlanYearSetupPage() {
  const employerId = useActiveEmployerId();
  const { planYearId } = useParams({ strict: false });
  const { data: employer } = useEmployer(employerId);
  const { data: planYears = [] } = usePlanYears(employerId);
  if (!employer) return <LoadingCard label="Loading plan year…" />;
  const py = planYears.find((p) => p.id === planYearId);

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{py?.label ?? planYearId} — Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {employer.name} · readiness is computed from real domain entities (mock here). Each step links to its screen.
        </p>
      </div>
      <PlanYearChecklist />
    </div>
  );
}
