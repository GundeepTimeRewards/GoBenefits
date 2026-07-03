import { Link } from "@tanstack/react-router";
import { AlertTriangle, Users, ClipboardCheck, BarChart3, ShieldCheck, Archive, ArrowRight, PlayCircle, Send, Eye, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader, KpiRow, StatusPill, Banner, LoadingCard } from "@/components/common";
import { useRole } from "@/lib/role-context";
import { getPersonaNav } from "@/lib/persona";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear } from "@/lib/plan-year-context";
import { useEmployer, useEnrollmentProgress, useOpenEnrollmentDashboard } from "@/lib/api";
import { dashboardKpis, dashboardActivity, dashboardAttention } from "@/lib/app-mock";
import type { OeAttention, PlanYearRow } from "@/lib/mock/db";

// Portfolio dashboard for platform / agency / broker (agency-wide).
function PortfolioDashboard() {
  const { role } = useRole();
  const persona = getPersonaNav(role);
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <PageHeader title={persona.dashboardTitle} subtitle={persona.dashboardSubtitle} />
      <KpiRow items={dashboardKpis} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-warning" /> Needs Attention</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dashboardAttention.map((a) => (
              <div key={a.title} className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                <span className="text-sm">{a.title}</span>
                <StatusPill label={a.tone === "danger" ? "High" : "Review"} tone={a.tone} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dashboardActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <span><span className="font-medium">{a.who}</span> {a.action}</span>
                <span className="text-xs text-muted-foreground">{a.when}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Company dashboard for Employer Admin — reacts to the active PLAN YEAR.
function CompanyDashboard() {
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  if (!employer || !py) return <LoadingCard label="Loading dashboard…" />;

  const enrolled = Math.round((py.eligible * py.enrollment) / 100);
  const statusLabel = py.status === "Setup" ? "In Setup" : py.status === "OpenEnrollment" ? "Open Enrollment" : py.status;

  // Live open-enrollment phase gets its own full experience.
  if (py.status === "OpenEnrollment") return <OpenEnrollmentDashboard employerId={employerId} employerName={employer.name} py={py} />;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <PageHeader title="Company Dashboard" subtitle={`${employer.name} · ${py.label} · ${statusLabel}`} />

      {py.status === "Archived" && (
        <Banner tone="info"><Archive className="h-4 w-4 shrink-0" /> This plan year is archived — read-only summary.</Banner>
      )}

      {py.status === "Setup" && (
        <>
          <KpiRow items={[
            { label: "Eligible Employees", value: py.eligible, icon: Users },
            { label: "Setup Readiness", value: `${py.completion}%`, tone: "text-success", icon: ClipboardCheck, iconClass: "bg-success/10 text-success" },
            { label: "Enrollment Progress", value: `${py.enrollment}%`, tone: "text-info", icon: BarChart3, iconClass: "bg-info/10 text-info" },
            { label: "Launch Blockers", value: py.blockers, tone: py.blockers ? "text-warning" : "", icon: AlertTriangle, iconClass: "bg-warning/15 text-warning" },
          ]} />
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-teal/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="text-sm font-semibold">{py.label} setup is {py.completion}% complete</div>
                <div className="text-xs text-muted-foreground">Finish the readiness checklist to open enrollment.</div>
              </div>
              <Button asChild size="sm"><Link to="/employers/$employerId/plan-years/$planYearId/setup" params={{ employerId, planYearId: py.id }}>Continue Setup <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-warning" /> Needs Attention</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {dashboardAttention.map((a) => (
                <div key={a.title} className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                  <span className="text-sm">{a.title}</span>
                  <StatusPill label={a.tone === "danger" ? "High" : "Review"} tone={a.tone} />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {py.status === "Active" && (
        <>
          <KpiRow items={[
            { label: "Eligible Employees", value: py.eligible, icon: Users },
            { label: "Enrolled", value: enrolled, tone: "text-success", icon: ClipboardCheck, iconClass: "bg-success/10 text-success" },
            { label: "Waived", value: py.eligible - enrolled, icon: BarChart3 },
            { label: "Benefit Plans", value: py.plans, icon: ShieldCheck },
          ]} />
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Active Coverage Year</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{py.label} is your active coverage year ({py.period}). {enrolled} of {py.eligible} eligible employees are enrolled.</p>
            </CardContent>
          </Card>
        </>
      )}

      {py.status === "Archived" && (
        <KpiRow items={[
          { label: "Final Enrolled", value: enrolled, icon: ClipboardCheck },
          { label: "Benefit Plans", value: py.plans, icon: ShieldCheck },
          { label: "Coverage Period", value: <span className="text-sm">{py.period}</span>, icon: Archive },
          { label: "Eligible", value: py.eligible, icon: Users },
        ]} />
      )}
    </div>
  );
}

const priorityStyle: Record<OeAttention["priority"], string> = {
  High: "border-destructive/30 bg-destructive/10 text-destructive",
  Medium: "border-warning/40 bg-warning/20 text-warning-foreground",
  Low: "border-info/30 bg-info/15 text-info",
};

function OeStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

// Live open-enrollment experience for Employer Admin (mock data).
function OpenEnrollmentDashboard({ employerId, employerName, py }: { employerId: string; employerName: string; py: PlanYearRow }) {
  const { data: en } = useEnrollmentProgress(employerId, py.id);
  const { data: oe } = useOpenEnrollmentDashboard(employerId);
  if (!en || !oe) return <LoadingCard label="Loading dashboard…" />;

  const total = py.eligible;
  const submitted = en.submitted;
  const inProgress = en.inProgress;
  const notStarted = en.notStarted;
  const needAction = py.needAction ?? 0;
  const daysLeft = py.oeDaysLeft ?? 0;
  const pct = total ? Math.round((submitted / total) * 100) : 0;
  const pctOf = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">Company Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {employerName} · {py.label} · Open enrollment closes in {daysLeft} days. {pct}% complete · {notStarted} have not started · {needAction} need action.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary"><Eye className="mr-2 h-4 w-4" />View Incomplete</Button>
          <Button size="sm"><Send className="mr-2 h-4 w-4" />Send Reminders</Button>
        </div>
      </div>

      <Banner tone="info"><Clock className="h-4 w-4 shrink-0" /> Open enrollment closes in {daysLeft} days. Track completion and follow up with employees.</Banner>

      {/* Open Enrollment Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><PlayCircle className="h-4 w-4 text-primary" /> Open Enrollment Progress</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to="/employers/$employerId/enrollment-progress" params={{ employerId }}>View Enrollment Progress</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold tabular-nums">{pct}%</span>
              <span className="text-sm text-muted-foreground">complete · {submitted} of {total}</span>
            </div>
            <StatusPill label={`${daysLeft} days remaining`} tone="info" />
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            <div className="bg-success" style={{ width: `${pctOf(submitted)}%` }} />
            <div className="bg-info" style={{ width: `${pctOf(inProgress)}%` }} />
            <div className="bg-muted-foreground/30" style={{ width: `${pctOf(notStarted)}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OeStat label="Submitted" value={submitted} accent="text-success" />
            <OeStat label="In Progress" value={inProgress} accent="text-info" />
            <OeStat label="Not Started" value={notStarted} accent="text-warning" />
            <OeStat label="Need Action" value={needAction} accent="text-destructive" />
          </div>
          <div className="rounded-md border border-info/30 bg-info/5 p-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Insight:</span> {oe.insight}
          </div>
        </CardContent>
      </Card>

      {/* Reminder Schedule + Needs Attention */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-primary" /> Reminder Schedule</CardTitle>
            <Button variant="outline" size="sm">Edit Schedule</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {oe.reminders.map((r) => (
              <div key={r.date} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{r.date}</div>
                  <div className="text-xs text-muted-foreground">{r.audience}</div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[11px]">{r.channel}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-destructive" /> Needs Attention</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link to="/employers/$employerId/enrollment-progress" params={{ employerId }}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {oe.attention.map((a) => (
              <div key={a.title} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">{a.title}</div>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${priorityStyle[a.priority]}`}>{a.priority}</Badge>
                </div>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">Resolve <ArrowRight className="h-3 w-3" /></span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Progress by Benefit */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Progress by Benefit</CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link to="/employers/$employerId/enrollment-progress" params={{ employerId }}>View details</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {oe.byBenefit.map((b) => {
            const bp = b.total ? Math.round((b.completed / b.total) * 100) : 0;
            return (
              <div key={b.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-xs text-muted-foreground">{b.completed} of {b.total} · {bp}%</span>
                </div>
                <Progress value={bp} className="h-2" />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardPage() {
  const { role } = useRole();
  return role === "employer_admin" ? <CompanyDashboard /> : <PortfolioDashboard />;
}
