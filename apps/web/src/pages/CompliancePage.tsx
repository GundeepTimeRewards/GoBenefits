import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import {
  FileCheck2, AlertTriangle, ShieldCheck, Send, CheckCircle2, Ban, ScrollText, Calculator,
  Search, ChevronRight, Users, Bell, CalendarDays, FileBarChart, History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, LoadingCard } from "@/components/common";
import { useRole } from "@/lib/role-context";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear } from "@/lib/plan-year-context";
import { useEmployer } from "@/lib/api";

type Icon = ComponentType<{ className?: string }>;
type Tone = "success" | "warning" | "info" | "danger" | "muted" | "teal";

// Representative compliance mock (mirrors the Lovable design). Employer-level.
const OVERVIEW: { label: string; value: string; sub: string; tone: string; icon: Icon; iconCls: string }[] = [
  { label: "ACA Readiness", value: "82%", sub: "421 of 510 forms ready", tone: "text-success", icon: ShieldCheck, iconCls: "bg-success/10 text-success" },
  { label: "ALE / FTE Status", value: "Likely ALE", sub: "Avg 487.8 / month", tone: "text-info", icon: Users, iconCls: "bg-info/10 text-info" },
  { label: "1095-C Forms", value: "421 / 510", sub: "38 blocked · 17 issues", tone: "text-warning", icon: FileCheck2, iconCls: "bg-warning/15 text-warning" },
  { label: "COBRA Pending", value: "4", sub: "2 notices overdue", tone: "text-warning", icon: FileBarChart, iconCls: "bg-warning/15 text-warning" },
  { label: "Notices Due", value: "5", sub: "2 overdue", tone: "text-warning", icon: Bell, iconCls: "bg-warning/15 text-warning" },
];
const NEEDS_ATTENTION: { label: string; tone: Tone; payroll?: boolean }[] = [
  { label: "Missing payroll hours for ACA lookback (9 employees)", tone: "danger", payroll: true },
  { label: "Employees missing coverage offer data (7)", tone: "warning" },
  { label: "1095-C records needing review (17)", tone: "warning" },
  { label: "COBRA qualifying events pending notice (4)", tone: "warning" },
  { label: "Notices due soon (5)", tone: "info" },
];
const DEADLINES: { date: string; item: string; category: string; status: string }[] = [
  { date: "Nov 10, 2026", item: "COBRA election notice — Luis Garcia", category: "COBRA", status: "Overdue" },
  { date: "Nov 22, 2026", item: "COBRA election notice — Diane Bell", category: "COBRA", status: "Due" },
  { date: "Dec 15, 2026", item: "Final payroll import for ACA measurement", category: "ACA", status: "Upcoming" },
  { date: "Jan 31, 2027", item: "Distribute 1095-C employee copies", category: "1095-C", status: "Upcoming" },
  { date: "Mar 31, 2027", item: "IRS electronic filing deadline", category: "Filing", status: "Upcoming" },
];
const calTone: Record<string, Tone> = { Overdue: "danger", Due: "warning", Upcoming: "info", Done: "success" };

const READINESS_ISSUES: { label: string; count: number; tone: Tone }[] = [
  { label: "Missing SSN", count: 6, tone: "danger" },
  { label: "Missing date of birth", count: 2, tone: "danger" },
  { label: "Missing offer of coverage code", count: 7, tone: "warning" },
  { label: "Missing safe harbor code", count: 4, tone: "warning" },
  { label: "Affordability issue", count: 6, tone: "warning" },
  { label: "Payroll hours missing (variable-hour)", count: 9, tone: "info" },
];
type FormStatus = "Ready" | "Needs Review" | "Missing Data" | "Corrected";
const FORMS: { employee: string; aca: string; line14: string; line16: string; months: string; status: FormStatus; issues: string }[] = [
  { employee: "Kevin Brown", aca: "Variable Hour", line14: "1H", line16: "2A", months: "0", status: "Missing Data", issues: "Missing payroll hours, SSN" },
  { employee: "Chris Wong", aca: "Full-Time", line14: "Missing", line16: "Missing", months: "12", status: "Needs Review", issues: "Missing offer/safe harbor codes" },
  { employee: "Dana Kim", aca: "Variable Hour", line14: "1H / 1E", line16: "2B", months: "6", status: "Needs Review", issues: "Missing payroll hours" },
  { employee: "Jordan Lee", aca: "Full-Time", line14: "1E", line16: "2C", months: "12", status: "Ready", issues: "No issues" },
  { employee: "Maria Patel", aca: "Full-Time", line14: "1E", line16: "2C", months: "12", status: "Ready", issues: "No issues" },
  { employee: "Sarah Mitchell", aca: "Full-Time", line14: "1E", line16: "2C", months: "12", status: "Corrected", issues: "Address corrected" },
];
const formTone: Record<FormStatus, Tone> = { Ready: "success", "Needs Review": "warning", "Missing Data": "danger", Corrected: "teal" };

