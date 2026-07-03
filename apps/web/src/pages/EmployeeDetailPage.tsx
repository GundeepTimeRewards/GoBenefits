import type { ReactNode, ComponentType } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft, UserX, Mail, Phone, MapPin, CheckCircle2, AlertCircle, User,
  Edit, Send, ExternalLink, PlayCircle, Wrench, Download, Plus,
  ShieldCheck, Users, DollarSign, FileText, Activity, Briefcase,
  CalendarDays, ClipboardCheck, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useEmployer, useEmployeeDetail } from "@/lib/api";
import { EditEmployeeForm, DependentManager } from "@/components/census/C1MutationForms";
import { ageFromDob, employmentStatusLabel, type EmployeeDetail, type Dependent } from "@/lib/census-mock";

// --- helpers ----------------------------------------------------------------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const toneClass: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  teal: "bg-teal/15 text-teal-foreground border-teal/30",
  info: "bg-info/15 text-info border-info/30",
  warning: "bg-warning/20 text-warning-foreground border-warning/40",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-border",
};
const statusTone: Record<string, keyof typeof toneClass> = {
  Complete: "success", Ready: "success", Available: "success", Uploaded: "success",
  Selected: "success", Eligible: "success", Active: "success", Completed: "success", Verified: "success",
  "Auto-Enrolled": "teal",
  "In Progress": "info", "Under Review": "info",
  Waived: "muted", "Not Started": "muted", Draft: "muted", Closed: "muted",
  "Needs Attention": "warning", "Needs Action": "warning",
  "Pending Final Election": "warning", "Pending Submission": "warning", Pending: "warning",
  "Not Eligible": "danger",
};
function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={toneClass[statusTone[status] ?? "muted"]}>{status}</Badge>;
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: ReactNode; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-right text-sm font-medium text-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {value ?? "—"}
      </span>
    </div>
  );
}

const summaryTone: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  teal: "bg-teal/15 text-teal-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  muted: "bg-muted text-muted-foreground",
};
function SummaryCard({ title, value, sub, icon: Icon, tone = "primary" }: { title: string; value: string; sub: string; icon: ComponentType<{ className?: string }>; tone?: keyof typeof summaryTone }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${summaryTone[tone]}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className="mt-0.5 text-base font-semibold text-foreground">{value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Subtle marker for tabs whose module isn't wired yet — data below is representative.
function MockNote() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5" /> Representative data — this module is not yet wired to live records.
    </p>
  );
}

