import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, FileText, CalendarClock, Send, CheckCircle2, Plus, ClipboardList, Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusPill, LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear, useActivePlanYearId } from "@/lib/plan-year-context";
import { useRole } from "@/lib/role-context";
import { useEmployer, useLifeEventQueue } from "@/lib/api";
import type { LifeEventCase, LifeEventCaseStatus } from "@/lib/mock/db";

type Icon = ComponentType<{ className?: string }>;

function statusTone(s: LifeEventCaseStatus): "warning" | "info" | "success" | "muted" {
  if (s === "Election Window Open") return "success";
  if (s === "Needs Documents") return "info";
  if (s === "Carrier Pending" || s === "Needs Review") return "warning";
  return "muted"; // Completed
}
function rowAction(s: LifeEventCaseStatus): string {
  if (s === "Needs Review") return "Review";
  if (s === "Needs Documents") return "Request Documents";
  if (s === "Election Window Open") return "View";
  if (s === "Carrier Pending") return "Complete";
  return "View";
}

const TABS = [
  { key: "all", label: "All" },
  { key: "review", label: "Needs Review" },
  { key: "docs", label: "Needs Documents" },
  { key: "window", label: "Election Window Open" },
  { key: "carrier", label: "Carrier Pending" },
  { key: "completed", label: "Completed" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function matchTab(c: LifeEventCase, tab: TabKey): boolean {
  switch (tab) {
    case "review": return c.status === "Needs Review";
    case "docs": return c.status === "Needs Documents";
    case "window": return c.status === "Election Window Open";
    case "carrier": return c.status === "Carrier Pending";
    case "completed": return c.status === "Completed";
    default: return true;
  }
}

export function LifeEventsPage() {
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  const { data: queue } = useLifeEventQueue(employerId, planYearId);
  const { role } = useRole();
  const [tab, setTab] = useState<TabKey>("all");

  const cases = useMemo(() => (queue ? queue.cases.filter((c) => matchTab(c, tab)) : []), [queue, tab]);
  if (!employer || !py || !queue) return <LoadingCard label="Loading life events…" />;

  const brokerView = role === "broker" || role === "agency_admin";
  const nextStepText = (c: LifeEventCase) => (brokerView ? c.nextStep.replace(" & payroll", "") : c.nextStep);
  const c = queue.counts;
  const cards: { key: TabKey; label: string; value: number; tone: string; icon: Icon; iconClass: string }[] = [
    { key: "review", label: "Pending Review", value: c.pendingReview, tone: "text-warning", icon: AlertTriangle, iconClass: "bg-warning/15 text-warning" },
    { key: "docs", label: "Needs Documents", value: c.needsDocuments, tone: "text-info", icon: FileText, iconClass: "bg-info/10 text-info" },
    { key: "window", label: "Election Windows Open", value: c.electionWindowsOpen, tone: "text-success", icon: CalendarClock, iconClass: "bg-success/10 text-success" },
    { key: "carrier", label: "Carrier Pending", value: c.carrierPending, tone: "text-warning", icon: Send, iconClass: "bg-warning/15 text-warning" },
    { key: "completed", label: "Completed This Month", value: c.completedThisMonth, tone: "text-success", icon: CheckCircle2, iconClass: "bg-success/10 text-success" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        title="Life Events"
        subtitle="Work qualifying life event cases — review requests, request documents, open election windows, and complete coverage changes."
        actions={queue.readOnly ? undefined : (
          <>
            <Button variant="outline" size="sm" onClick={() => setTab("review")}><ClipboardList className="mr-1.5 h-4 w-4" />Review Pending Requests</Button>
            <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Add Life Event</Button>
            <Button variant="ghost" size="sm">More</Button>
          </>
        )}
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{employer.name} · {py.label}</span>
        {queue.readOnly && <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Read-only history</Badge>}
      </div>

      {/* Summary cards (clickable → filter) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((k) => (
          <button key={k.key} type="button" onClick={() => setTab(tab === k.key ? "all" : k.key)}
            className={`rounded-lg border p-3 text-left transition hover:bg-muted/40 ${tab === k.key ? "border-primary bg-primary/5" : "bg-card"}`}>
            <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md ${k.iconClass}`}><k.icon className="h-3.5 w-3.5" /></div>
            <div className={`text-xl font-semibold tabular-nums ${k.value === 0 ? "text-muted-foreground" : k.tone}`}>{k.value}</div>
            <div className="text-[11px] text-muted-foreground">{k.label}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Work queue */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${tab === t.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>{t.label}</button>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Life Event Cases</CardTitle>
                <span className="text-xs text-muted-foreground">{cases.length} of {queue.cases.length} shown</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Life Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Election Window</TableHead>
                    <TableHead>Next Step</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No life event cases match this filter.</TableCell></TableRow>
                  )}
                  {cases.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employee}</TableCell>
                      <TableCell className="text-sm">{r.eventType}</TableCell>
                      <TableCell><StatusPill label={r.status} tone={statusTone(r.status)} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.documents}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.electionWindow}</TableCell>
                      <TableCell className="text-sm">{nextStepText(r)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-8">{queue.readOnly ? "View" : rowAction(r.status)}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Task card */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Heart className="h-4 w-4 text-primary" /> Life Event Tasks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {queue.tasks.length === 0 && <p className="text-sm text-muted-foreground">No open life event tasks.</p>}
            {queue.tasks.map((t) => (
              <button key={t.key} type="button" className="flex w-full items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-left hover:bg-muted/40">
                <span className="min-w-0 text-sm">{t.label}</span>
                <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning/10 text-warning-foreground">{t.count}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
