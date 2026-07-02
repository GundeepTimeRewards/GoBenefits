import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, KpiRow, StatusPill, LoadingCard, RoleNotAvailable } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear } from "@/lib/plan-year-context";
import { useRole } from "@/lib/role-context";
import { useEmployer, usePayrollDeductions, useAcaAleSummary, useCobraSummary } from "@/lib/api";
import { cobraEvents } from "@/lib/app-mock";

// Roles that must NOT see payroll — payroll is an employer-level responsibility.
const PAYROLL_BLOCKED = new Set(["broker", "agency_admin"]);

function Soon({ what }: { what: string }) {
  return <Card><CardContent className="p-6 text-sm text-muted-foreground">{what}</CardContent></Card>;
}
function Tbl({ head, children }: { head: ReactNode; children: ReactNode }) {
  return <Card><CardContent className="p-0"><Table><TableHeader><TableRow>{head}</TableRow></TableHeader><TableBody>{children}</TableBody></Table></CardContent></Card>;
}


// NOTE: PayrollHubPage was retired 2026-07-01 — the full Payroll workspace (Payroll
// Data + Deduction Review + Changes + Export Batches + Settings) now lives in
// pages/PayrollPage.tsx.

// ── Compliance: ACA & COBRA hub ─────────────────────────────────────────────
export function AcaCobraHubPage() {
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const { data: c } = useAcaAleSummary(employerId);
  const { data: cobra } = useCobraSummary(employerId);
  const py = useActivePlanYear();
  if (!employer || !c || !cobra) return <LoadingCard label="Loading compliance…" />;
  const cobraRows = cobra.open > 0 ? cobraEvents.slice(0, cobra.open) : [];
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="ACA & COBRA" subtitle={`${employer.name} · ${py?.label ?? ""}`} />
      <Tabs defaultValue="aca">
        <TabsList>
          <TabsTrigger value="aca">ACA Dashboard</TabsTrigger>
          <TabsTrigger value="ale">ALE / FTE</TabsTrigger>
          <TabsTrigger value="f1095">1095-C</TabsTrigger>
          <TabsTrigger value="events">COBRA Events</TabsTrigger>
          <TabsTrigger value="notices">COBRA Notices</TabsTrigger>
          <TabsTrigger value="payments">COBRA Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="aca">
          <KpiRow items={[{ label: "ALE Status", value: c.isAle ? "ALE" : "Not ALE", tone: c.isAle ? "text-info" : "" }, { label: "1095-C Generated", value: c.form1095.generated }, { label: "Filed", value: c.form1095.filed }, { label: "Filing Status", value: c.form1095.status }]} />
        </TabsContent>
        <TabsContent value="ale">
          <Tbl head={<><TableHead className="text-center">Full-Time</TableHead><TableHead className="text-center">FTE</TableHead><TableHead className="text-center">Total</TableHead><TableHead>ALE?</TableHead></>}>
            <TableRow><TableCell className="text-center text-sm">{c.ft}</TableCell><TableCell className="text-center text-sm">{c.fte}</TableCell><TableCell className="text-center text-sm">{c.total}</TableCell><TableCell><StatusPill label={c.isAle ? "ALE" : "Not ALE"} tone={c.isAle ? "info" : "muted"} /></TableCell></TableRow>
          </Tbl>
        </TabsContent>
        <TabsContent value="f1095">
          <KpiRow items={[{ label: "Generated", value: c.form1095.generated }, { label: "Filed", value: c.form1095.filed }, { label: "Corrections", value: 0 }, { label: "Status", value: c.form1095.status }]} />
        </TabsContent>
        <TabsContent value="events">
          {cobraRows.length === 0 ? <Soon what="No open COBRA events for this employer." /> : (
            <Tbl head={<><TableHead>Person</TableHead><TableHead>Event</TableHead><TableHead>Notice Deadline</TableHead><TableHead>Status</TableHead></>}>
              {cobraRows.map((e) => (
                <TableRow key={e.id}><TableCell><div className="font-medium">{e.person}</div><div className="text-xs text-muted-foreground">{e.relationship}</div></TableCell><TableCell className="text-sm">{e.event}</TableCell><TableCell className="text-sm text-muted-foreground">{e.notice}</TableCell><TableCell><StatusPill label={e.status} /></TableCell></TableRow>
              ))}
            </Tbl>
          )}
        </TabsContent>
        <TabsContent value="notices"><Soon what={`${cobra.noticesDue} notice(s) due (notice generation coming soon).`} /></TabsContent>
        <TabsContent value="payments"><Soon what={`${cobra.elected} elected · payment tracking coming soon.`} /></TabsContent>
      </Tabs>
    </div>
  );
}