const relationshipLabel: Record<string, string> = { spouse: "Spouse", child: "Child", domestic_partner: "Domestic Partner", other: "Other" };
const coveredLabel: Record<string, { label: string; tone: keyof typeof toneClass }> = {
  covered: { label: "Covered", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  not_covered: { label: "Not Covered", tone: "muted" },
};

// --- representative mock for not-yet-modeled tabs ---------------------------
const eligibility = [
  { coverage: "Medical", result: "Eligible", reason: "Full-time employee, benefit class Full-Time", effective: "Jan 1, 2027" },
  { coverage: "Dental", result: "Eligible", reason: "Full-time employee, benefit class Full-Time", effective: "Jan 1, 2027" },
  { coverage: "Vision", result: "Eligible", reason: "Full-time employee, benefit class Full-Time", effective: "Jan 1, 2027" },
  { coverage: "Basic Life", result: "Eligible", reason: "Employer-paid benefit", effective: "Jan 1, 2027" },
  { coverage: "Voluntary Life", result: "Eligible", reason: "Full-time employee, EOI may apply", effective: "Jan 1, 2027" },
  { coverage: "Accident", result: "Eligible", reason: "Voluntary coverage available", effective: "Jan 1, 2027" },
  { coverage: "Critical Illness", result: "Eligible", reason: "Voluntary coverage available", effective: "Jan 1, 2027" },
  { coverage: "Long-Term Disability", result: "Not Eligible", reason: "Minimum hours requirement not met", effective: "—" },
];
const elections = [
  { coverage: "Medical", status: "In Progress", plan: "UHC Choice Plus PPO", tier: "Employee + Family", ee: "$286.42/pay", er: "$612.00/mo", action: "No" },
  { coverage: "Dental", status: "Selected", plan: "Guardian Dental PPO", tier: "Employee + Family", ee: "$24.18/pay", er: "$42.00/mo", action: "No" },
  { coverage: "Vision", status: "Waived", plan: "—", tier: "—", ee: "$0.00", er: "$0.00", action: "No" },
  { coverage: "Basic Life", status: "Auto-Enrolled", plan: "MetLife Basic Life", tier: "Employee Only", ee: "$0.00", er: "$8.50/mo", action: "No" },
  { coverage: "Voluntary Life", status: "Needs Action", plan: "MetLife Voluntary Life", tier: "Pending", ee: "Pending", er: "$0.00", action: "Beneficiary required" },
  { coverage: "Accident", status: "Not Started", plan: "—", tier: "—", ee: "Pending", er: "$0.00", action: "Yes" },
  { coverage: "Critical Illness", status: "Not Started", plan: "—", tier: "—", ee: "Pending", er: "$0.00", action: "Yes" },
];
const deductions = [
  { code: "MED-UHC-PPO", coverage: "Medical", plan: "UHC Choice Plus PPO", ee: "$286.42", er: "$612.00", effective: "Jan 1, 2027", status: "Pending Final Election" },
  { code: "DEN-GUARD-PPO", coverage: "Dental", plan: "Guardian Dental PPO", ee: "$24.18", er: "$42.00", effective: "Jan 1, 2027", status: "Ready" },
  { code: "VIS-WAIVE", coverage: "Vision", plan: "Waived", ee: "$0.00", er: "$0.00", effective: "Jan 1, 2027", status: "Ready" },
  { code: "LIFE-BASIC", coverage: "Basic Life", plan: "MetLife Basic Life", ee: "$0.00", er: "$8.50", effective: "Jan 1, 2027", status: "Ready" },
];
const documents = [
  { name: "2027 Benefits Guide", type: "Guide", status: "Available", date: "Oct 12, 2026" },
  { name: "UHC Medical SBC", type: "SBC", status: "Available", date: "Oct 12, 2026" },
  { name: "Guardian Dental Summary", type: "Summary", status: "Available", date: "Oct 12, 2026" },
  { name: "Enrollment Confirmation Statement", type: "Statement", status: "Pending Submission", date: "—" },
  { name: "Dependent Verification Document", type: "Verification", status: "Uploaded", date: "Oct 18, 2026" },
];
const beneficiaries = [
  { name: "Taylor Lee", relationship: "Spouse", type: "Primary", allocation: "100%", coverage: "Basic Life" },
  { name: "Avery Lee", relationship: "Child", type: "Contingent", allocation: "100%", coverage: "Basic Life" },
];
const lifeEvents = [
  { id: "le-1", type: "Birth or Adoption", event: "Mar 12, 2027", submitted: "Mar 15, 2027", status: "Under Review", docs: "1 missing", window: "Not opened", impact: "Add dependent, update tiers" },
  { id: "le-2", type: "Marriage", event: "Jun 6, 2026", submitted: "Jun 8, 2026", status: "Completed", docs: "Verified", window: "Closed", impact: "Added spouse to medical & dental" },
  { id: "le-3", type: "Loss of Other Coverage", event: "—", submitted: "Draft", status: "Draft", docs: "Missing", window: "Not opened", impact: "—" },
];
const auditTrail = [
  { when: "Today, 2:14 PM", actor: "Employee", action: "Updated dependents — added verification document" },
  { when: "Today, 11:02 AM", actor: "Employee", action: "Selected Guardian Dental PPO — Employee + Family" },
  { when: "Yesterday, 4:48 PM", actor: "Employee", action: "Waived Vision coverage for 2027" },
  { when: "Oct 21, 2026", actor: "System", action: "Eligibility preview was run for 2027 Benefits" },
  { when: "Oct 18, 2026", actor: "HR Administrator", action: "Sent open enrollment reminder email" },
  { when: "Oct 12, 2026", actor: "System", action: "Imported employee record from HCM sync" },
];
const dataQuality = [
  { label: "Required personal information complete", status: "Complete" },
  { label: "Employment details complete", status: "Complete" },
  { label: "Benefit class assigned", status: "Complete" },
  { label: "Payroll group assigned", status: "Complete" },
  { label: "Email verified", status: "Complete" },
  { label: "Dependents reviewed", status: "Complete" },
  { label: "Beneficiaries required", status: "Needs Attention" },
];

export function EmployeeDetailPage() {
  const employerId = useActiveEmployerId();
  const { employeeId } = useParams({ strict: false });
  const { data: employer } = useEmployer(employerId);
  const detail = useEmployeeDetail(employerId, employeeId ?? "");

  if (detail.isPending || !employer) return <LoadingCard label="Loading employee…" />;
  const e = detail.data;

  // Wrong-employer / not-found: the id doesn't belong to the active employer.
  if (!e) {
    return (
      <div className="mx-auto max-w-[700px] space-y-4">
        <Button asChild size="sm" variant="ghost">
          <Link to="/employers/$employerId/census" params={{ employerId }}><ArrowLeft className="mr-1 h-4 w-4" />Census</Link>
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <UserX className="h-8 w-8 text-muted-foreground" />
            <div className="text-lg font-semibold">Employee not found</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Employee <span className="font-mono">{employeeId}</span> isn't part of{" "}
              <span className="font-medium">{employer.name}</span>. It may belong to a different employer.
            </p>
            <Button asChild size="sm" className="mt-2">
              <Link to="/employers/$employerId/census" params={{ employerId }}>Back to {employer.name} census</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <EmployeeProfile employerId={employerId} employerName={employer.name} e={e} />;
}

function EmployeeProfile({ employerId, employerName, e }: { employerId: string; employerName: string; e: EmployeeDetail }) {
  const age = ageFromDob(e.dateOfBirth);
  const statusLabel = employmentStatusLabel(e);
  const initials = `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();
  const eligLabel = e.eligibilityStatus === true ? "Eligible" : e.eligibilityStatus === false ? "Ineligible" : "Pending";
  const deps = e.dependents;

  const personalInfo: { label: string; value: ReactNode; icon?: ComponentType<{ className?: string }> }[] = [
    { label: "First Name", value: e.firstName },
    { label: "Last Name", value: e.lastName },
    { label: "Date of Birth", value: e.dateOfBirth ? `${fmtDate(e.dateOfBirth)}${age !== null ? ` · ${age}` : ""}` : "—" },
    { label: "Gender", value: e.gender },
    { label: "Email", value: e.email, icon: Mail },
    { label: "Phone", value: e.cellPhone ?? e.homePhone, icon: Phone },
    { label: "Address", value: [e.addressLine1, e.city, e.state, e.zip].filter(Boolean).join(", ") || "—", icon: MapPin },
  ];
  const employmentInfo: { label: string; value: ReactNode }[] = [
    { label: "Employee #", value: e.employeeNumber },
    { label: "Hire Date", value: fmtDate(e.hireDate) },
    { label: "Employment Status", value: statusLabel },
    { label: "Job Title", value: e.jobTitle },
    { label: "Employment Class", value: e.employmentClass },
    { label: "Eligibility Class", value: e.eligibilityClass },
    { label: "Pay Type", value: e.payType },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Link to="/employers/$employerId/census" params={{ employerId }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Employee Census
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{initials}</div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{e.firstName} {e.lastName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {employerName} · {e.employeeNumber ?? "—"} · {e.jobTitle ?? "—"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={statusLabel} />
              <StatusBadge status={eligLabel} />
              <Badge variant="outline" className="bg-muted text-muted-foreground">Plan Year: 2027 Benefits</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <EditEmployeeForm employerId={employerId} employee={e} trigger={<Button variant="outline" size="sm"><Edit className="mr-1.5 h-4 w-4" />Edit Employee</Button>} />
            <Button variant="outline" size="sm"><PlayCircle className="mr-1.5 h-4 w-4" />Start Enrollment Event</Button>
            <Button variant="outline" size="sm"><Send className="mr-1.5 h-4 w-4" />Send Reminder</Button>
            <Button size="sm"><ExternalLink className="mr-1.5 h-4 w-4" />View Employee Portal</Button>
          </div>
          <div className="flex gap-2 text-xs">
            <button className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Wrench className="h-3.5 w-3.5" /> Resolve Issues</button>
            <span className="text-muted-foreground">·</span>
            <button className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Download className="h-3.5 w-3.5" /> Export Employee Record</button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Employment Status" value={statusLabel} sub={e.employmentClass ?? "—"} icon={Briefcase} tone="success" />
        <SummaryCard title="Eligibility" value={eligLabel} sub="7 of 8 coverages" icon={ShieldCheck} tone="teal" />
        <SummaryCard title="Enrollment Status" value="In Progress" sub="4 of 8 coverages completed" icon={ClipboardCheck} tone="primary" />
        <SummaryCard title="Dependents" value={String(deps.length)} sub={deps.length ? deps.map((d) => relationshipLabel[d.relationship]).join(", ") : "None on file"} icon={Users} tone="primary" />
        <SummaryCard title="Payroll Group" value={e.payType ?? "—"} sub="Deduction mapping ready" icon={DollarSign} tone="teal" />
        <SummaryCard title="Data Quality" value="Complete" sub="No missing required fields" icon={CheckCircle2} tone="success" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="dependents">Dependents</TabsTrigger>
          <TabsTrigger value="beneficiaries">Beneficiaries</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
          <TabsTrigger value="elections">Elections</TabsTrigger>
          <TabsTrigger value="life-events">Life Events</TabsTrigger>
          <TabsTrigger value="payroll">Payroll Deductions</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit History</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-primary" /> Personal Information</CardTitle></CardHeader>
                <CardContent>{personalInfo.map((r) => <InfoRow key={r.label} {...r} />)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Briefcase className="h-4 w-4 text-teal-foreground" /> Employment Information</CardTitle></CardHeader>
                <CardContent>{employmentInfo.map((r) => <InfoRow key={r.label} {...r} />)}</CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> 2027 Plan Year Enrollment</CardTitle></CardHeader>
                <CardContent>
                  {[
                    { label: "Plan Year", value: "2027 Benefits" },
                    { label: "Enrollment Event", value: "Open Enrollment" },
                    { label: "Event Window", value: "Nov 1, 2026 – Nov 20, 2026" },
                    { label: "Coverage Effective Date", value: "Jan 1, 2027" },
                    { label: "Enrollment Status", value: "In Progress" },
                  ].map((r) => <InfoRow key={r.label} {...r} />)}
                  <div className="mt-4 border-t pt-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Coverage decisions</span>
                      <span className="font-medium">4 of 8 completed</span>
                    </div>
                    <Progress value={50} className="h-2" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-success" /> Data Quality Checklist</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {dataQuality.map((d) => (
                    <div key={d.label} className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0">
                      <div className="flex items-center gap-2 text-sm">
                        {d.status === "Complete" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-warning" />}
                        <span className="text-foreground">{d.label}</span>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Employment */}
        <TabsContent value="employment">
          <Card>
            <CardHeader><CardTitle className="text-base">Employment Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              {employmentInfo.map((r) => <InfoRow key={r.label} {...r} />)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dependents */}
        <TabsContent value="dependents" className="space-y-4">
          {/* C1 functional add/edit/remove (hybrid-live; no-op in mock mode). */}
          <DependentManager employerId={employerId} employeeId={e.employeeId} dependents={deps} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm"><CheckCircle2 className="mr-1.5 h-4 w-4" />Verify Dependents</Button>
          </div>
          {deps.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No dependents on file.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {deps.map((d: Dependent) => {
                const dAge = ageFromDob(d.dateOfBirth);
                const cov = coveredLabel[d.coveredStatus ?? "not_covered"];
                return (
                  <Card key={d.dependentId}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal/15 text-sm font-medium text-teal-foreground">
                            {`${d.firstName?.[0] ?? ""}${d.lastName?.[0] ?? ""}`.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{d.firstName} {d.lastName}</div>
                            <div className="text-xs text-muted-foreground">{relationshipLabel[d.relationship] ?? d.relationship} · DOB {fmtDate(d.dateOfBirth)}{dAge !== null ? ` · ${dAge}` : ""}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className={toneClass[cov.tone]}>{cov.label}</Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4">
                        {d.student && <Badge variant="outline" className={toneClass.info}>Student</Badge>}
                        {d.disabled && <Badge variant="outline" className={toneClass.warning}>Disabled</Badge>}
                        {!d.student && !d.disabled && <span className="text-xs text-muted-foreground">No special status flags</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Beneficiaries */}
        <TabsContent value="beneficiaries" className="space-y-3">
          <MockNote />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Beneficiaries</CardTitle><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Add Beneficiary</Button></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Relationship</TableHead><TableHead>Type</TableHead><TableHead>Allocation</TableHead><TableHead>Coverage</TableHead></TableRow></TableHeader>
                <TableBody>
                  {beneficiaries.map((b) => (
                    <TableRow key={b.name + b.type}>
                      <TableCell className="font-medium">{b.name}</TableCell><TableCell>{b.relationship}</TableCell><TableCell>{b.type}</TableCell><TableCell>{b.allocation}</TableCell><TableCell>{b.coverage}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
                <div className="text-sm">
                  <div className="font-medium text-warning-foreground">Beneficiary required for Voluntary Life</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Add a primary beneficiary before submitting the election.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eligibility */}
        <TabsContent value="eligibility" className="space-y-3">
          <MockNote />
          <Card>
            <CardHeader><CardTitle className="text-base">Coverage Eligibility — 2027 Benefits</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Coverage Type</TableHead><TableHead>Result</TableHead><TableHead>Reason</TableHead><TableHead>Effective Date</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {eligibility.map((r) => (
                    <TableRow key={r.coverage}>
                      <TableCell className="font-medium">{r.coverage}</TableCell>
                      <TableCell><StatusBadge status={r.result} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.reason}</TableCell>
                      <TableCell className="text-sm">{r.effective}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-primary">View Rules</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="border-info/30 bg-info/5">
            <CardContent className="flex gap-3 p-4">
              <Info className="mt-0.5 h-5 w-5 text-info" />
              <div>
                <div className="font-medium text-foreground">Why Eligibility Matters</div>
                <p className="mt-1 text-sm text-muted-foreground">Eligibility rules determine which plans an employee can see during enrollment and which deductions or carrier records are created after submission.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Elections */}
        <TabsContent value="elections" className="space-y-3">
          <MockNote />
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">2027 Elections</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">View Enrollment Cart</Button>
                <Button variant="outline" size="sm">Admin Edit Elections</Button>
                <Button size="sm"><Send className="mr-1.5 h-4 w-4" />Send Reminder</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Coverage</TableHead><TableHead>Status</TableHead><TableHead>Selected Plan</TableHead><TableHead>Tier</TableHead><TableHead>Employee Cost</TableHead><TableHead>Employer Cost</TableHead><TableHead>Needs Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {elections.map((r) => (
                    <TableRow key={r.coverage}>
                      <TableCell className="font-medium">{r.coverage}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-sm">{r.plan}</TableCell>
                      <TableCell className="text-sm">{r.tier}</TableCell>
                      <TableCell className="text-sm">{r.ee}</TableCell>
                      <TableCell className="text-sm">{r.er}</TableCell>
                      <TableCell className="text-sm">{r.action === "No" ? <span className="text-muted-foreground">—</span> : <Badge variant="outline" className={toneClass.warning}>{r.action}</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Life Events */}
        <TabsContent value="life-events" className="space-y-3">
          <MockNote />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Life Event History</CardTitle>
              <Button asChild size="sm" variant="outline"><Link to="/employers/$employerId/life-events" params={{ employerId }}><ExternalLink className="mr-1.5 h-4 w-4" />Open Life Events</Link></Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Event Type</TableHead><TableHead>Event Date</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead>Documents</TableHead><TableHead>Election Window</TableHead><TableHead>Benefit Impact</TableHead></TableRow></TableHeader>
                <TableBody>
                  {lifeEvents.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.event}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.submitted}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-sm">{r.docs}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.window}</TableCell>
                      <TableCell className="text-sm">{r.impact}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll Deductions */}
        <TabsContent value="payroll" className="space-y-3">
          <MockNote />
          <Card>
            <CardHeader><CardTitle className="text-base">Projected Payroll Deductions — 2027</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Deduction Code</TableHead><TableHead>Coverage</TableHead><TableHead>Plan</TableHead><TableHead>Employee / Pay</TableHead><TableHead>Employer Monthly</TableHead><TableHead>Effective</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {deductions.map((d) => (
                    <TableRow key={d.code}>
                      <TableCell className="font-mono text-xs">{d.code}</TableCell>
                      <TableCell>{d.coverage}</TableCell>
                      <TableCell className="text-sm">{d.plan}</TableCell>
                      <TableCell className="text-sm">{d.ee}</TableCell>
                      <TableCell className="text-sm">{d.er}</TableCell>
                      <TableCell className="text-sm">{d.effective}</TableCell>
                      <TableCell><StatusBadge status={d.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-info/30 bg-info/5 p-4">
                  <div className="text-xs text-info">Estimated Employee Cost</div>
                  <div className="mt-1 text-xl font-semibold text-foreground">$310.60</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">per pay period</div>
                </div>
                <div className="rounded-lg border border-teal/30 bg-teal/5 p-4">
                  <div className="text-xs text-teal-foreground">Estimated Employer Cost</div>
                  <div className="mt-1 text-xl font-semibold text-foreground">$662.50</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">per month</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="space-y-3">
          <MockNote />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Documents</CardTitle><Button variant="outline" size="sm"><Plus className="mr-1.5 h-4 w-4" />Upload Document</Button></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Document Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {documents.map((d) => (
                    <TableRow key={d.name}>
                      <TableCell className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-muted-foreground" />{d.name}</TableCell>
                      <TableCell className="text-sm">{d.type}</TableCell>
                      <TableCell><StatusBadge status={d.status} /></TableCell>
                      <TableCell className="text-sm">{d.date}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-primary"><Download className="mr-1 h-4 w-4" />Download</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit" className="space-y-3">
          <MockNote />
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Audit History</CardTitle></CardHeader>
            <CardContent>
              <div className="relative space-y-5 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-px before:bg-border">
                {auditTrail.map((a, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[18px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-primary/10" />
                    <div className="text-sm font-medium text-foreground">{a.action}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.when} · {a.actor}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
