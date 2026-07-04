import { useState } from "react";
import {
  Database, RefreshCw, Calculator, Upload, Plug, ShieldAlert, ShieldCheck, AlertTriangle, Users,
  Search, Settings2, History, ArrowRight, CalendarClock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, LoadingCard, RoleNotAvailable } from "@/components/common";
import { useRole } from "@/lib/role-context";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear, useActivePlanYearId } from "@/lib/plan-year-context";
import { useEmployer, usePayrollDataWorkspace } from "@/lib/api";
import { ImportPayrollForm, RunLookbackButton, SyncProviderButton } from "@/components/payroll/PayrollDataForms";
import type { PayPeriodStatus, PayrollAcaStatus } from "@/lib/mock/db";

// Payroll Data is supporting setup/compliance data. Employer-level only.
const PAYROLL_BLOCKED = new Set(["broker", "agency_admin"]);

const TABS = [
  { key: "connection", label: "Payroll Connection" },
  { key: "periods", label: "Imported Pay Periods" },
  { key: "employees", label: "Employee Payroll Records" },
  { key: "aca", label: "ACA Lookback" },
  { key: "settings", label: "Payroll Settings" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ppTone: Record<PayPeriodStatus, "success" | "warning" | "danger" | "muted"> = {
  Imported: "success", "Needs Review": "warning", Failed: "danger", Partial: "warning", Replaced: "muted", Locked: "muted",
};
const acaTone: Record<PayrollAcaStatus, "success" | "muted" | "info" | "warning"> = {
  "Full-Time": "success", "Not Full-Time": "muted", "Trending Full-Time": "info", Unknown: "warning", "Needs Review": "warning",
};

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
function Sel({ label, options }: { label: string; options: string[] }) {
  return (
    <select aria-label={label} defaultValue="all" className="h-9 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground">
      <option value="all">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className={`text-lg font-semibold tabular-nums ${tone ?? "text-foreground"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function PayrollDataPage() {
  const { role } = useRole();
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  const { data: ws } = usePayrollDataWorkspace(employerId, planYearId);
  const [tab, setTab] = useState<TabKey>("connection");

  if (PAYROLL_BLOCKED.has(role)) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4">
        <h1 className="text-[1.55rem] font-semibold tracking-tight">Payroll Data</h1>
        <RoleNotAvailable what="Payroll Data" detail="Payroll is employer-level only — available to Employer Admins and payroll admins, not agencies or brokers." />
      </div>
    );
  }
  if (!employer || !py || !ws) return <LoadingCard label="Loading payroll data…" />;

  const { readOnly, connection: cn, readiness: rd, importSummary: imp, aca } = ws;
  const missingRecords = rd.issues.find((i) => i.key === "missing-records")?.count ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h1 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">Payroll Data</h1>
            {cn.connected && <Badge variant="outline" className="border-info/30 bg-info/10 text-info">Connected</Badge>}
            {cn.lookbackReady && <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Lookback Ready</Badge>}
            {readOnly && <Badge variant="outline" className="border-border bg-muted text-muted-foreground">Read-only history</Badge>}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">Payroll connection, imported pay periods, employee records, and ACA lookback readiness used for eligibility, affordability, and compliance reporting.</p>
          <p className="mt-1 text-xs text-muted-foreground">{employer.name} · {py.label}</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <SyncProviderButton employerId={employerId} />
            <RunLookbackButton employerId={employerId} planYearId={planYearId} />
            <ImportPayrollForm employerId={employerId} />
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

      {/* Payroll Connection */}
      {tab === "connection" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Plug className="h-4 w-4 text-info" /> Payroll Connection & Health</CardTitle></CardHeader>
            <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Payroll Provider" value={cn.provider} />
              <Row label="Payroll Frequency" value={cn.frequency} />
              <Row label="Current Payroll Group" value={cn.currentGroup} />
              <Row label="Data Source" value={cn.dataSource} />
              <Row label="First Imported Period" value={cn.firstImported} />
              <Row label="Last Imported Period" value={cn.lastImported} />
              <Row label="Last Sync" value={cn.lastSync} />
              <Row label="Next Sync" value={cn.nextSync} />
              {!readOnly && (
                <div className="col-span-full grid grid-cols-3 gap-1 pt-2 sm:max-w-xs">
                  <Button size="sm" variant="outline"><RefreshCw className="h-3.5 w-3.5" />Sync</Button>
                  <Button size="sm" variant="outline"><Settings2 className="h-3.5 w-3.5" />Mapping</Button>
                  <Button size="sm" variant="outline"><History className="h-3.5 w-3.5" />History</Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Import Summary</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Stat label="Imported Pay Periods" value={imp.importedPayPeriods} />
              <Stat label="Matched Employees" value={imp.matchedEmployees} tone="text-success" />
              <Stat label="Unmatched Employees" value={imp.unmatchedEmployees} tone={imp.unmatchedEmployees ? "text-warning" : "text-foreground"} />
              <Stat label="Last Sync Status" value={imp.lastSyncStatus} tone={imp.lastSyncStatus === "Success" ? "text-success" : "text-muted-foreground"} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Imported Pay Periods */}
      {tab === "periods" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><CardTitle className="text-base">Imported Pay Periods</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Review imported payroll periods and resolve missing or partial records.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search pay period" className="h-9 w-48 pl-8" /></div>
                <Sel label="Payroll group" options={["Biweekly", "Monthly"]} />
                <Sel label="Status" options={["Imported", "Needs Review", "Failed"]} />
                <Sel label="Year" options={["2027", "2026", "2025"]} />
                <Button variant="outline" size="sm" className="h-9">Issues only</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Pay Period</TableHead><TableHead>Pay Date</TableHead><TableHead>Payroll Group</TableHead>
                <TableHead className="text-right">Employees</TableHead><TableHead className="text-right">Total Hours</TableHead><TableHead className="text-right">Total Wages</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Issues</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ws.payPeriods.map((p) => (
                  <TableRow key={p.id} className={p.issues > 0 ? "bg-warning/5" : undefined}>
                    <TableCell className="font-medium">{p.period}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.payDate}</TableCell>
                    <TableCell className="text-sm">{p.group}</TableCell>
                    <TableCell className="text-right text-sm">{p.emps}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{p.hours}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{p.wages}</TableCell>
                    <TableCell><StatusPill label={p.status} tone={ppTone[p.status]} /></TableCell>
                    <TableCell className="text-right text-sm">{p.issues > 0 ? <span className="text-warning">{p.issues}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.source}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" className="h-8 text-primary">{p.issues > 0 ? "Resolve" : "View"}</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Employee Payroll Records */}
      {tab === "employees" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">ACA lookback readiness has <span className="font-medium text-foreground">{missingRecords} missing records</span>.</span>
            <Button variant="ghost" size="sm" className="h-7 text-primary" onClick={() => setTab("aca")}>View ACA Lookback <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
          </div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><CardTitle className="text-base">Employee Payroll Records</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Employee payroll history, hours, wages, and census match.</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search employee" className="h-9 w-48 pl-8" /></div>
                  <Sel label="ACA status" options={["Full-Time", "Not Full-Time", "Trending Full-Time"]} />
                  <Button variant="outline" size="sm" className="h-9">Issues only</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Employee</TableHead><TableHead>Employee #</TableHead><TableHead>Payroll Group</TableHead><TableHead>Matched Census</TableHead>
                  <TableHead className="text-right">Hours</TableHead><TableHead className="text-right">Wages</TableHead><TableHead>ACA Status</TableHead><TableHead>Issues</TableHead><TableHead>Last Imported</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ws.employeeRecords.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.empNumber}</TableCell>
                      <TableCell className="text-sm">{e.group}</TableCell>
                      <TableCell className="text-sm">{e.matchedCensus === "Unmatched" ? <span className="text-destructive">Unmatched</span> : e.matchedCensus}</TableCell>
                      <TableCell className={`text-right text-sm tabular-nums ${e.hours === "Missing" ? "text-destructive" : ""}`}>{e.hours}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{e.wages}</TableCell>
                      <TableCell><StatusPill label={e.aca} tone={acaTone[e.aca]} /></TableCell>
                      <TableCell className={`text-xs ${e.issues === "None" ? "text-muted-foreground" : "text-warning"}`}>{e.issues}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.lastImported}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ACA Lookback */}
      {tab === "aca" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Payroll Data Readiness for ACA Lookback</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Payroll data must be complete before lookback, affordability, and 1095-C calculations are finalized.</p>
              </div>
              <div className={`text-2xl font-semibold ${rd.percent >= 90 ? "text-success" : rd.percent >= 70 ? "text-warning" : "text-destructive"}`}>{rd.percent}%</div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={rd.percent} className="h-2" />
              {rd.issues.length === 0 ? (
                <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">Payroll data is complete for this measurement period.</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {rd.issues.map((i) => (
                    <div key={i.key} className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm">
                      <span className="flex items-center gap-2"><ShieldAlert className={`h-3.5 w-3.5 ${i.tone === "danger" ? "text-destructive" : i.tone === "warning" ? "text-warning" : "text-info"}`} />{i.label}</span>
                      <StatusPill label={String(i.count)} tone={i.tone === "danger" ? "danger" : i.tone === "warning" ? "warning" : "info"} />
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline"><AlertTriangle className="mr-1.5 h-4 w-4" />Resolve Payroll Issues</Button>
                  <Button size="sm" variant="outline"><Users className="mr-1.5 h-4 w-4" />View Unmatched Employees</Button>
                  <RunLookbackButton employerId={employerId} planYearId={planYearId} />
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-info" /> Lookback Periods</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Measurement Period" value={aca.measurementPeriod} />
                <Row label="Stability Period" value={aca.stabilityPeriod} />
                <Row label="Administrative Period" value={aca.administrativePeriod} />
                <Row label="Lookback Calculation" value={aca.calcStatus} />
                <Row label="Last Calculated" value={aca.lastCalculated} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">ACA / Affordability Readiness</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Full-Time Determination" value={aca.fullTimeDeterminationStatus} />
                <Row label="Affordability Data" value={aca.affordabilityStatus} />
                <Row label="1095-C Readiness" value={aca.form1095Status} />
                <div className="pt-2 text-xs text-muted-foreground">Payroll data feeds full-time determination, affordability safe-harbor tests, and 1095-C reporting for {aca.measurementPeriod}.</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Payroll Settings */}
      {tab === "settings" && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Payroll Settings</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Employer-level payroll configuration (mock — editing not wired).</p></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Payroll Provider", value: ws.settings.provider },
              { label: "Payroll Frequency", value: ws.settings.frequency },
              { label: "Deduction Schedule", value: ws.settings.deductionSchedule },
              { label: "Payroll Groups", value: ws.settings.payrollGroups },
              { label: "Deduction Code Mapping", value: ws.settings.codeMapping },
              { label: "Sync Settings", value: ws.settings.syncSettings },
              { label: "Export Format", value: ws.settings.exportFormat },
            ].map((s) => (
              <div key={s.label} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="mt-0.5 text-sm font-medium">{s.value}</div>
                {!readOnly && <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs text-primary">Edit</Button>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