type MStatus = "Ready" | "Missing Data";
const ALE_MONTHS: { month: string; ft: number; ptHours: string; fte: string; total: string; status: MStatus }[] = [
  { month: "Jan 2026", ft: 438, ptHours: "5,880", fte: "49.0", total: "487.0", status: "Ready" },
  { month: "Feb 2026", ft: 440, ptHours: "5,760", fte: "48.0", total: "488.0", status: "Ready" },
  { month: "Mar 2026", ft: 442, ptHours: "6,120", fte: "51.0", total: "493.0", status: "Ready" },
  { month: "Apr 2026", ft: 439, ptHours: "5,940", fte: "49.5", total: "488.5", status: "Ready" },
  { month: "May 2026", ft: 436, ptHours: "5,640", fte: "47.0", total: "483.0", status: "Ready" },
  { month: "Jun 2026", ft: 441, ptHours: "Missing", fte: "Missing", total: "Missing", status: "Missing Data" },
  { month: "Jul 2026", ft: 445, ptHours: "6,360", fte: "53.0", total: "498.0", status: "Ready" },
  { month: "Aug 2026", ft: 443, ptHours: "6,240", fte: "52.0", total: "495.0", status: "Ready" },
  { month: "Sep 2026", ft: 437, ptHours: "5,520", fte: "46.0", total: "483.0", status: "Ready" },
  { month: "Oct 2026", ft: 434, ptHours: "5,400", fte: "45.0", total: "479.0", status: "Ready" },
  { month: "Nov 2026", ft: 432, ptHours: "Missing", fte: "Missing", total: "Missing", status: "Missing Data" },
  { month: "Dec 2026", ft: 435, ptHours: "5,760", fte: "48.0", total: "483.0", status: "Ready" },
];
const AFFORD_ROWS: { e: string; basis: string; wage: string; premium: string; result: string; code: string; status: string }[] = [
  { e: "Jordan Lee", basis: "Rate of Pay", wage: "$3,640.00", premium: "$122.40", result: "Affordable", code: "2H", status: "Ready" },
  { e: "Maria Patel", basis: "W-2", wage: "$58,200.00", premium: "$98.15", result: "Affordable", code: "2F", status: "Ready" },
  { e: "Chris Wong", basis: "Missing", wage: "Missing", premium: "Missing", result: "Needs Review", code: "Missing", status: "Issue" },
  { e: "Dana Kim", basis: "Variable Hour", wage: "$0.00", premium: "—", result: "Not Offered Full Year", code: "2B", status: "Review" },
];
const resultTone: Record<string, Tone> = { Affordable: "success", "Needs Review": "warning", "Not Offered Full Year": "muted" };
const affordStatusTone: Record<string, Tone> = { Ready: "success", Issue: "danger", Review: "warning" };

