// Decision-support plan comparison (Decision Support). Shown in the enrollment plan
// step: pick an expected-usage level and see each medical plan's estimated TOTAL
// annual cost (premium + estimated out-of-pocket), ranked, with a recommendation.
// Live from planComparison when context allows; a representative mock otherwise.
import { Sparkles, TrendingDown, BadgeCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePlanComparison, type PlanComparisonRowView } from "@/lib/api/operationsHooks";

const USAGE = [
  { key: "low", label: "Low", hint: "A few visits, maybe a prescription" },
  { key: "medium", label: "Medium", hint: "Ongoing condition or a minor procedure" },
  { key: "high", label: "High", hint: "Surgery, hospitalization, or a serious diagnosis" },
] as const;

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function PlanComparisonCard({
  employerId,
  planYearId,
  employeeId,
  usage,
  onUsageChange,
  selectedPlanId,
  onPick,
}: {
  employerId: string;
  planYearId: string;
  employeeId: string | null;
  usage: "low" | "medium" | "high";
  onUsageChange: (u: "low" | "medium" | "high") => void;
  selectedPlanId?: string;
  onPick?: (planId: string) => void;
}) {
  const { data } = usePlanComparison(employerId, planYearId, employeeId, usage);
  if (!data) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-teal/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Which plan fits you best?
          </CardTitle>
          {data.annualSavings != null && data.annualSavings > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <TrendingDown className="h-3.5 w-3.5" /> Save up to {usd(data.annualSavings)}/yr
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Estimated total cost = your premium + likely out-of-pocket. Pick your expected care level.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Usage selector */}
        <div className="flex flex-wrap gap-1.5">
          {USAGE.map((u) => (
            <button
              key={u.key}
              type="button"
              title={u.hint}
              onClick={() => onUsageChange(u.key)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                usage === u.key ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {u.label} usage
            </button>
          ))}
        </div>

        {/* Ranked plans */}
        <div className="space-y-2">
          {data.plans.map((p) => (
            <ComparisonRow key={p.planId} p={p} selected={selectedPlanId === p.planId} onPick={onPick} />
          ))}
        </div>

        {data.note && <p className="text-[11px] text-muted-foreground">{data.note} Estimates are a guide, not a guarantee.</p>}
      </CardContent>
    </Card>
  );
}

function ComparisonRow({ p, selected, onPick }: { p: PlanComparisonRowView; selected: boolean; onPick?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick?.(p.planId)}
      className={`flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition ${
        selected ? "border-primary bg-primary/5" : p.recommended ? "border-success/40 bg-success/5" : "border-border/60 hover:bg-accent/40"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{p.planName}</span>
          {p.recommended && (
            <Badge variant="outline" className="border-success/40 bg-success/10 text-[10px] text-success">
              <BadgeCheck className="mr-0.5 h-3 w-3" /> Recommended
            </Badge>
          )}
          {p.hsaEligible && <Badge variant="outline" className="border-teal/30 bg-teal/15 text-[10px] text-teal-foreground">HSA</Badge>}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {usd(p.annualPremium)}/yr premium + ~{usd(p.estimatedCareCost)} care · Deductible {usd(p.deductible)} · OOP max {usd(p.outOfPocketMax)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-base font-semibold tabular-nums ${p.recommended ? "text-success" : ""}`}>{usd(p.estimatedAnnualCost)}</div>
        <div className="text-[10px] text-muted-foreground">est. total / yr</div>
      </div>
    </button>
  );
}
