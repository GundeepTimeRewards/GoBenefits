import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Rocket, ShieldAlert, AlertTriangle, CheckCircle2, Eye, Plus, ArrowRight, Archive, Lock, Send, BarChart3, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { PageHeader, KpiRow, StatusPill, LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear, useActivePlanYearId } from "@/lib/plan-year-context";
import { useRole } from "@/lib/role-context";
import { useEmployer, useEnrollmentProgress, useEnrollmentCenter } from "@/lib/api";
import { useLaunchEnrollment, type FormMutationError } from "@/lib/api/mutationHooks";
import { NewEnrollmentWindowForm, SendRemindersControl } from "@/components/enrollment/EnrollmentForms";
import type { LaunchReadiness, PlanYearRow, OpenEnrollmentSummary, OngoingWorkItem, OngoingWorkUrgency } from "@/lib/mock/db";

const WINDOW_TYPES = ["All", "Open Enrollment", "New Hire", "Life Event", "Special Enrollment"] as const;
// User-facing filter-pill labels (internal type values stay short).
const TYPE_LABEL: Record<(typeof WINDOW_TYPES)[number], string> = {
  All: "All",
  "Open Enrollment": "Open Enrollment",
  "New Hire": "New Hire Enrollment",
  "Life Event": "Life Event / QLE",
  "Special Enrollment": "Special Enrollment",
};
const PAYROLL_AREAS = new Set(["Payroll", "Carriers"]); // broker/agency aren't gated by these