const COBRA_EVENTS: { person: string; relationship: string; event: string; notice: string; cobra: string; payment: string; tpa: string; next: string }[] = [
  { person: "Luis Garcia", relationship: "Employee", event: "Termination", notice: "Overdue", cobra: "Open", payment: "—", tpa: "Pending", next: "Review overdue notice" },
  { person: "Diane Bell", relationship: "Spouse", event: "Divorce", notice: "Due", cobra: "Open", payment: "—", tpa: "Pending", next: "Generate notice" },
  { person: "Owen Bell", relationship: "Dependent", event: "Aged Out", notice: "Sent", cobra: "Elected", payment: "Current", tpa: "Sent", next: "No action needed" },
  { person: "Wade Foster", relationship: "Employee", event: "Reduction in Hours", notice: "Sent", cobra: "Elected", payment: "Past Due", tpa: "Sent", next: "Review payment" },
  { person: "Mia Bell", relationship: "Dependent", event: "Aged Out", notice: "Draft", cobra: "Open", payment: "—", tpa: "Needs", next: "Resolve address" },
];
const COBRA_BENEFICIARIES: { name: string; relationship: string; event: string; coverage: string; status: string }[] = [
  { name: "Luis Garcia", relationship: "Employee", event: "Termination", coverage: "Medical, Dental", status: "Open" },
  { name: "Diane Bell", relationship: "Spouse", event: "Divorce", coverage: "Medical", status: "Open" },
  { name: "Owen Bell", relationship: "Dependent", event: "Aged Out", coverage: "Medical, Dental", status: "Elected" },
  { name: "Wade Foster", relationship: "Employee", event: "Reduction in Hours", coverage: "Medical", status: "Elected" },
];
const COBRA_PAYMENTS: { person: string; coverage: string; period: string; amount: string; due: string; status: string }[] = [
  { person: "Wade Foster", coverage: "Anthem PPO", period: "Nov 2026", amount: "$612.00", due: "Nov 1, 2026", status: "Past Due" },
  { person: "Owen Bell", coverage: "Guardian Dental", period: "Nov 2026", amount: "$48.00", due: "Nov 1, 2026", status: "Current" },
  { person: "Diane Bell", coverage: "Anthem PPO", period: "Dec 2026", amount: "$612.00", due: "Dec 1, 2026", status: "Upcoming" },
];
const cobraTone: Record<string, Tone> = {
  Overdue: "danger", Due: "warning", Draft: "muted", Sent: "success", Open: "warning", Elected: "success",
  "Past Due": "danger", Current: "success", Upcoming: "info", Pending: "warning", Needs: "danger", "—": "muted",
};

