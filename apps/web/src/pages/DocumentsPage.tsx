import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import {
  FileText, ClipboardCheck, Heart, Users, Building2, ShieldAlert, Upload, FilePlus2,
  Download, Search, Eye, AlertTriangle, FileSignature, Stethoscope, Archive, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear, useActivePlanYearId } from "@/lib/plan-year-context";
import { useRole } from "@/lib/role-context";
import { useEmployer, useDocumentWorkspace, usePlanCatalog } from "@/lib/api";
import { UploadDocumentForm, RequestSignatureButton } from "@/components/documents/DocumentForms";
import { useGenerateConfirmations } from "@/lib/api/mutationHooks";
import type { DocStatus, DocCategoryName, DocRow, DocReadinessTone } from "@/lib/mock/db";

type Icon = ComponentType<{ className?: string }>;

const TONE: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-warning/20 text-warning-foreground border-warning/40",
  info: "bg-info/15 text-info border-info/30",
  teal: "bg-teal/15 text-teal-foreground border-teal/30",
  muted: "bg-muted text-muted-foreground border-border",
};
const docStatusTone: Record<DocStatus, keyof typeof TONE> = {
  Published: "success", Generated: "teal", "Pending Employee Action": "info",
  Pending: "warning", "Expiring Soon": "warning", Missing: "danger", Draft: "muted", Archived: "muted",
};
const priorityTone: Record<string, keyof typeof TONE> = { High: "danger", Medium: "warning", Low: "info" };
const issueToneKey: Record<DocReadinessTone, keyof typeof TONE> = { danger: "danger", warning: "warning", info: "info", success: "success" };

const CATEGORY_META: Record<DocCategoryName, { desc: string; icon: Icon; tone: string }> = {
  "Plan Documents": { desc: "SBCs, summaries, brochures", icon: FileText, tone: "bg-primary/10 text-primary" },
  "Employee Forms": { desc: "Enrollment forms, confirmations", icon: ClipboardCheck, tone: "bg-info/15 text-info" },
  "EOI Forms": { desc: "Evidence of insurability", icon: Heart, tone: "bg-warning/15 text-warning" },
  "Dependent Verification": { desc: "Marriage, birth, affidavits", icon: Users, tone: "bg-warning/15 text-warning" },
  "Employer Forms": { desc: "Application, binder, setup", icon: Building2, tone: "bg-teal/15 text-teal-foreground" },
  "Compliance Notices": { desc: "ACA & plan notices, audit", icon: ShieldAlert, tone: "bg-success/15 text-success" },
};

function coverageIcon(c: string): Icon {
  if (c.includes("Medical")) return Stethoscope;
  if (c.includes("Vision")) return Eye;
  if (c.includes("Life")) return Heart;
  return FileText;
}

function applyIssue(rows: DocRow[], key: string | null): DocRow[] {
  if (!key) return rows;
  switch (key) {
    case "missing-sbc": return rows.filter((r) => r.status === "Missing" && (r.type === "SBC" || r.type === "Plan Summary"));
    case "missing-brochure": return rows.filter((r) => r.status === "Missing" && r.type === "Carrier Brochure");
    case "eoi": return rows.filter((r) => r.category === "EOI Forms");
    case "verification": return rows.filter((r) => r.category === "Dependent Verification");
    case "employer-app": return rows.filter((r) => r.category === "Employer Forms");
    case "expiring": return rows.filter((r) => r.status === "Expiring Soon");
    default: return rows;
  }
}

