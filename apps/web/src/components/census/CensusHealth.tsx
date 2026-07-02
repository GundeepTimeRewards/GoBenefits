import { useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { EmployerCensusContext } from "@/lib/census-mock";

/** Compact, collapsible Census Health panel — collapsed by default so it never
 *  overwhelms the primary census table. */
export function CensusHealth({ ctx }: { ctx: EmployerCensusContext }) {
  const [open, setOpen] = useState(false);

  const metrics = [
    { label: "Total employees", value: ctx.totalEmployees, tone: "text-foreground" },
    { label: "Active employees", value: ctx.activeEmployees, tone: "text-success" },
    { label: "Missing required fields", value: ctx.missingRequiredCount, tone: "text-warning" },
    { label: "Missing eligibility class", value: ctx.missingEligibilityClassCount, tone: "text-warning" },
    { label: "Dependents missing data", value: ctx.dependentsMissingDataCount, tone: "text-warning" },
    { label: "Employees needing review", value: ctx.needsReviewCount, tone: "text-warning" },
  ];

  const flagged = ctx.missingRequiredCount + ctx.missingEligibilityClassCount + ctx.dependentsMissingDataCount + ctx.needsReviewCount;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" /> Census Health
          {flagged > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground">
              {flagged} to review
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <CardContent className="grid grid-cols-2 gap-3 border-t pt-3 md:grid-cols-3 lg:grid-cols-6">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className={`text-xl font-semibold ${m.tone}`}>{m.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
