import { useState } from "react";
import { Wallet, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, LoadingCard, RoleNotAvailable } from "@/components/common";
import { useRole } from "@/lib/role-context";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear, useActivePlanYearId } from "@/lib/plan-year-context";
import { useEmployer, useDeductionsWorkspace } from "@/lib/api";
import { useExportReadyDeductions, useReconcileBatch, useMapDeductionCode } from "@/lib/api/mutationHooks";
import type { DeductionReviewStatus, ExportBatchStatus } from "@/lib/mock/db";

// Deductions is the recurring per-pay-period workflow. Employer-level only.
const PAYROLL_BLOCKED = new Set(["broker", "agency_admin"]);

const TABS = [
  { key: "review", label: "Deduction Review" },
  { key: "changes", label: "Changes Since Last Export" },
  { key: "batches", label: "Export Batches" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const dedTone: Record<DeductionReviewStatus, "success" | "warning" | "danger" | "info" | "muted"> = {
  Ready: "success", "Needs Review": "warning", "Missing Payroll Code": "danger", "Amount Changed": "info", "Pending Export": "warning", Exported: "muted",
};
const batchTone: Record<ExportBatchStatus, "muted" | "info" | "success" | "danger"> = {
  Draft: "muted", Ready: "info", Exported: "success", Failed: "danger", Reconciled: "success",
};
function dedAction(status: DeductionReviewStatus): string {
  switch (status) {
    case "Missing Payroll Code": return "Map Code";
    case "Needs Review": return "Review";
    case "Amount Changed": return "View Change";
    case "Pending Export": return "Approve";
    case "Ready": return "Export";
    case "Exported": return "View";
    default: return "Review";
  }
}
function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className={`text-lg font-semibold tabular-nums ${tone ?? "text-foreground"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function DeductionsPage() {
  const { role } = useRole();
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  const { data: ws } = useDeductionsWorkspace(employerId, planYearId);
  const [tab, setTab] = useState<TabKey>("review");
  const exportReady = useExportReadyDeductions(employerId);
  const reconcile = useReconcileBatch(employerId);
  const exportStatus = exportReady.data?.live
    ? (exportReady.data.data as { exportReadyDeductions?: { status?: string } })?.exportReadyDeductions?.status
    : null;

  if (PAYROLL_BLOCKED.has(role)) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4">
        <h1 className="text-[1.55rem] font-semibold tracking-tight">Deductions</h1>
        <RoleNotAvailable what="Deductions" detail="Payroll deductions are employer-level only — available to Employer Admins and payroll admins, not agencies or brokers." />
      </div>
    );
  }
  if (!employer || !py || !ws) return <LoadingCard label="Loading deductions…" />;
  const { readOnly } = ws;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h1 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">Deductions</h1>
            {readOnly && <Badge variant="outline" className="border-border bg-muted text-muted-foreground">Read-only history</Badge>}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">Review benefit deductions before payroll, see what changed since the last export, and export ready deductions for the selected plan year.</p>
          <p className="mt-1 text-xs text-muted-foreground">{employer.name} · {py.label}</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {exportStatus && <span className="text-xs text-success">{exportStatus}</span>}
            {exportReady.error && <span className="text-xs text-destructive">{exportReady.error.message}</span>}
            <Button size="sm" disabled={exportReady.isPending} onClick={() => exportReady.mutate({ planYearId })}>
              {exportReady.isPending ? "Exporting…" : "Export Ready Deductions"}
            </Button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>

      {/* Deduction Review */}
      {tab === "review" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="Ready to Export" value={ws.deductionSummary.readyToExport} tone="text-success" />
            <Stat label="Needs Review" value={ws.deductionSummary.needsReview} tone={ws.deductionSummary.needsReview ? "text-warning" : "text-foreground"} />
            <Stat label="Missing Payroll Code" value={ws.deductionSummary.missingCode} tone={ws.deductionSummary.missingCode ? "text-destructive" : "text-foreground"} />
            <Stat label="Amount Changed" value={ws.deductionSummary.amountChanged} tone="text-info" />
            <Stat label="Effective This Pay Period" value={ws.deductionSummary.effectiveThisPeriod} />
            <Stat label="Total EE / Pay" value={ws.deductionSummary.totalEe} tone="text-foreground" />
            <Stat label="Total ER / Pay" value={ws.deductionSummary.totalEr} tone="text-muted-foreground" />
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><DollarSign className="h-4 w-4 text-primary" /> Deduction Review</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Benefit deductions from elections, rates, and contribution rules — reviewed before each payroll export.</p>
              </div>
              {!readOnly && (
                <Button size="sm" disabled={exportReady.isPending} onClick={() => exportReady.mutate({ planYearId })}>
                  {exportReady.isPending ? "Exporting…" : "Export Ready Deductions"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Employee</TableHead><TableHead>Plan</TableHead><TableHead>Coverage Tier</TableHead><TableHead>Effective</TableHead>
                  <TableHead>Payroll Group</TableHead><TableHead>Deduction Code</TableHead><TableHead className="text-right">EE / Pay</TableHead><TableHead className="text-right">ER / Pay</TableHead>
                  <TableHead>Change Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ws.deductionReview.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.employee}</TableCell>
                      <TableCell className="text-sm">{d.plan}</TableCell>
                      <TableCell className="text-sm">{d.tier}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.effective}</TableCell>
                      <TableCell className="text-sm">{d.payrollGroup}</TableCell>
                      <TableCell className="font-mono text-xs">{d.code || <span className="text-destructive">Unassigned</span>}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{d.ee}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{d.er}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.changeType}</TableCell>
                      <TableCell><StatusPill label={d.status} tone={dedTone[d.status]} /></TableCell>
                      <TableCell className="text-right">
                        {!readOnly && !d.code ? (
                          <MapCodeInline employerId={employerId} deductionId={d.id} />
                        ) : (
                          <Button size="sm" variant="outline" className="h-8">{dedAction(d.status)}</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Changes Since Last Export */}
      {tab === "changes" && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Changes Since Last Export</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">New, changed, and terminated deductions since the last payroll export.</p></CardHeader>
          <CardContent className="p-0">
            {ws.deductionChanges.length === 0
              ? <div className="p-6 text-sm text-muted-foreground">No changes since the last export.</div>
              : <Table>
                  <TableHeader><TableRow>
                    <TableHead>Employee</TableHead><TableHead>Change Type</TableHead><TableHead>Previous</TableHead><TableHead>New</TableHead><TableHead>Effective Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {ws.deductionChanges.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.employee}</TableCell>
                        <TableCell className="text-sm">{c.changeType}</TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">{c.prev}</TableCell>
                        <TableCell className="text-sm tabular-nums">{c.next}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.effective}</TableCell>
                        <TableCell><StatusPill label={c.status} /></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="outline" className="h-8">Review</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>}
          </CardContent>
        </Card>
      )}

      {/* Export Batches */}
      {tab === "batches" && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Payroll Export Batches</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Deduction export batches sent to the payroll provider.</p></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Batch Date</TableHead><TableHead>Pay Period</TableHead><TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Total EE</TableHead><TableHead className="text-right">Total ER</TableHead><TableHead>Status</TableHead><TableHead>Export File</TableHead><TableHead>Errors / Warnings</TableHead><TableHead className="text-right">Action</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ws.exportBatches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm">{b.batchDate}</TableCell>
                    <TableCell className="font-medium">{b.payPeriod}</TableCell>
                    <TableCell className="text-right text-sm">{b.employees || "—"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{b.totalEe}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{b.totalEr}</TableCell>
                    <TableCell><StatusPill label={b.status} tone={batchTone[b.status]} /></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{b.file}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.issues}</TableCell>
                    <TableCell className="text-right">
                      {!readOnly && b.status === "Exported" ? (
                        <Button size="sm" variant="ghost" className="h-8 text-primary" disabled={reconcile.isPending}
                          onClick={() => reconcile.mutate({ batchId: b.id })}>
                          {reconcile.isPending ? "Reconciling…" : "Reconcile"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-8 text-primary">View</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// Inline payroll-code assignment for rows missing one (Phase E-2c). Mock mode no-ops.
function MapCodeInline({ employerId, deductionId }: { employerId: string; deductionId: string }) {
  const [code, setCode] = useState("");
  const m = useMapDeductionCode(employerId);
  return (
    <span className="inline-flex items-center gap-1.5">
      {m.error && <span className="text-[11px] text-destructive">{m.error.message}</span>}
      <input
        className="h-8 w-24 rounded-md border border-input bg-background px-2 font-mono text-xs"
        placeholder="Code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button size="sm" variant="outline" className="h-8" disabled={m.isPending || !code.trim()}
        onClick={() => m.mutate({ deductionId, code: code.trim() })}>
        {m.isPending ? "Saving…" : "Map Code"}
      </Button>
    </span>
  );
}
