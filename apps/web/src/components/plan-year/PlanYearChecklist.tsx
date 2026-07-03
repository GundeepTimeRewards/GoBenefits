import { Link, useParams } from "@tanstack/react-router";
import { CheckCircle2, Circle, AlertTriangle, Ban, MinusCircle, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useActiveEmployerId } from "@/lib/employer-context";
import { usePlanYearSetupSteps } from "@/lib/api";
import { readinessMeta, summarizeChecklist, type ChecklistStep, type ReadinessStatus } from "@/lib/plan-year-checklist-mock";

const statusIcon: Record<ReadinessStatus, React.ComponentType<{ className?: string }>> = {
  not_started: Circle,
  in_progress: Loader2,
  complete: CheckCircle2,
  needs_attention: AlertTriangle,
  blocked: Ban,
  not_applicable: MinusCircle,
};

/**
 * Derived-readiness setup checklist. In live (hybrid) mode `completionPct` + `blockers`
 * are COMPUTED SERVER-SIDE from real domain entities and rendered verbatim here; in mock
 * mode they are summarized from the fixture. The FE never computes authoritative
 * completion math for live data. Renders one row per step with status, required/optional,
 * action route, warnings, and the admin-override note. A `steps` prop (tests/storybook)
 * bypasses the hook and is summarized locally.
 */
export function PlanYearChecklist({ steps }: { steps?: ChecklistStep[] }) {
  const employerId = useActiveEmployerId();
  const { planYearId } = useParams({ strict: false });
  const setup = usePlanYearSetupSteps(employerId, planYearId ?? "");
  const view = steps ? summarizeChecklist(steps) : setup.data;
  const resolved = view?.steps ?? [];
  const completionPct = view?.completionPct ?? 0;
  const blockers = view?.blockers ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Plan Year Setup Checklist</CardTitle>
          <span className="text-xs text-muted-foreground">
            {completionPct}% complete{blockers > 0 ? ` · ${blockers} blocker${blockers === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        <Progress value={completionPct} className="mt-2 h-2" />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {resolved.map((step) => {
          const Icon = statusIcon[step.status];
          const meta = readinessMeta[step.status];
          const muted = step.status === "not_applicable";
          return (
            <div
              key={step.stepKey}
              className={`flex items-start gap-3 rounded-md border border-border/60 p-3 ${muted ? "opacity-60" : ""}`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  step.status === "complete"
                    ? "text-success"
                    : step.status === "needs_attention"
                      ? "text-warning"
                      : step.status === "blocked"
                        ? "text-destructive"
                        : "text-muted-foreground"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{step.label}</span>
                  <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
                  {!step.requiredByDefault && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Optional</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                {step.message && <p className="mt-1 text-xs text-warning-foreground">{step.message}</p>}
                {step.overrideNote && (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">Admin override: {step.overrideNote}</p>
                )}
              </div>
              {!muted && (
                <Link
                  to={step.route as never}
                  params={{ employerId } as never}
                  className="inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs text-primary hover:bg-muted"
                >
                  Open <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
