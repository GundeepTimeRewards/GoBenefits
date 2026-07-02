import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Heart, Users, Ban, DollarSign, ClipboardCheck, X, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusPill, LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear, useActivePlanYearId } from "@/lib/plan-year-context";
import { useEmployer, useElectionReview } from "@/lib/api";
import type { ElectionRow, ElectionStatus } from "@/lib/mock/db";
import { waivers } from "@/lib/app-mock";

type Icon = ComponentType<{ className?: string }>;

function statusTone(s: ElectionStatus): "warning" | "success" | "info" {
  if (s === "Approved") return "success";
  if (s === "Ready to Approve") return "info";
  return "warning";
}

const TABS = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs Review" },
  { key: "ready", label: "Ready to Approve" },
  { key: "eoi", label: "EOI Required" },
  { key: "dependent", label: "Dependent Issues" },
  { key: "waiver", label: "Waivers" },
  { key: "cost", label: "Cost Issues" },
  { key: "approved", label: "Approved" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function matchTab(r: ElectionRow, tab: TabKey): boolean {
  switch (tab) {
    case "needs": return r.status === "Needs Review";
    case "ready": return r.status === "Ready to Approve";
    case "eoi": return r.issueType === "eoi";
    case "dependent": return r.issueType === "dependent";
    case "waiver": return r.issueType === "waiver";
    case "cost": return r.issueType === "cost";
    case "approved": return r.status === "Approved";
    default: return true;
  }
}

export function ElectionsReviewPage() {
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  const { data: review } = useElectionReview(employerId, planYearId);
  const [tab, setTab] = useState<TabKey>("all");
  const [selected, setSelected] = useState<ElectionRow | null>(null);

  const rows = useMemo(() => (review ? review.rows.filter((r) => matchTab(r, tab)) : []), [review, tab]);

  if (!employer || !py || !review) return <LoadingCard label="Loading elections…" />;

  const c = review.counts;
  const cards: { key: TabKey; label: string; value: number; tone: string; icon: Icon; iconClass: string }[] = [
    { key: "needs", label: "Needs Review", value: c.needsReview, tone: "text-warning", icon: AlertTriangle, iconClass: "bg-warning/15 text-warning" },
    { key: "ready", label: "Ready to Approve", value: c.readyToApprove, tone: "text-success", icon: CheckCircle2, iconClass: "bg-success/10 text-success" },
    { key: "eoi", label: "EOI Required", value: c.eoi, tone: "text-warning", icon: Heart, iconClass: "bg-warning/15 text-warning" },
    { key: "dependent", label: "Dependent Issues", value: c.dependent, tone: "text-warning", icon: Users, iconClass: "bg-warning/15 text-warning" },
    { key: "waiver", label: "Waivers", value: c.waiver, tone: "text-info", icon: Ban, iconClass: "bg-info/10 text-info" },
    { key: "cost", label: "Cost / Deduction", value: c.cost, tone: "text-destructive", icon: DollarSign, iconClass: "bg-destructive/10 text-destructive" },
    { key: "approved", label: "Approved", value: c.approved, tone: "text-success", icon: ClipboardCheck, iconClass: "bg-success/10 text-success" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        title="Elections Review"
        subtitle="Review submitted elections before they become active coverage, payroll deductions, and carrier export records."
        actions={review.readOnly ? undefined : (
          <>
            <Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />Export Review List</Button>
            <Button size="sm"><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve All Ready</Button>
            <Button variant="ghost" size="sm">More</Button>
          </>
        )}
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{employer.name} · {py.label}</span>
        {review.readOnly && <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Read-only approved history</Badge>}
      </div>

      {/* Summary cards (clickable → filter tab) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map((k) => (
          <button key={k.key} type="button" onClick={() => setTab(tab === k.key ? "all" : k.key)}
            className={`rounded-lg border p-3 text-left transition hover:bg-muted/40 ${tab === k.key ? "border-primary bg-primary/5" : "bg-card"}`}>
            <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md ${k.iconClass}`}><k.icon className="h-3.5 w-3.5" /></div>
            <div className={`text-xl font-semibold tabular-nums ${k.value === 0 ? "text-muted-foreground" : k.tone}`}>{k.value}</div>
            <div className="text-[11px] text-muted-foreground">{k.label}</div>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${tab === t.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>{t.label}</button>
        ))}
      </div>

      {/* Review table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Submitted Elections</CardTitle>
            <span className="text-xs text-muted-foreground">{rows.length} of {review.rows.length} shown</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Election Type</TableHead>
                <TableHead>Selected Plans</TableHead>
                <TableHead>Coverage Tier</TableHead>
                <TableHead className="text-center">Dependents</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead className="text-right">EE Cost / Pay</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  {review.rows.length === 0 ? "No submitted elections yet — enrollment hasn't opened." : "No elections match this filter."}
                </TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell className="font-medium">{r.employee}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.electionType}</TableCell>
                  <TableCell className="text-sm">{r.plans}</TableCell>
                  <TableCell className="text-sm">{r.tier}</TableCell>
                  <TableCell className="text-center text-sm">{r.dependents}</TableCell>
                  <TableCell className="text-sm">
                    {r.issueType === "none"
                      ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" />No issues</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" />{r.issue}</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">${r.eeCost.toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.submitted}</TableCell>
                  <TableCell><StatusPill label={r.status} tone={statusTone(r.status)} /></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant={r.action === "Approve" ? "default" : "outline"}
                      className={`h-8 ${r.action === "Send Back" ? "border-destructive/40 text-destructive" : ""}`}
                      onClick={() => setSelected(r)}>{r.action}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Election review approves submitted <span className="font-medium">intent</span>. Active <span className="font-medium">coverage</span> is created separately based on approval and effective date.
      </p>

      {selected && <ElectionDetailDrawer row={selected} readOnly={review.readOnly} onClose={() => setSelected(null)} />}
    </div>
  );
}

// Lightweight right-side drawer placeholder (mock — no primitive dependency).
function ElectionDetailDrawer({ row, readOnly, onClose }: { row: ElectionRow; readOnly: boolean; onClose: () => void }) {
  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-medium">{value}</div></div>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b p-5">
          <div>
            <div className="text-lg font-semibold">{row.employee}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{row.electionType} · submitted {row.submitted}</div>
          </div>
          <StatusPill label={row.status} tone={statusTone(row.status)} />
        </div>
        <div className="flex-1 space-y-5 p-5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Coverage Tier" value={row.tier} />
            <Field label="Dependents" value={row.dependents} />
            <Field label="EE Cost / Pay" value={`$${row.eeCost.toFixed(2)}`} />
            <Field label="Election Type" value={row.electionType} />
          </div>
          <div><div className="text-xs font-medium text-muted-foreground">Submitted Plans</div><div className="mt-1">{row.plans}</div></div>
          {row.issueType !== "none" && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-warning" />
              <span><span className="font-medium text-warning-foreground">{row.issue}</span> — resolve before approving this election.</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>Dependents attached: <span className="text-foreground">{row.dependents}</span></div>
            <div>Waiver: <span className="text-foreground">{row.issueType === "waiver" ? "Pending review" : "—"}</span></div>
            <div>EOI: <span className="text-foreground">{row.issueType === "eoi" ? "Required" : "Not required"}</span></div>
            <div>Documents: <span className="text-foreground">{row.issueType === "dependent" ? "Verification pending" : "Complete"}</span></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cost summary</div>
            <div className="mt-1 rounded-md border p-3 text-sm"><span className="font-medium tabular-nums">${row.eeCost.toFixed(2)}</span> employee / pay period</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Admin notes</div>
            <textarea disabled={readOnly} placeholder="Add a note for this review (mock)…" className="h-20 w-full resize-none rounded-md border bg-background p-2 text-sm" />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t p-4">
          <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1.5 h-3.5 w-3.5" />Close</Button>
          {!readOnly && row.status !== "Approved" && (
            <>
              {row.issueType === "eoi" && <Button variant="outline" size="sm">Request EOI</Button>}
              {row.issueType === "dependent" && <Button variant="outline" size="sm">Request Documents</Button>}
              {row.issueType === "waiver" && <Button variant="outline" size="sm">Review Waiver</Button>}
              {row.issueType !== "none" && <Button variant="outline" size="sm" className="border-destructive/40 text-destructive">Send Back</Button>}
              <Button size="sm"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WaiverReviewPage() {
  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Waiver Review" subtitle="Coverage waivers submitted by employees" />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead>Line</TableHead><TableHead>Reason</TableHead><TableHead>Other Coverage</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {waivers.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">{w.employee}</TableCell>
                <TableCell className="text-sm">{w.line}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{w.reason}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{w.other}</TableCell>
                <TableCell><StatusPill label={w.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