function Sel({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: string[] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-md border bg-background px-2 text-sm ${value !== "all" ? "border-primary/50 text-foreground" : "border-input text-muted-foreground"}`}>
      {options.map((o) => <option key={o} value={o === label ? "all" : o}>{o}</option>)}
    </select>
  );
}

export function DocumentsPage() {
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  const { data: ws } = useDocumentWorkspace(employerId, planYearId);
  const { data: catalog } = usePlanCatalog(employerId, planYearId);
  const { role } = useRole();

  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [carrier, setCarrier] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState<DocCategoryName | null>(null);
  const [issue, setIssue] = useState<string | null>(null);

  const docs = ws?.docs ?? [];
  const types = useMemo(() => ["Type", ...Array.from(new Set(docs.map((d) => d.type)))], [docs]);
  const coverages = useMemo(() => ["Coverage", ...Array.from(new Set(docs.map((d) => d.coverage)))], [docs]);
  const carriers = useMemo(() => ["Carrier", ...Array.from(new Set(docs.map((d) => d.carrier)))], [docs]);
  const statuses = useMemo(() => ["Status", ...Array.from(new Set(docs.map((d) => d.status)))], [docs]);

  const visible = useMemo(() => {
    let rows = docs;
    if (category) rows = rows.filter((r) => r.category === category);
    rows = applyIssue(rows, issue);
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (!q || r.name.toLowerCase().includes(q) || r.related.toLowerCase().includes(q)) &&
      (type === "all" || r.type === type) &&
      (coverage === "all" || r.coverage === coverage) &&
      (carrier === "all" || r.carrier === carrier) &&
      (status === "all" || r.status === status));
  }, [docs, category, issue, search, type, coverage, carrier, status]);

  if (!employer || !py || !ws) return <LoadingCard label="Loading documents…" />;

  const brokerView = role === "broker" || role === "agency_admin";
  const tasks = brokerView ? ws.tasks.filter((t) => t.area !== "payroll") : ws.tasks;
  const filtersActive = !!category || !!issue || search !== "" || [type, coverage, carrier, status].some((v) => v !== "all");
  function clearFilters() { setCategory(null); setIssue(null); setSearch(""); setType("all"); setCoverage("all"); setCarrier("all"); setStatus("all"); }
  const planYearStatusLabel = py.status === "Setup" ? "In Setup" : py.status === "OpenEnrollment" ? "Open Enrollment" : py.status;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">Documents &amp; Forms</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">Plan documents, employee forms, EOI, verification, and compliance records for the selected plan year.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{employer.name} · {py.label}</span>
            <StatusPill label={planYearStatusLabel} tone={py.status === "OpenEnrollment" ? "info" : py.status === "Active" ? "success" : py.status === "Archived" ? "muted" : "warning"} />
            {ws.readOnly && <Badge variant="outline" className={TONE.muted}>Read-only archive</Badge>}
          </div>
        </div>
        {!ws.readOnly && (
          <div className="flex flex-wrap gap-2">
            <UploadDocumentForm employerId={employerId} planYearId={planYearId} plans={(catalog?.rows ?? []).map((r) => ({ id: r.id, name: r.name }))} />
            <GenerateConfirmationsButton employerId={employerId} />
          </div>
        )}
      </div>

      {/* Readiness + Tasks */}
      {!ws.readOnly && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div>
                <CardTitle className="text-base">Document Readiness</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{ws.readinessPercent}% ready · {ws.missingCount} missing · {ws.employeeActionCount} employee actions · {ws.expiringSoonCount} expiring soon</p>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-semibold ${ws.readinessPercent >= 90 ? "text-success" : ws.readinessPercent >= 60 ? "text-warning" : "text-destructive"}`}>{ws.readinessPercent}%</div>
                <div className="text-[11px] text-muted-foreground">Overall ready</div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={ws.readinessPercent} className="h-2" />
              {ws.issues.length === 0 ? (
                <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">All required documents are in place for {py.label}.</div>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ws.issues.map((i) => {
                    const active = issue === i.key;
                    return (
                      <button key={i.key} type="button" onClick={() => { setIssue(active ? null : i.key); setCategory(null); }}
                        className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-left transition hover:bg-muted/40 ${active ? "border-primary bg-primary/5" : "bg-muted/20"}`}>
                        <span className="text-sm">{i.label}</span>
                        <Badge variant="outline" className={TONE[issueToneKey[i.tone]]}>{i.count}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Document Tasks</CardTitle>
                <span className="text-[11px] text-muted-foreground">{tasks.length} open</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {tasks.length === 0 && <p className="text-sm text-muted-foreground">No open document tasks.</p>}
              {tasks.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{t.related}</div>
                  </div>
                  <StatusPill label={t.priority} tone={priorityTone[t.priority]} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Categories */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Document Categories</h2>
          {filtersActive && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}><X className="mr-1 h-3 w-3" />Clear filter</Button>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {ws.categories.map((c) => {
            const meta = CATEGORY_META[c.title] ?? { desc: c.sub, icon: FileText, tone: "bg-muted text-muted-foreground" };
            const active = category === c.title;
            return (
              <button key={c.title} type="button" onClick={() => { setCategory(active ? null : c.title); setIssue(null); }}
                className={`rounded-lg border p-3 text-left transition hover:bg-muted/40 ${active ? "border-primary bg-primary/5" : "bg-card"}`}>
                <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md ${meta.tone}`}><meta.icon className="h-3.5 w-3.5" /></div>
                <div className="text-sm font-medium leading-tight">{c.title}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{c.total} document{c.total !== 1 ? "s" : ""}</div>
                <div className="text-[11px] text-muted-foreground">{c.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Library */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-base">Document Library{category && <span className="ml-2 text-xs font-normal text-muted-foreground">· {category}</span>}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{visible.length} of {docs.length} documents</p>
            </div>
            <Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />Export</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-8" />
            </div>
            <Sel value={type} onChange={setType} label="Type" options={types} />
            <Sel value={coverage} onChange={setCoverage} label="Coverage" options={coverages} />
            <Sel value={carrier} onChange={setCarrier} label="Carrier" options={carriers} />
            <Sel value={status} onChange={setStatus} label="Status" options={statuses} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Related To</TableHead>
                <TableHead>Required For</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No documents match the current filter.</TableCell></TableRow>
              )}
              {visible.map((d) => {
                const CovIcon = coverageIcon(d.coverage);
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="grid h-7 w-7 place-items-center rounded-md bg-muted text-muted-foreground"><CovIcon className="h-3.5 w-3.5" /></div>
                        <div className="min-w-0">
                          <div className="font-medium">{d.name}</div>
                          <div className="text-[11px] text-muted-foreground">{d.coverage} · {d.carrier}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.category}</TableCell>
                    <TableCell className="text-sm">{d.related}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.requiredFor}</TableCell>
                    <TableCell><Badge variant="outline" className={TONE[docStatusTone[d.status]]}>{d.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.expires}</TableCell>
                    <TableCell className="text-right">
                      {!ws.readOnly && (d.status === "Published" || d.status === "Generated") ? (
                        <RequestSignatureButton employerId={employerId} documentId={d.id} />
                      ) : (
                        <Button variant="ghost" size="sm" className="h-8 text-primary"><Eye className="mr-1 h-3.5 w-3.5" />View</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Footer links (placeholders) */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><FileSignature className="h-4 w-4" />Confirmations, signatures, and audit history are tracked per plan year.</div>
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs">Signature tracking →</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs">Confirmation generator →</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs"><Archive className="mr-1 h-3.5 w-3.5" />Audit history →</Button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Live confirmation generation (Phase E-6): one confirmation doc + signature request
// per approved-election employee (idempotent server-side). Mock mode no-ops.
function GenerateConfirmationsButton({ employerId }: { employerId: string }) {
  const planYearId = useActivePlanYearId();
  const m = useGenerateConfirmations(employerId);
  const status = m.data?.live
    ? (m.data.data as { generateConfirmations?: { status?: string } })?.generateConfirmations?.status
    : null;
  return (
    <span className="inline-flex items-center gap-2">
      {status && <span className="text-xs text-success">{status}</span>}
      {m.error && <span className="text-xs text-destructive">{m.error.message}</span>}
      <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ planYearId })}>
        <FilePlus2 className="mr-1.5 h-4 w-4" />{m.isPending ? "Generating…" : "Generate Confirmations"}
      </Button>
    </span>
  );
}