const NOTICES: { type: string; audience: string; due: string; delivery: string; status: string }[] = [
  { type: "COBRA Election Notices", audience: "5 qualified beneficiaries", due: "Nov 10–22, 2026", delivery: "2 overdue", status: "Action Needed" },
  { type: "Medicare Part D Creditable Coverage", audience: "All employees", due: "Oct 15, 2026", delivery: "Sent Oct 10, 2026", status: "Sent" },
  { type: "CHIP Notice", audience: "All employees", due: "Annual", delivery: "Sent Oct 1, 2026", status: "Sent" },
  { type: "SBC (Summary of Benefits & Coverage)", audience: "Enrolling employees", due: "At enrollment", delivery: "Distributed during OE", status: "Sent" },
  { type: "Employer Marketplace / Exchange Notice", audience: "New hires", due: "Within 14 days of hire", delivery: "Automated", status: "Active" },
  { type: "1095-C Employee Copies", audience: "510 employees", due: "Jan 31, 2027", delivery: "Not yet distributed", status: "Pending" },
];
const noticeTone: Record<string, Tone> = { "Action Needed": "warning", Sent: "success", Active: "info", Pending: "muted", Overdue: "danger" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "aca", label: "ACA / ALE" },
  { key: "cobra", label: "COBRA" },
  { key: "notices", label: "Notices" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function KV({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{k}</span><span className={`text-right font-medium ${tone ?? ""}`}>{v}</span></div>;
}

export function CompliancePage() {
  const { role } = useRole();
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  const [tab, setTab] = useState<TabKey>("overview");
  const [acaView, setAcaView] = useState<"fte" | "forms" | "afford">("fte");
  const [cobraView, setCobraView] = useState<"events" | "beneficiaries" | "payments">("events");

  const sortedForms = useMemo(() => {
    const rank: Record<FormStatus, number> = { "Missing Data": 0, "Needs Review": 1, Corrected: 2, Ready: 3 };
    return [...FORMS].sort((a, b) => rank[a.status] - rank[b.status]);
  }, []);

  if (!employer || !py) return <LoadingCard label="Loading compliance…" />;

  // Broker/agency see a limited summary only — no payroll-level detail, Overview only.
  const brokerView = role === "broker" || role === "agency_admin";
  const tabs = brokerView ? TABS.filter((t) => t.key === "overview") : TABS;
  const attention = (brokerView ? NEEDS_ATTENTION.filter((a) => !a.payroll) : NEEDS_ATTENTION);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <h1 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">Compliance</h1>
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Compliance Year: 2026</Badge>
            {!brokerView && <StatusPill label="Filing Status: In Preparation" tone="warning" />}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">ACA / ALE, 1095-C filing, COBRA administration, and compliance notices for the selected plan year.</p>
          <p className="mt-1 text-xs text-muted-foreground">{employer.name} · {py.label}{brokerView ? " · limited summary" : ""}</p>
        </div>
        {!brokerView && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm"><AlertTriangle className="mr-1.5 h-4 w-4" />Review ACA Issues</Button>
            <Button variant="outline" size="sm"><FileCheck2 className="mr-1.5 h-4 w-4" />Generate 1095-C</Button>
            <Button size="sm" disabled><Send className="mr-1.5 h-4 w-4" />Send to Filing Partner</Button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {OVERVIEW.map((k) => (
              <Card key={k.label}><CardContent className="p-4">
                <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${k.iconCls}`}><k.icon className="h-4 w-4" /></div>
                <div className={`text-lg font-semibold ${k.tone}`}>{k.value}</div>
                <div className="text-xs font-medium text-foreground">{k.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</div>
              </CardContent></Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-warning" /> Compliance Tasks / Needs Attention</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {attention.map((a) => (
                  <div key={a.label} className="flex items-start justify-between gap-2 rounded-md border p-2.5 text-sm">
                    <span className="flex items-start gap-2"><AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${a.tone === "danger" ? "text-destructive" : a.tone === "warning" ? "text-warning" : "text-info"}`} />{a.label}</span>
                    {!brokerView && <Button size="sm" variant="ghost" className="h-7 shrink-0 text-primary">Resolve</Button>}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> Upcoming Compliance Deadlines</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {DEADLINES.map((d) => (
                  <div key={d.item} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
                    <div className="min-w-0"><div className="truncate font-medium">{d.item}</div><div className="text-[11px] text-muted-foreground">{d.date} · {d.category}</div></div>
                    <StatusPill label={d.status} tone={calTone[d.status] ?? "muted"} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── ACA / ALE (combined) ── */}
      {tab === "aca" && !brokerView && (
        <div className="space-y-4">
          {/* Readiness command center */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div>
                <CardTitle className="text-base">Are we ready for ACA / ALE / 1095-C compliance?</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">82% ready · 421 of 510 forms ready · 38 blocked · 17 forms with issues</p>
              </div>
              <div className="text-2xl font-semibold text-success">82%</div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={82} className="h-2" />
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <Ban className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-medium">Filing is blocked: 38 forms cannot be transmitted.</span> ACA lookback depends on Payroll Data — resolve missing hours there.</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {READINESS_ISSUES.map((i) => (
                  <button key={i.label} className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-left text-sm transition hover:bg-muted/60">
                    <span className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${i.tone === "danger" ? "text-destructive" : i.tone === "warning" ? "text-warning" : "text-info"}`} />{i.label}</span>
                    <span className="flex items-center gap-1"><StatusPill label={String(i.count)} tone={i.tone} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Summary section cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> ALE Determination</CardTitle><StatusPill label="Likely ALE" tone="warning" /></CardHeader>
              <CardContent className="space-y-2"><KV k="2027 ALE Status" v="Likely ALE" /><KV k="2026 Avg Monthly Count" v="487.8" /><KV k="Readiness" v="91%" /><KV k="Missing Data" v="2 months" tone="text-warning" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Measurement & Stability</CardTitle></CardHeader>
              <CardContent className="space-y-2"><KV k="Measurement Period" v="Jan–Dec 2026" /><KV k="Stability Period" v="Jan–Dec 2027" /><KV k="Lookback Method" v="12-month standard" /><KV k="Trending Full-Time" v="7" tone="text-warning" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Affordability</CardTitle></CardHeader>
              <CardContent className="space-y-2"><KV k="Safe Harbor Method" v="Rate of Pay" /><KV k="Affordable" v="432" tone="text-success" /><KV k="Needs Review" v="6" tone="text-warning" /><KV k="Missing Data" v="4" tone="text-destructive" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">1095-C Readiness</CardTitle></CardHeader>
              <CardContent className="space-y-2"><KV k="Forms Ready" v="421 / 510" tone="text-success" /><KV k="Needs Review" v="17" tone="text-warning" /><KV k="Blocked" v="38" tone="text-destructive" /><KV k="Corrected" v="3" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" /> Filing Status</CardTitle></CardHeader>
              <CardContent className="space-y-2"><KV k="2026 Status" v={<StatusPill label="In Preparation" tone="warning" />} /><KV k="Filing Partner" v="Nelco" /><KV k="Corrections" v="12" /><KV k="IRS Deadline" v="Mar 31, 2027" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">ACA Eligibility / Offer of Coverage</CardTitle></CardHeader>
              <CardContent className="space-y-2"><KV k="MEC Offered" v={<StatusPill label="Yes" tone="success" />} /><KV k="Minimum Value" v={<StatusPill label="Yes" tone="success" />} /><KV k="Missing Offer Codes" v="7" tone="text-warning" /><KV k="Missing Safe Harbor" v="4" tone="text-destructive" /></CardContent>
            </Card>
          </div>

          {/* Detail tables */}
          <div className="flex flex-wrap gap-1.5">
            {([["fte", "Monthly FTE"], ["forms", "1095-C Forms"], ["afford", "Affordability"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setAcaView(k)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${acaView === k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>{l}</button>
            ))}
          </div>

          {acaView === "fte" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Workforce Counts — 2026</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Full-Time</TableHead><TableHead className="text-right">PT / Non-FT Hours</TableHead><TableHead className="text-right">FTE</TableHead><TableHead className="text-right">Total ALE Count</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {ALE_MONTHS.map((m) => (
                      <TableRow key={m.month} className={m.status === "Missing Data" ? "bg-destructive/5" : undefined}>
                        <TableCell className="font-medium">{m.month}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{m.ft}</TableCell>
                        <TableCell className={`text-right text-sm tabular-nums ${m.ptHours === "Missing" ? "text-destructive" : ""}`}>{m.ptHours}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{m.fte}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{m.total}</TableCell>
                        <TableCell><StatusPill label={m.status} tone={m.status === "Ready" ? "success" : "danger"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {acaView === "forms" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div><CardTitle className="text-base">1095-C Forms Review</CardTitle><p className="mt-1 text-xs text-muted-foreground">Forms with issues are listed first.</p></div>
                <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search employee" className="h-9 w-48 pl-8" /></div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>ACA Status</TableHead><TableHead>Line 14</TableHead><TableHead>Line 16</TableHead><TableHead className="text-right">Months</TableHead><TableHead>Issues</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {sortedForms.map((r) => (
                      <TableRow key={r.employee} className={r.status === "Missing Data" || r.status === "Needs Review" ? "bg-warning/5" : undefined}>
                        <TableCell className="font-medium">{r.employee}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.aca}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{r.line14 === "Missing" ? <span className="text-destructive">Missing</span> : r.line14}</TableCell>
                        <TableCell className="font-mono text-xs">{r.line16 === "Missing" ? <span className="text-destructive">Missing</span> : r.line16}</TableCell>
                        <TableCell className="text-right text-sm">{r.months}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.issues}</TableCell>
                        <TableCell><StatusPill label={r.status} tone={formTone[r.status]} /></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="outline" className="h-8">{r.status === "Ready" ? "View" : "Fix Codes"}</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {acaView === "afford" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ScrollText className="h-4 w-4 text-primary" /> Affordability by Employee</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Wage / Basis</TableHead><TableHead>Lowest EE-Only Premium</TableHead><TableHead>Result</TableHead><TableHead>Safe Harbor Code</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {AFFORD_ROWS.map((r) => (
                      <TableRow key={r.e}>
                        <TableCell className="font-medium">{r.e}</TableCell>
                        <TableCell className="text-xs"><span className={`font-medium ${r.wage === "Missing" ? "text-destructive" : ""}`}>{r.wage}</span> <span className="text-muted-foreground">· {r.basis}</span></TableCell>
                        <TableCell className="text-sm">{r.premium}</TableCell>
                        <TableCell><StatusPill label={r.result} tone={resultTone[r.result] ?? "muted"} /></TableCell>
                        <TableCell className="font-mono text-xs">{r.code === "Missing" ? <span className="text-destructive">Missing</span> : r.code}</TableCell>
                        <TableCell><StatusPill label={r.status} tone={affordStatusTone[r.status] ?? "muted"} /></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="ghost" className="h-8 text-primary">{r.status === "Ready" ? "View" : "Review"}</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><FileBarChart className="h-4 w-4" />ACA lookback + affordability are calculated from <span className="font-medium text-foreground">Payroll Data</span>. Compliance is where the results are reviewed and filed.</div>
            <Button size="sm" variant="outline"><Calculator className="mr-1.5 h-4 w-4" />Recalculate</Button>
          </div>
        </div>
      )}

      {/* ── COBRA ── */}
      {tab === "cobra" && !brokerView && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Active Participants", value: "6", tone: "text-foreground" },
              { label: "Qualifying Events", value: "5", tone: "text-warning" },
              { label: "Overdue Notices", value: "2", tone: "text-destructive" },
              { label: "Payment Issues", value: "1", tone: "text-destructive" },
            ].map((k) => (
              <Card key={k.label}><CardContent className="p-4"><div className={`text-xl font-semibold tabular-nums ${k.tone}`}>{k.value}</div><div className="mt-0.5 text-xs text-muted-foreground">{k.label}</div></CardContent></Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([["events", "Qualifying Events"], ["beneficiaries", "Qualified Beneficiaries"], ["payments", "Payments"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setCobraView(k)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${cobraView === k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>{l}</button>
            ))}
          </div>

          {cobraView === "events" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">COBRA Event Work Queue</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Qualifying events, election notices, payment, and carrier/TPA status.</p></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Qualifying Event</TableHead><TableHead>Notice</TableHead><TableHead>Election / Status</TableHead><TableHead>Payment</TableHead><TableHead>Carrier / TPA</TableHead><TableHead>Next Step</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {COBRA_EVENTS.map((e) => (
                      <TableRow key={e.person + e.event}>
                        <TableCell><div className="font-medium">{e.person}</div><div className="text-xs text-muted-foreground">{e.relationship}</div></TableCell>
                        <TableCell className="text-sm">{e.event}</TableCell>
                        <TableCell><StatusPill label={e.notice} tone={cobraTone[e.notice] ?? "muted"} /></TableCell>
                        <TableCell><StatusPill label={e.cobra} tone={cobraTone[e.cobra] ?? "muted"} /></TableCell>
                        <TableCell><StatusPill label={e.payment} tone={cobraTone[e.payment] ?? "muted"} /></TableCell>
                        <TableCell><StatusPill label={e.tpa} tone={cobraTone[e.tpa] ?? "muted"} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.next}</TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="ghost" className="h-8 text-primary">Open</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {cobraView === "beneficiaries" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Qualified Beneficiaries</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Relationship</TableHead><TableHead>Qualifying Event</TableHead><TableHead>Coverage</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {COBRA_BENEFICIARIES.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-sm">{b.relationship}</TableCell>
                        <TableCell className="text-sm">{b.event}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.coverage}</TableCell>
                        <TableCell><StatusPill label={b.status} tone={cobraTone[b.status] ?? "muted"} /></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="ghost" className="h-8 text-primary">View</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {cobraView === "payments" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">COBRA Payments</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Coverage</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {COBRA_PAYMENTS.map((p) => (
                      <TableRow key={p.person + p.period}>
                        <TableCell className="font-medium">{p.person}</TableCell>
                        <TableCell className="text-sm">{p.coverage}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.period}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{p.amount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.due}</TableCell>
                        <TableCell><StatusPill label={p.status} tone={cobraTone[p.status] ?? "muted"} /></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="ghost" className="h-8 text-primary">{p.status === "Past Due" ? "Review" : "View"}</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Notices ── */}
      {tab === "notices" && !brokerView && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4 text-primary" /> Compliance Notices</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Required participant notices, delivery status, and upcoming deadlines.</p></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Notice</TableHead><TableHead>Audience</TableHead><TableHead>Due</TableHead><TableHead>Delivery</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {NOTICES.map((n) => (
                  <TableRow key={n.type}>
                    <TableCell className="font-medium">{n.type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{n.audience}</TableCell>
                    <TableCell className="text-sm">{n.due}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{n.delivery}</TableCell>
                    <TableCell><StatusPill label={n.status} tone={noticeTone[n.status] ?? "muted"} /></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" className="h-8">{n.status === "Sent" || n.status === "Active" ? "View" : n.status === "Pending" ? "Distribute" : "Generate"}</Button></TableCell>
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
