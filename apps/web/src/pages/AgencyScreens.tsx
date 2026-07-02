import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, Users, ArrowRight, AlertTriangle, CalendarClock, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { PageHeader, KpiRow, StatusPill, LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useRole } from "@/lib/role-context";
import { getPersonaNav } from "@/lib/persona";
import { useEmployers, useEmployerOverview } from "@/lib/api";
import { agencies, agencyBrokers, brokerKpis, bookNeedsAttention, upcomingRenewals } from "@/lib/app-mock";

export function AgenciesPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="Agencies" subtitle="Platform view — all agencies" actions={<Button size="sm">Add Agency</Button>} />
      <Table>
        <TableHeader><TableRow>
          <TableHead>Agency</TableHead><TableHead className="text-center">Brokers</TableHead>
          <TableHead className="text-center">Employers</TableHead><TableHead className="text-center">Employees</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {agencies.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell className="text-center text-sm">{a.brokers}</TableCell>
              <TableCell className="text-center text-sm">{a.employers}</TableCell>
              <TableCell className="text-center text-sm">{a.employees.toLocaleString()}</TableCell>
              <TableCell><StatusPill label={a.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AgencyOverviewPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="Northwind Benefits Group" subtitle="Agency overview" />
      <KpiRow items={[{ label: "Brokers", value: 6 }, { label: "Employers", value: 24 }, { label: "Employees", value: "3,184" }, { label: "Open Enrollments", value: 7, tone: "text-info" }]} />
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Brokers / Producers</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Broker</TableHead><TableHead className="text-center">Employers</TableHead><TableHead className="text-center">Employees</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {agencyBrokers.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-center text-sm">{b.employers}</TableCell>
                  <TableCell className="text-center text-sm">{b.employees.toLocaleString()}</TableCell>
                  <TableCell><StatusPill label={b.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function BrokersPage() {
  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Brokers / Producers" subtitle="Producers in your agency" actions={<Button size="sm">Add Broker</Button>} />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Broker</TableHead><TableHead className="text-center">Employers</TableHead><TableHead className="text-center">Employees</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {agencyBrokers.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="text-center text-sm">{b.employers}</TableCell>
                <TableCell className="text-center text-sm">{b.employees.toLocaleString()}</TableCell>
                <TableCell><StatusPill label={b.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

function EmployerTable({ title }: { title: string }) {
  const { data: rows = [] } = useEmployers();
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employer</TableHead><TableHead>Plan Year</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-center">Employees</TableHead><TableHead>Completion</TableHead><TableHead>Renewal</TableHead><TableHead className="text-center">Issues</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.currentPlanYearLabel}</TableCell>
                <TableCell><StatusPill label={e.setupStatus} /></TableCell>
                <TableCell className="text-center text-sm">{e.employeeCount}</TableCell>
                <TableCell className="w-40"><div className="flex items-center gap-2"><Progress value={e.completion} className="h-2" /><span className="text-xs text-muted-foreground">{e.completion}%</span></div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.renewalMonth}</TableCell>
                <TableCell className="text-center">{e.issues > 0 ? <span className="text-warning">{e.issues}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                <TableCell>
                  <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                    <Link to="/employers/$employerId" params={{ employerId: e.id }}><ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// BROKER DASHBOARD — a personal worklist across the broker's assigned employers:
// KPIs, cross-client needs-attention, upcoming renewals, then the worklist table.
export function BookOfBusinessPage() {
  const { role } = useRole();
  const book = getPersonaNav(role).book;
  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <PageHeader title={book.title} subtitle={book.subtitle} />
      <KpiRow items={brokerKpis} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-warning" /> {book.needsAttentionTitle}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {bookNeedsAttention.map((n) => (
              <div key={n.employer} className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3">
                <div><div className="text-sm font-medium">{n.employer}</div><div className="text-xs text-muted-foreground">{n.detail}</div></div>
                <StatusPill label={n.tone === "danger" ? "High" : "Review"} tone={n.tone} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" /> Upcoming Renewals</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {upcomingRenewals.map((r) => (
              <div key={r.employer} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{r.employer}</span>
                <span className="text-xs text-muted-foreground">{r.date} · {r.days} days</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <EmployerTable title={book.worklistTitle} />
    </div>
  );
}

// DIRECTORY — a plain searchable list of employers you can access + add new.
export function EmployersListPage() {
  const [q, setQ] = useState("");
  const { data: all = [] } = useEmployers();
  const rows = all.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="Employers" subtitle="Directory of all employers you can access" actions={<Button size="sm">Add Employer</Button>} />
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search employers" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employer</TableHead><TableHead>Plan Year</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-center">Employees</TableHead><TableHead>Renewal</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.currentPlanYearLabel}</TableCell>
                <TableCell><StatusPill label={e.setupStatus} /></TableCell>
                <TableCell className="text-center text-sm">{e.employeeCount}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.renewalMonth}</TableCell>
                <TableCell>
                  <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                    <Link to="/employers/$employerId" params={{ employerId: e.id }}><ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

export function EmployerOverviewPage() {
  const { data: e } = useEmployerOverview(useActiveEmployerId());
  if (!e) return <LoadingCard label="Loading employer…" />;
  const links = [
    { to: "/employers/$employerId/setup", label: "Employer Setup", icon: Building2 },
    { to: "/employers/$employerId/census", label: "Employee Census", icon: Users },
    { to: "/employers/$employerId/plan-years", label: "Plan Years", icon: ArrowRight },
  ] as const;
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title={e.name} subtitle={`${e.industry} · ${e.currentPlanYearLabel} · ${e.setupStatus}`} actions={<Button asChild size="sm"><Link to="/employers/$employerId/plan-years/$planYearId/setup" params={{ employerId: e.id, planYearId: e.currentPlanYearId }}>Continue Setup</Link></Button>} />
      <KpiRow items={[{ label: "Employees", value: e.employeeCount }, { label: "Completion", value: `${e.completion}%` }, { label: "Open Issues", value: e.issues, tone: e.issues ? "text-warning" : "" }, { label: "Renewal", value: e.renewalMonth }]} />
      <div className="grid gap-3 md:grid-cols-3">
        {links.map((l) => (
          <Card key={l.label}>
            <CardContent className="p-4">
              <Link to={l.to} params={{ employerId: e.id }} className="flex items-center justify-between text-sm font-medium text-primary">
                <span className="flex items-center gap-2"><l.icon className="h-4 w-4" />{l.label}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
