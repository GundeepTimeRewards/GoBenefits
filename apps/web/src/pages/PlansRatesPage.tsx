import { Fragment, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  Plus, Eye, CheckCircle2, AlertCircle, AlertTriangle, ChevronDown, ChevronRight,
  ArrowLeft, FileText, DollarSign, Edit, FolderUp, ShieldCheck, Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusPill, LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useActivePlanYear, useActivePlanYearId } from "@/lib/plan-year-context";
import { useEmployer, useBenefitPlanDetail, usePlanCatalog, usePlanYears } from "@/lib/api";
import { AddPlanForm, ImportRatesForm, ContributionRuleForm, DuplicatePlanButton } from "@/components/plans/PlanMutationForms";
import { CopyFromPriorYearForm } from "@/components/plan-years/PlanYearForms";
import { PLAN_CATEGORIES, type BenefitPlanRow, type PlanCatalogRow } from "@/lib/mock/db";

const TONE: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-warning/20 text-warning-foreground border-warning/40",
  info: "bg-info/15 text-info border-info/30",
  muted: "bg-muted text-muted-foreground border-border",
};

function statusTone(status: string): "success" | "warning" | "info" | "danger" | "muted" {
  if (status === "Ready" || status === "Active") return "success";
  if (status === "Missing Rates" || status === "Missing Documents") return "danger";
  if (status === "Missing Contributions" || status === "Needs Attention") return "warning";
  if (status === "In Setup") return "info";
  return "muted";
}
function cfgBadge(label: string, kind: "rate" | "contribution" | "document") {
  let tone = "success";
  if (label === "Missing") tone = kind === "contribution" ? "warning" : "danger";
  else if (label === "Partial") tone = "warning";
  const display = kind === "document" && label === "Complete" ? "Ready" : label;
  return <Badge variant="outline" className={TONE[tone]}>{display}</Badge>;
}
function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className={`text-lg font-semibold tabular-nums ${value === 0 ? "text-muted-foreground" : tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Plans & Rates — plan-year-aware config & readiness workspace ─────────────
export function PlansRatesPage() {
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { data: employer } = useEmployer(employerId);
  const py = useActivePlanYear();
  const { data: catalog } = usePlanCatalog(employerId, planYearId);
  const { data: years = [] } = usePlanYears(employerId);
  const [cat, setCat] = useState<string>("All");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!employer || !py || !catalog) return <LoadingCard label="Loading plans & rates…" />;

  const { readOnly, summary: s } = catalog;
  const rows = cat === "All" ? catalog.rows : catalog.rows.filter((r) => r.benefitType === cat);
  const countFor = (c: string) => (c === "All" ? catalog.rows.length : catalog.rows.filter((r) => r.benefitType === c).length);
  const actionLabel = (r: PlanCatalogRow) => (readOnly ? "View" : r.launchBlocker || r.status.startsWith("Missing") || r.status === "Draft" ? "Configure" : "Review");

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        title="Plans & Rates"
        subtitle="Configure benefit plans, coverage tiers, rates, and employer contributions for the selected plan year."
        actions={readOnly ? undefined : (
          <>
            <AddPlanForm employerId={employerId} planYearId={planYearId} />
            <CopyFromPriorYearForm employerId={employerId} years={years} />
            <ImportRatesForm employerId={employerId} plans={catalog.rows.map((r) => ({ id: r.id, name: r.name }))} />
            <ContributionRuleForm employerId={employerId} />
          </>
        )}
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{employer.name} · {py.label}</span>
        {readOnly && <Badge variant="outline" className={TONE.muted}>Read-only archive</Badge>}
      </div>

      {/* Readiness summary (feeds Plan Year Setup + Enrollment Center) */}
      <Card className="border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Plan Readiness</CardTitle>
          {s.launchBlockers > 0
            ? <span className="text-xs text-destructive">{s.launchBlockers} plan{s.launchBlockers !== 1 ? "s" : ""} blocking enrollment launch</span>
            : <span className="text-xs text-success">No plans blocking launch</span>}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total Plans" value={s.total} tone="text-foreground" />
          <Stat label="Plans Ready" value={s.ready} tone="text-success" />
          <Stat label="Missing Rates" value={s.missingRates} tone="text-destructive" />
          <Stat label="Missing Contributions" value={s.missingContributions} tone="text-warning" />
          <Stat label="Missing Documents / SBCs" value={s.missingDocuments} tone="text-warning" />
          <Stat label="Launch Blockers" value={s.launchBlockers} tone="text-destructive" />
        </CardContent>
      </Card>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {PLAN_CATEGORIES.map((c) => {
          const n = countFor(c);
          return (
            <button key={c} onClick={() => setCat(c)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${cat === c ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>
              {c}{c !== "All" && n > 0 ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>

      {/* Plan table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Benefit Plans{cat !== "All" && <span className="ml-2 text-xs font-normal text-muted-foreground">· {cat}</span>}</CardTitle>
            <span className="text-xs text-muted-foreground">{rows.length} of {catalog.rows.length} plans</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Tiers</TableHead>
                <TableHead>Rates</TableHead>
                <TableHead>Contribution</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead className="text-center">Enrolled</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No plans in this category yet.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="mt-0.5 text-muted-foreground hover:text-foreground">
                          {expanded === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="min-w-0">
                          <Link to="/employers/$employerId/benefit-plans/$planId" params={{ employerId, planId: r.id }} className="font-medium text-primary hover:underline">{r.name}</Link>
                          <div className="text-[11px] text-muted-foreground">{r.carrier} · {r.subtype}</div>
                        </div>
                        {r.launchBlocker && <AlertTriangle className="ml-1 mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Launch blocker" />}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="bg-muted text-[11px] font-normal text-muted-foreground">{r.benefitType}</Badge></TableCell>
                    <TableCell><StatusPill label={r.status} tone={statusTone(r.status)} /></TableCell>
                    <TableCell className="text-center text-sm">{r.coverageTiers}</TableCell>
                    <TableCell>{cfgBadge(r.rateStatus, "rate")}</TableCell>
                    <TableCell>{cfgBadge(r.contributionStatus, "contribution")}</TableCell>
                    <TableCell>{cfgBadge(r.documentStatus, "document")}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{r.enrolled || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{actionLabel(r)}</Button>
                    </TableCell>
                  </TableRow>
                  {expanded === r.id && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/20 p-0">
                        <PlanRowDetail employerId={employerId} row={r} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This configures <span className="font-medium">benefit plans</span>, coverage tiers, plan rates, and employer contribution rules.
        Employee <span className="font-medium">elections</span> and active <span className="font-medium">coverage records</span> are separate.
      </p>
    </div>
  );
}

// Expandable row detail — read-only summary of rates, contribution, docs, eligibility.
function PlanRowDetail({ employerId, row }: { employerId: string; row: PlanCatalogRow }) {
  const planYearId = useActivePlanYearId();
  const { data: d } = useBenefitPlanDetail(employerId, row.id, planYearId);
  if (!d) return <div className="p-4 text-sm text-muted-foreground">Loading plan detail…</div>;
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium"><DollarSign className="h-4 w-4 text-primary" /> Rate Table</div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Tier</TableHead><TableHead className="text-right">EE Rate</TableHead><TableHead className="text-right">ER Contribution</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.rates.map((rt) => (
                <TableRow key={rt.tier}>
                  <TableCell className="text-sm font-medium">{rt.tier}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{rt.employee}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-success">{rt.employer}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{rt.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Employer Contribution Rule</div>
          <div className="mt-0.5 font-medium">{row.contributionRule}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Eligibility Classes</div>
          <div className="mt-0.5">{row.eligibleClasses}</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Required Documents</div>
          <div className="space-y-1">
            {d.documents.map((doc) => (
              <div key={doc.name} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{doc.name}</span>
                <span className="text-muted-foreground">{doc.type}</span>
              </div>
            ))}
          </div>
        </div>
        {row.warnings.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            {row.warnings.map((w) => <Badge key={w} variant="outline" className="border-warning/40 bg-card font-normal text-warning-foreground">{w}</Badge>)}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> Carrier export mapping: {row.documentStatus === "Missing" ? "Pending" : "Ready"} · Enrollment display: {row.status === "Ready" ? "Visible to employees" : "Hidden until ready"}
        </div>
        <DuplicatePlanButton employerId={employerId} planId={row.id} />
      </div>
    </div>
  );
}

// ── Plan detail — Benefits / Rates / Eligibility / Documents ────────────────
export function PlanDetailPage() {
  const employerId = useActiveEmployerId();
  const planYearId = useActivePlanYearId();
  const { planId } = useParams({ strict: false });
  const { data: employer } = useEmployer(employerId);
  const detail = useBenefitPlanDetail(employerId, planId ?? "", planYearId);

  if (detail.isPending || !employer) return <LoadingCard label="Loading plan…" />;
  const p = detail.data;

  if (!p) {
    return (
      <div className="mx-auto max-w-[700px] space-y-4">
        <Button asChild size="sm" variant="ghost"><Link to="/employers/$employerId/benefit-plans" params={{ employerId }}><ArrowLeft className="mr-1 h-4 w-4" />Plans & Rates</Link></Button>
        <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          <div className="text-lg font-semibold">Plan not found</div>
          <p className="max-w-sm text-sm text-muted-foreground">This plan isn't part of <span className="font-medium">{employer.name}</span>.</p>
        </CardContent></Card>
      </div>
    );
  }

  const summary: { label: string; value: string }[] = [
    { label: "Type", value: p.type },
    { label: "Network", value: p.network },
    { label: "Funding", value: p.fundingType },
    { label: "Effective", value: p.effective },
    { label: "Enrolled", value: String(p.enrolled) },
    { label: "Renewal", value: p.renewalDate },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <Link to="/employers/$employerId/benefit-plans" params={{ employerId }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Plans & Rates
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{p.name}</h1>
            <StatusPill label={p.status} tone={statusTone(p.status)} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{p.carrier} · {p.subtype} · {employer.name}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm"><Edit className="mr-1.5 h-4 w-4" />Edit Plan</Button>
          <Button variant="outline" size="sm"><DollarSign className="mr-1.5 h-4 w-4" />Manage Rates</Button>
          <Button variant="outline" size="sm"><FolderUp className="mr-1.5 h-4 w-4" />Upload Documents</Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map((s) => (
          <Card key={s.label}><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">{s.value}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* Setup issues banner */}
      {p.setupIssues.length > 0 && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <AlertCircle className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-warning-foreground">Setup incomplete:</span>
            {p.setupIssues.map((i) => <Badge key={i} variant="outline" className="border-warning/40 bg-card font-normal text-warning-foreground">{i}</Badge>)}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="benefits" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="benefits">Plan Benefits</TabsTrigger>
          <TabsTrigger value="rates">Rates</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility & Contributions</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* Benefits */}
        <TabsContent value="benefits">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Coverage Details</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Benefit</TableHead><TableHead>In-Network</TableHead><TableHead>Out-of-Network</TableHead></TableRow></TableHeader>
                <TableBody>
                  {p.benefits.map((b) => (
                    <TableRow key={b.label}>
                      <TableCell className="font-medium">{b.label}</TableCell>
                      <TableCell className="text-sm">{b.inNetwork}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.outNetwork}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rates */}
        <TabsContent value="rates">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><DollarSign className="h-4 w-4 text-primary" /> Monthly Rates by Coverage Tier</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Coverage Tier</TableHead><TableHead className="text-right">Total Premium</TableHead><TableHead className="text-right">Employer Pays</TableHead><TableHead className="text-right">Employee Pays</TableHead></TableRow></TableHeader>
                <TableBody>
                  {p.rates.map((r) => (
                    <TableRow key={r.tier}>
                      <TableCell className="font-medium">{r.tier}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{r.total}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-success">{r.employer}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{r.employee}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eligibility & Contributions */}
        <TabsContent value="eligibility" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Eligibility Rules</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Class</TableHead><TableHead>Waiting Period</TableHead><TableHead>Criteria</TableHead></TableRow></TableHeader>
                <TableBody>
                  {p.eligibility.map((e) => (
                    <TableRow key={e.class}><TableCell className="font-medium">{e.class}</TableCell><TableCell className="text-sm text-muted-foreground">{e.waiting}</TableCell><TableCell className="text-sm">{e.note}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Employer Contributions</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Tier</TableHead><TableHead className="text-right">Employer</TableHead><TableHead className="text-right">Employee</TableHead></TableRow></TableHeader>
                <TableBody>
                  {p.contributions.map((c) => (
                    <TableRow key={c.tier}><TableCell className="font-medium">{c.tier}</TableCell><TableCell className="text-right text-sm text-success">{c.employer}</TableCell><TableCell className="text-right text-sm">{c.employee}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Plan Documents</CardTitle>
              <Button variant="outline" size="sm"><Plus className="mr-1.5 h-4 w-4" />Upload Document</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Type</TableHead><TableHead>Effective</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {p.documents.map((d) => (
                    <TableRow key={d.name}>
                      <TableCell className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-muted-foreground" />{d.name}</TableCell>
                      <TableCell className="text-sm">{d.type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.date}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-primary"><Eye className="mr-1 h-4 w-4" />View</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// re-export for callers that import the row type alongside the page
export type { BenefitPlanRow };
