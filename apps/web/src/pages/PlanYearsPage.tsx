import { Link } from "@tanstack/react-router";
import {
  CalendarRange, Users, ShieldCheck, ArrowRight, AlertTriangle, Activity, Layers, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useEmployer, usePlanYears, usePlanYearActivity } from "@/lib/api";
import { NewPlanYearForm, CopyFromPriorYearForm } from "@/components/plan-years/PlanYearForms";
import type { PlanYearRow } from "@/lib/mock/db";

const statusStyle: Record<PlanYearRow["status"], string> = {
  Setup: "border-warning/40 bg-warning/20 text-warning-foreground",
  OpenEnrollment: "border-info/30 bg-info/15 text-info",
  Active: "border-success/30 bg-success/15 text-success",
  Archived: "border-border bg-muted text-muted-foreground",
};
const statusLabel: Record<PlanYearRow["status"], string> = { Setup: "In Setup", OpenEnrollment: "Open Enrollment", Active: "Active", Archived: "Archived" };
function actionLabel(status: PlanYearRow["status"]) {
  if (status === "Setup") return "Continue Setup";
  if (status === "OpenEnrollment") return "View Plan Year";
  if (status === "Active") return "View Active Year";
  return "View Archive";
}

function PlanYearCard({ employerId, py }: { employerId: string; py: PlanYearRow }) {
  const primary = py.status === "Setup" || py.status === "OpenEnrollment";
  return (
    <Card className={`flex flex-col ${primary ? "border-primary/30 ring-1 ring-primary/10" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" />
            {py.label}
          </CardTitle>
          <Badge variant="outline" className={statusStyle[py.status]}>{statusLabel[py.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 text-sm">
        <div className="space-y-1.5">
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Plan Year</span>
            <span className="text-right font-medium">{py.period}</span>
          </div>
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Open Enrollment</span>
            <span className="text-right font-medium">{py.oe}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3 w-3" /> Eligible</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{py.eligible}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3 w-3" /> Benefit Plans</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{py.plans}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Readiness</span>
              <span className="font-medium tabular-nums">{py.completion}%</span>
            </div>
            <Progress value={py.completion} className="h-2" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Enrollment Progress</span>
              <span className="font-medium tabular-nums">{py.enrollment}%</span>
            </div>
            <Progress value={py.enrollment} className="h-2" />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border bg-card px-2.5 py-1.5 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <AlertTriangle className={`h-3.5 w-3.5 ${py.blockers > 0 ? "text-warning-foreground" : "text-muted-foreground"}`} />
            Launch Blockers
          </span>
          <span className={`font-semibold tabular-nums ${py.blockers > 0 ? "text-warning-foreground" : "text-success"}`}>{py.blockers}</span>
        </div>
      </CardContent>
      <div className="border-t p-3">
        <Button asChild variant={primary ? "default" : "outline"} size="sm" className="w-full gap-1.5">
          <Link to="/employers/$employerId/plan-years/$planYearId/setup" params={{ employerId, planYearId: py.id }}>
            {actionLabel(py.status)} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

export function PlanYearsPage() {
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const { data: years = [] } = usePlanYears(employerId);
  const { data: activity = [] } = usePlanYearActivity(employerId);
  if (!employer) return <LoadingCard label="Loading plan years…" />;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">Plan Years</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Manage benefit years, renewals, open enrollment windows, and active coverage periods.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Employer: <span className="font-medium text-foreground">{employer.name}</span>
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <CopyFromPriorYearForm employerId={employerId} years={years} />
          <NewPlanYearForm employerId={employerId} />
        </div>
      </div>

      {/* Why Plan Years Matter — gradient card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-teal/5">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-primary" />
                <div className="text-sm font-semibold">Why Plan Years Matter</div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Plan Years separate each benefit cycle, so plans, rates, contributions, eligibility rules,
                elections, payroll deductions, documents, and carrier exports stay organized by coverage year.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {years.map((py) => <PlanYearCard key={py.id} employerId={employerId} py={py} />)}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Recent Plan Year Activity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {activity.length === 0 && <p className="text-sm text-muted-foreground">No recent activity.</p>}
          {activity.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-sm">
              <span><span className="font-medium">{a.who}</span> · {a.action}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{a.when}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