function windowTone(status: string): "success" | "info" | "warning" | "muted" {
  if (status === "Open" || status === "Active" || status === "Rolling") return "success";
  if (status === "Ready to Launch") return "info";
  if (status === "Needs Attention") return "warning";
  return "muted"; // Draft / Closed
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

// ── Enrollment Center — command center: readiness / status / windows ─────────
export function EnrollmentEventsPage() {
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  // D-3b: one consolidated hook (live `enrollmentCenter` aggregate, or the 4 mock getters).
  const { data: center } = useEnrollmentCenter(employerId, planYearId);
  const { role } = useRole();
  const [typeFilter, setTypeFilter] = useState<(typeof WINDOW_TYPES)[number]>("All");
  const [launched, setLaunched] = useState(false);
  const launch = useLaunchEnrollment(employerId);

  if (!employer || !py || !center || !center.openEnrollmentSummary || !center.launchReadiness) return <LoadingCard label="Loading enrollment center…" />;
  const oe = center.openEnrollmentSummary;
  const readiness = center.launchReadiness;
  const windows = center.windows;
  const ongoing = center.ongoingWork;

  const brokerView = role === "broker" || role === "agency_admin";
  const blockers = brokerView ? readiness.blockers.filter((b) => !PAYROLL_AREAS.has(b.area)) : readiness.blockers;
  const warnings = brokerView ? readiness.warnings.filter((w) => !PAYROLL_AREAS.has(w.area)) : readiness.warnings;
  const canLaunch = readiness.launchState === "not_launched" && blockers.length === 0 && !brokerView;

  const visibleWindows = typeFilter === "All" ? windows : windows.filter((w) => w.type === typeFilter);

  // Header actions are status-aware. Setup/Open: prepare-and-launch context (preview +
  // create). Closed/Active: results context — creation lives in the Windows card only.
  // Archived: read-only (no creation actions).
  const state = readiness.launchState;
  const showHeaderActions = state === "not_launched" || state === "launched";
  const canCreateWindow = state !== "archived";

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        title="Enrollment Center"
        subtitle={`${employer.name} · ${py.label} — enrollment readiness, status, and windows`}
        actions={showHeaderActions ? (
          <>
            <Button variant="outline" size="sm" asChild><Link to="/employee/enroll"><Eye className="mr-1.5 h-4 w-4" />Preview Employee Experience</Link></Button>
            <NewEnrollmentWindowForm employerId={employerId} planYearId={planYearId} />
          </>
        ) : undefined}
      />

      {/* State-aware primary card */}
      {readiness.launchState === "not_launched" && (
        <LaunchReadinessCard
          readiness={readiness} blockers={blockers} warnings={warnings} canLaunch={canLaunch} brokerView={brokerView}
          launched={launched} launching={launch.isPending} launchError={launch.error}
          onLaunch={() => launch.mutate({ planYearId }, { onSuccess: () => setLaunched(true) })}
        />
      )}
      {readiness.launchState === "launched" && <ProgressSummaryCard oe={oe} employerId={employerId} />}
      {readiness.launchState === "closed" && <ResultsSummaryCard oe={oe} py={py} employerId={employerId} />}
      {readiness.launchState === "archived" && <ArchiveSummaryCard py={py} employerId={employerId} />}

      {/* Ongoing enrollment work — always visible for live years (hidden when archived) */}
      {ongoing.length > 0 && <OngoingEnrollmentWork items={ongoing} employerId={employerId} />}

      {/* Enrollment Windows (compact) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Enrollment Windows</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {canCreateWindow
                  ? `All window types (annual OE, new hire, QLE, special) · ${visibleWindows.length} of ${windows.length} shown`
                  : `${visibleWindows.length} window${visibleWindows.length !== 1 ? "s" : ""} · read-only archive`}
              </p>
            </div>
            {canCreateWindow && <NewEnrollmentWindowForm employerId={employerId} planYearId={planYearId} variant="ghost" />}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WINDOW_TYPES.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  typeFilter === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Next Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleWindows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No enrollment windows match the selected type.</TableCell></TableRow>
              )}
              {visibleWindows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{w.type}</TableCell>
                  <TableCell className="text-sm">{w.windowLabel}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{w.effectiveRule}</TableCell>
                  <TableCell className="text-sm">{w.employeesAffected}</TableCell>
                  <TableCell><StatusPill label={w.status} tone={windowTone(w.status)} /></TableCell>
                  <TableCell className="text-right">
                    {w.nextAction === "View Progress" ? (
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link to="/employers/$employerId/enrollment-progress" params={{ employerId }}>{w.nextAction}</Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8">{w.nextAction}</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Always-visible year-round work: new hires, QLEs, special enrollment, documents.
const urgencyPill: Record<OngoingWorkUrgency, { label: string; tone: "danger" | "warning" | "muted" }> = {
  high: { label: "High", tone: "danger" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "muted" },
};
function OngoingActionButton({ item, employerId }: { item: OngoingWorkItem; employerId: string }) {
  const cls = "h-8 w-full";
  if (item.route === "life-events")
    return <Button asChild variant="outline" size="sm" className={cls}><Link to="/employers/$employerId/life-events" params={{ employerId }}>{item.nextAction}</Link></Button>;
  if (item.route === "documents")
    return <Button asChild variant="outline" size="sm" className={cls}><Link to="/employers/$employerId/documents" params={{ employerId }}>{item.nextAction}</Link></Button>;
  if (item.route === "enrollment-progress")
    return <Button asChild variant="outline" size="sm" className={cls}><Link to="/employers/$employerId/enrollment-progress" params={{ employerId }}>{item.nextAction}</Link></Button>;
  return <Button variant="outline" size="sm" className={cls}>{item.nextAction}</Button>; // Configure → this page (stub)
}
function OngoingEnrollmentWork({ items, employerId }: { items: OngoingWorkItem[]; employerId: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-semibold text-foreground">Ongoing Enrollment Work</h2>
        <span className="text-xs text-muted-foreground">New hires, life events, and special enrollments — active year-round, outside annual open enrollment.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => {
          const u = urgencyPill[it.urgency];
          return (
            <Card key={it.key}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-muted-foreground">{it.label}</div>
                  <StatusPill label={u.label} tone={u.tone} />
                </div>
                <div className={`text-2xl font-semibold tabular-nums ${it.count === 0 ? "text-muted-foreground" : ""}`}>{it.count}</div>
                <div className="text-xs text-muted-foreground">{it.countLabel} · {it.status}</div>
                <OngoingActionButton item={it} employerId={employerId} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// If NOT launched → launch readiness + blockers/warnings + gated Launch button.
function LaunchReadinessCard({ readiness, blockers, warnings, canLaunch, brokerView, launched, launching, launchError, onLaunch }: {
  readiness: LaunchReadiness;
  blockers: LaunchReadiness["blockers"];
  warnings: LaunchReadiness["warnings"];
  canLaunch: boolean; brokerView: boolean; launched: boolean;
  launching?: boolean; launchError?: FormMutationError | null;
  onLaunch: () => void;
}) {
  return (
    <Card className="border-warning/30">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Rocket className="h-4 w-4 text-warning" /> Launch Readiness</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Launch readiness for the annual open enrollment window. {blockers.length} blocker{blockers.length !== 1 ? "s" : ""}, {warnings.length} warning{warnings.length !== 1 ? "s" : ""}.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-semibold tracking-tight">{readiness.readinessPercent}%</div>
              <div className="text-[11px] text-muted-foreground">Readiness</div>
            </div>
            <div className="w-40"><Progress value={readiness.readinessPercent} className="h-2" /></div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {launched && (
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Open enrollment launched (mock) — employees can now enroll.
          </div>
        )}

        {/* Checklist */}
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {readiness.checklist.map((c) => {
            const tone = c.status === "ready" ? "text-success" : c.status === "blocker" ? "text-destructive" : "text-warning";
            const Icon = c.status === "ready" ? CheckCircle2 : c.status === "blocker" ? ShieldAlert : AlertTriangle;
            return (
              <div key={c.key} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} /><span className="truncate">{c.label}</span>
              </div>
            );
          })}
        </div>

        {/* Blockers vs warnings */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Launch Blockers
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{blockers.length}</Badge>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">Must be resolved before launch.</p>
            <ul className="space-y-1">
              {blockers.length === 0 && <li className="rounded-md border border-success/30 bg-success/5 px-2.5 py-1.5 text-sm text-success">No blockers — ready to launch.</li>}
              {blockers.map((b) => (
                <li key={b.key} className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-sm">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span className="flex-1"><span className="font-medium">{b.label}</span><span className="block text-[11px] text-muted-foreground">{b.description}</span></span>
                  <Badge variant="outline" className="border-destructive/20 text-[10px] text-destructive">{b.area}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" /> Warnings
              <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground">{warnings.length}</Badge>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">Review recommended, but won't block launch.</p>
            <ul className="space-y-1">
              {warnings.length === 0 && <li className="rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground">No warnings.</li>}
              {warnings.map((w) => (
                <li key={w.key} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-sm">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <span className="flex-1"><span className="font-medium">{w.label}</span><span className="block text-[11px] text-muted-foreground">{w.description}</span></span>
                  <Badge variant="outline" className="border-warning/40 text-[10px] text-warning-foreground">{w.area}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Primary action */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {brokerView
              ? "Launching open enrollment is an employer decision."
              : blockers.length > 0
                ? <>Resolve <span className="font-medium text-destructive">{blockers.length} blocker{blockers.length !== 1 ? "s" : ""}</span> before launching.</>
                : "All blockers cleared — you're ready to launch."}
          </p>
          <div className="flex flex-wrap gap-2">
            {blockers.length > 0 && <Button variant="outline" size="sm"><ShieldAlert className="mr-1.5 h-4 w-4" />Resolve Blockers</Button>}
            {brokerView ? (
              <Button size="sm" variant="secondary" disabled className="opacity-70"><Lock className="mr-1.5 h-4 w-4" />{blockers.length > 0 ? "Employer approval required" : "Ready for Employer Review"}</Button>
            ) : (
              <Button size="sm" disabled={!canLaunch || launched || launching} onClick={onLaunch} className="bg-warning text-warning-foreground hover:bg-warning/90 disabled:opacity-60">
                <Rocket className="mr-1.5 h-4 w-4" />{launched ? "Enrollment Launched" : launching ? "Launching…" : "Launch Enrollment"}
              </Button>
            )}
          </div>
        </div>
        {launchError && <p className="text-xs text-destructive">{launchError.message}</p>}
      </CardContent>
    </Card>
  );
}

// If OPEN → live progress SUMMARY of the ANNUAL OE window (not new hire / QLE).
function ProgressSummaryCard({ oe, employerId }: { oe: OpenEnrollmentSummary; employerId: string }) {
  const planYearId = useActivePlanYearId();
  return (
    <Card className="border-success/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Open Enrollment Progress</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Open enrollment progress only. Ongoing new hire and life event work is tracked below.</p>
          </div>
          <div className="text-right"><span className="text-2xl font-semibold tabular-nums">{oe.completionPercent}%</span> <span className="text-xs text-muted-foreground">complete</span></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={oe.completionPercent} className="h-2" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Submitted" value={oe.submitted} tone="text-success" />
          <Stat label="In Progress" value={oe.inProgress} tone="text-info" />
          <Stat label="Not Started" value={oe.notStarted} tone="text-warning" />
          <Stat label="Needs Action" value={oe.needsAction} tone="text-destructive" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">{oe.notStarted} employees haven't started — a reminder can nudge them.</p>
          <div className="flex flex-wrap gap-2">
            <SendRemindersControl employerId={employerId} planYearId={planYearId} />
            <Button asChild size="sm"><Link to="/employers/$employerId/enrollment-progress" params={{ employerId }}>View Enrollment Progress <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// If CLOSED (active coverage year) → ANNUAL OE results only (mid-year work is below).
function ResultsSummaryCard({ oe, py, employerId }: { oe: OpenEnrollmentSummary; py: PlanYearRow; employerId: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-success" /> Open Enrollment Results — {py.label}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Annual open enrollment results only. New hire, life event, and special enrollment activity is tracked below.</p>
          </div>
          <div className="text-right"><span className="text-2xl font-semibold tabular-nums">{oe.completionPercent}%</span> <span className="text-xs text-muted-foreground">completed</span></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={oe.completionPercent} className="h-2" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Enrolled" value={oe.enrolled} tone="text-success" />
          <Stat label="Waived" value={oe.waived} />
          <Stat label="Late / Missing" value={oe.lateMissing} tone={oe.lateMissing ? "text-warning" : "text-muted-foreground"} />
          <Stat label="Carrier Files" value={<span className="text-sm text-success">{oe.carrierFilesStatus}</span>} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">Open enrollment is closed — elections are locked for {py.period}.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/employers/$employerId/elections-review" params={{ employerId }}>Review Elections</Link></Button>
            <Button asChild size="sm"><Link to="/employers/$employerId/enrollment-progress" params={{ employerId }}>View Results <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// If ARCHIVED → read-only summary.
function ArchiveSummaryCard({ py, employerId }: { py: PlanYearRow; employerId: string }) {
  const enrolled = Math.round((py.eligible * py.enrollment) / 100);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Archive className="h-4 w-4" /></div>
          <div>
            <div className="text-sm font-semibold">Open Enrollment Archive — read only</div>
            <div className="text-xs text-muted-foreground">Read-only annual open enrollment results.</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{py.label} · {enrolled} enrolled · {py.plans} plans · {py.period}</div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/employers/$employerId/plan-years" params={{ employerId }}>View Archive <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
      </CardContent>
    </Card>
  );
}

export function EnrollmentProgressPage() {
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { data: employer } = useEmployer(employerId);
  const { data: p } = useEnrollmentProgress(employerId, planYearId);
  const py = useActivePlanYear();
  if (!employer || !p) return <LoadingCard label="Loading enrollment progress…" />;
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="Enrollment Progress" subtitle={`${employer.name} · ${py?.label ?? ""} · ${p.status}`} actions={<SendRemindersControl employerId={employerId} planYearId={planYearId} />} />
      <KpiRow items={[
        { label: "Submitted", value: p.submitted, tone: "text-success" },
        { label: "In Progress", value: p.inProgress, tone: "text-info" },
        { label: "Not Started", value: p.notStarted, tone: "text-warning" },
        { label: "Not Invited", value: p.notInvited, tone: "text-warning" },
      ]} />
      {p.byCoverage.length === 0
        ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No enrollment activity yet — the enrollment window hasn't opened.</CardContent></Card>
        : <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Coverage Progress</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {p.byCoverage.map((c) => {
                const total = c.elected + c.waived + c.pending;
                const pct = total ? Math.round((c.elected / total) * 100) : 0;
                return (
                  <div key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.elected} elected · {c.waived} waived · {c.pending} pending</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </CardContent>
          </Card>}
    </div>
  );
}
