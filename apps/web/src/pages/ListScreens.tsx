import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, KpiRow, StatusPill, LoadingCard, RoleNotAvailable } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useRole } from "@/lib/role-context";
import { useEmployer, usePayrollDeductions, useCarrierExports } from "@/lib/api";

function TableCard({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>{head}</TableRow></TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </CardContent></Card>
  );
}

// NOTE: the former BenefitPlansPage was retired 2026-07-01 — Plans & Rates
// (pages/PlansRatesPage.tsx) is the single canonical benefit-plan setup surface.

export function PayrollDeductionsPage() {
  const { role } = useRole();
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const { data: p } = usePayrollDeductions(employerId);
  if (role === "broker" || role === "agency_admin") {
    return <div className="mx-auto max-w-[900px] space-y-4"><PageHeader title="Payroll Deductions" /><RoleNotAvailable what="Payroll" detail="It's available to Employer Admins and payroll admins." /></div>;
  }
  if (!employer || !p) return <LoadingCard label="Loading payroll deductions…" />;
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="Payroll Deductions" subtitle={`${employer.name} · ${p.cycle}`} actions={<Button size="sm">Export to Payroll</Button>} />
      <KpiRow items={[
        { label: "Total EE / Period", value: `$${p.totalEe.toFixed(2)}` },
        { label: "Total ER / Period", value: `$${p.totalEr.toFixed(2)}` },
        { label: "Review Status", value: p.reviewStatus, tone: p.reviewStatus === "Approved" ? "text-success" : "text-warning" },
        { label: "Export Status", value: p.exportStatus.startsWith("Exported") ? "Exported" : "Pending", tone: p.exportStatus.startsWith("Exported") ? "text-success" : "text-warning" },
      ]} />
      {p.rows.length === 0
        ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No payroll deductions yet — plan setup is incomplete.</CardContent></Card>
        : <TableCard head={<>
            <TableHead>Employee</TableHead><TableHead>Plan</TableHead>
            <TableHead className="text-right">EE Cost</TableHead><TableHead className="text-right">ER Cost</TableHead><TableHead>Status</TableHead>
          </>}>
            {p.rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.employee}</TableCell>
                <TableCell className="text-sm">{d.plan}</TableCell>
                <TableCell className="text-right text-sm">${d.ee.toFixed(2)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">${d.er.toFixed(2)}</TableCell>
                <TableCell><StatusPill label={d.status} /></TableCell>
              </TableRow>
            ))}
          </TableCard>}
      {p.changes.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">What changed since last export?</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {p.changes.map((c, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border/60 p-3 text-sm">
                <StatusPill label={c.change} tone={c.change === "Term" ? "danger" : c.change === "New" ? "success" : "info"} />
                <span className="font-medium">{c.employee}</span>
                <span className="text-muted-foreground">{c.detail}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function CarrierExportsPage() {
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const { data: rows = [] } = useCarrierExports(employerId);
  if (!employer) return <LoadingCard label="Loading carrier exports…" />;
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="Carrier Exports" subtitle={`${employer.name} · enrollment files by carrier`} actions={<Button size="sm">Generate Files</Button>} />
      {rows.length === 0
        ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No carrier export profiles configured yet.</CardContent></Card>
        : <TableCard head={<>
            <TableHead>Carrier</TableHead><TableHead>Format</TableHead><TableHead className="text-center">Lines</TableHead>
            <TableHead className="text-center">Errors</TableHead><TableHead>Generated</TableHead><TableHead>Status</TableHead>
          </>}>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.carrier}</TableCell>
                <TableCell className="text-sm">{b.format}</TableCell>
                <TableCell className="text-center text-sm">{b.lines}</TableCell>
                <TableCell className="text-center text-sm">{b.errors > 0 ? <span className="text-destructive">{b.errors}</span> : "0"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{b.generated}</TableCell>
                <TableCell><StatusPill label={b.status} /></TableCell>
              </TableRow>
            ))}
          </TableCard>}
    </div>
  );
}

// NOTE: the old simple LifeEventsPage was retired 2026-07-01 — the HR/Admin Life
// Events work queue now lives in pages/LifeEventsPage.tsx.
