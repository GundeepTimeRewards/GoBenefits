import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, KpiRow, StatusPill, LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useEmployer, useAcaAleSummary, useCobraSummary } from "@/lib/api";
import { cobraEvents } from "@/lib/app-mock";

export function CompliancePage() {
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const { data: c } = useAcaAleSummary(employerId);
  if (!employer || !c) return <LoadingCard label="Loading ACA / ALE…" />;
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="ACA / ALE" subtitle={`${employer.name} · Applicable Large Employer tracking & 1095-C`} actions={<Button size="sm">Generate 1095-C</Button>} />
      <KpiRow items={[
        { label: "ALE Status", value: c.isAle ? "ALE" : "Not ALE", tone: c.isAle ? "text-info" : "" },
        { label: "1095-C Generated", value: c.form1095.generated },
        { label: "Filed", value: c.form1095.filed, tone: c.form1095.filed ? "text-success" : "text-warning" },
        { label: "Filing Status", value: c.form1095.status },
      ]} />
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">ALE — Current Snapshot</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-center">Full-Time</TableHead><TableHead className="text-center">FTE</TableHead>
              <TableHead className="text-center">Total</TableHead><TableHead>ALE?</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-center text-sm">{c.ft}</TableCell>
                <TableCell className="text-center text-sm">{c.fte}</TableCell>
                <TableCell className="text-center text-sm">{c.total}</TableCell>
                <TableCell><StatusPill label={c.isAle ? "ALE" : "Not ALE"} tone={c.isAle ? "info" : "muted"} /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function CobraPage() {
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const { data: c } = useCobraSummary(employerId);
  if (!employer || !c) return <LoadingCard label="Loading COBRA…" />;
  const rows = c.open > 0 ? cobraEvents.slice(0, c.open) : [];
  return (
    <div className="mx-auto max-w-[1150px] space-y-4">
      <PageHeader title="COBRA" subtitle={`${employer.name} · qualifying events, notices, elections, payments`} actions={<Button size="sm">New Event</Button>} />
      <KpiRow items={[
        { label: "Open Events", value: c.open, tone: c.open ? "text-warning" : "" },
        { label: "Notices Due", value: c.noticesDue, tone: c.noticesDue ? "text-warning" : "" },
        { label: "Elected", value: c.elected, tone: "text-success" },
        { label: "Total Employees", value: employer.employeeCount },
      ]} />
      {rows.length === 0
        ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No open COBRA events for this employer.</CardContent></Card>
        : <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Person</TableHead><TableHead>Qualifying Event</TableHead><TableHead>Event Date</TableHead>
                <TableHead>Notice Deadline</TableHead><TableHead>Status</TableHead><TableHead>Payment</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell><div className="font-medium">{e.person}</div><div className="text-xs text-muted-foreground">{e.relationship}</div></TableCell>
                    <TableCell className="text-sm">{e.event}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.date}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.notice}</TableCell>
                    <TableCell><StatusPill label={e.status} /></TableCell>
                    <TableCell className="text-sm">{e.payment}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>}
    </div>
  );
}
