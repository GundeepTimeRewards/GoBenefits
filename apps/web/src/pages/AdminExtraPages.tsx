import { AlertTriangle, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusPill, LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useEmployer, useEmployers } from "@/lib/api";
import { dashboardAttention, upcomingRenewals } from "@/lib/app-mock";

// Employer: Tasks / Needs Attention (company-specific)
export function TasksPage() {
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  if (!employer) return <LoadingCard label="Loading tasks…" />;
  const tasks = [
    { title: "Review eligibility rules for new hires", due: "Today" },
    { title: "Approve dental plan rate update", due: "Tomorrow" },
    { title: "Send reminder to employees not started", due: "Nov 5" },
    { title: "Validate carrier file for Guardian", due: "Nov 8" },
  ];
  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Tasks / Needs Attention" subtitle={employer.name} />
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
        <CardHeader className="pb-3"><CardTitle className="text-base">My Tasks</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {tasks.map((t) => (
            <div key={t.title} className="flex items-center justify-between gap-3 text-sm">
              <span>{t.title}</span><span className="text-xs text-muted-foreground">Due {t.due}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// Broker/Agency: Renewals across the book of business
export function RenewalsPage() {
  const { data: employers = [] } = useEmployers();
  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Renewals" subtitle="Upcoming renewals across your book of business" />
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" /> Upcoming</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {upcomingRenewals.map((r) => (
            <div key={r.employer} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{r.employer}</span><span className="text-xs text-muted-foreground">{r.date} · {r.days} days</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Employer</TableHead><TableHead>Plan Year</TableHead><TableHead>Renewal</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {employers.map((e) => (
              <TableRow key={e.id}><TableCell className="font-medium">{e.name}</TableCell><TableCell className="text-sm text-muted-foreground">{e.currentPlanYearLabel}</TableCell><TableCell className="text-sm text-muted-foreground">{e.renewalMonth}</TableCell><TableCell><StatusPill label={e.setupStatus} /></TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// Platform: Users
export function UsersPage() {
  const users = [
    { name: "Alex Romero", role: "Broker", org: "Northwind Benefits Group", status: "Active" },
    { name: "Jamie Bennett", role: "Employer Admin", org: "Acme Manufacturing", status: "Active" },
    { name: "Support Team", role: "Benefits Support Admin", org: "GoBenefits", status: "Active" },
    { name: "Maria Patel", role: "Employee", org: "Acme Manufacturing", status: "Invited" },
  ];
  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Users" subtitle="Platform-wide identity directory" actions={<Button size="sm">Invite User</Button>} />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Organization</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.name}><TableCell className="font-medium">{u.name}</TableCell><TableCell className="text-sm">{u.role}</TableCell><TableCell className="text-sm text-muted-foreground">{u.org}</TableCell><TableCell><StatusPill label={u.status} /></TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// Platform: Migration (legacy CloudHCM -> V4)
export function MigrationPage() {
  const batches = [
    { employer: "Acme Manufacturing", source: "hcmuser1001", status: "Complete", records: "12,480" },
    { employer: "Harbor Logistics", source: "hcmuser1044", status: "In Progress", records: "5,210" },
    { employer: "Northstar Dental Group", source: "hcmuser1090", status: "Pending", records: "—" },
  ];
  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Migration" subtitle="Legacy CloudHCM → GoBenefits V4 (per-tenant)" actions={<Button size="sm">New Migration</Button>} />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Employer</TableHead><TableHead>Source DB</TableHead><TableHead>Records</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {batches.map((b) => (
              <TableRow key={b.source}><TableCell className="font-medium">{b.employer}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{b.source}</TableCell><TableCell className="text-sm">{b.records}</TableCell><TableCell><StatusPill label={b.status} /></TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
