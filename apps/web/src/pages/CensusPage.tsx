import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserPlus, Upload, Search, AlertCircle, Eye, Users, UserCheck, FileWarning, Filter, X, SlidersHorizontal, ShieldCheck } from "lucide-react";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useEmployer, useCensus, useCensusContext } from "@/lib/api";
import { LoadingCard, ErrorCard, KpiRow } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CensusHealth } from "@/components/census/CensusHealth";
import { AddEmployeeForm } from "@/components/census/C1MutationForms";
import { employmentStatusLabel, employeeIssues, type CensusEmployee } from "@/lib/census-mock";

function statusTone(label: string): string {
  if (label === "Terminated") return "bg-muted text-muted-foreground border-border";
  if (label === "New Hire") return "bg-teal/15 text-teal-foreground border-teal/30";
  if (label === "COBRA" || label === "On Leave" || label === "Retired") return "bg-warning/15 text-warning-foreground border-warning/30";
  return "bg-success/15 text-success border-success/30";
}

function eligibilityBadge(e: CensusEmployee) {
  if (e.eligibilityStatus === true) return { label: "Eligible", cls: "bg-success/15 text-success border-success/30" };
  if (e.eligibilityStatus === false) return { label: "Ineligible", cls: "bg-muted text-muted-foreground border-border" };
  return { label: "Pending", cls: "bg-warning/20 text-warning-foreground border-warning/40" };
}

// Quick-filter chips — each is a functional predicate over a census row.
const QUICK_CHIPS: { key: string; label: string; match: (e: CensusEmployee) => boolean }[] = [
  { key: "missing", label: "Missing Data", match: (e) => employeeIssues(e).length > 0 },
  { key: "newhire", label: "New Hires", match: (e) => employmentStatusLabel(e) === "New Hire" },
  { key: "review", label: "Needs Review", match: (e) => e.eligibilityStatus === null },
  { key: "cobra", label: "COBRA", match: (e) => e.employmentStatus === "cobra" },
];

// Native-select filter styled to match the top-bar controls, with a leading Filter icon.
function FilterSelect({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 rounded-md border bg-background pl-8 pr-7 text-sm ${value !== "all" ? "border-primary/50 text-foreground" : "border-input text-muted-foreground"}`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function CensusPage() {
  const employerId = useActiveEmployerId();
  const { data: employer } = useEmployer(employerId);
  const { data: ctx } = useCensusContext(employerId);
  const census = useCensus(employerId);
  const [search, setSearch] = useState("");
  const [empStatus, setEmpStatus] = useState("all");
  const [elig, setElig] = useState("all");
  const [missing, setMissing] = useState("all");
  const [chips, setChips] = useState<string[]>([]);
  const q = search.trim().toLowerCase();

  if (census.isPending || !employer || !ctx) return <LoadingCard label="Loading census…" />;
  if (census.isError) return <ErrorCard message="Could not load the employee census." />;

  const total = census.data.length;
  const filtersActive = empStatus !== "all" || elig !== "all" || missing !== "all" || chips.length > 0 || q !== "";
  function clearFilters() { setSearch(""); setEmpStatus("all"); setElig("all"); setMissing("all"); setChips([]); }
  function toggleChip(key: string) { setChips((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key])); }

  const rows = census.data.filter((e) => {
    if (q && !(
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      (e.employeeNumber ?? "").toLowerCase().includes(q) ||
      (e.email ?? "").toLowerCase().includes(q)
    )) return false;
    if (empStatus !== "all" && employmentStatusLabel(e) !== empStatus) return false;
    if (elig === "eligible" && e.eligibilityStatus !== true) return false;
    if (elig === "ineligible" && e.eligibilityStatus !== false) return false;
    if (elig === "pending" && e.eligibilityStatus !== null) return false;
    const issues = employeeIssues(e);
    if (missing === "email" && !issues.includes("Missing email")) return false;
    if (missing === "class" && !issues.includes("Missing eligibility class")) return false;
    if (missing === "eligibility" && !issues.includes("Eligibility not determined")) return false;
    for (const key of chips) {
      const chip = QUICK_CHIPS.find((c) => c.key === key);
      if (chip && !chip.match(e)) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">Employee Census</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Manage employees, dependents, eligibility data, and enrollment readiness for the selected plan year.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/5"><ShieldCheck className="mr-2 h-4 w-4" />Run Eligibility Preview</Button>
          <Button size="sm" variant="secondary"><Upload className="mr-2 h-4 w-4" />Import</Button>
          <AddEmployeeForm employerId={employerId} trigger={<Button size="sm"><UserPlus className="mr-2 h-4 w-4" />Add Employee</Button>} />
        </div>
      </div>

      <KpiRow items={[
        { label: "Total Employees", value: ctx.totalEmployees, icon: Users },
        { label: "Active", value: ctx.activeEmployees, tone: "text-success", icon: UserCheck, iconClass: "bg-success/10 text-success" },
        { label: "Missing Required", value: ctx.missingRequiredCount, tone: "text-warning", icon: FileWarning, iconClass: "bg-warning/15 text-warning" },
        { label: "Needs Review", value: ctx.needsReviewCount, tone: "text-warning", icon: AlertCircle, iconClass: "bg-warning/15 text-warning" },
      ]} />

      <CensusHealth ctx={ctx} />

      <Card>
        <CardHeader className="space-y-3 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Employees</CardTitle>
            <span className="text-xs text-muted-foreground">{rows.length} of {total} shown</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
            </div>
            <FilterSelect value={empStatus} onChange={setEmpStatus} label="Employment Status" options={[
              { value: "all", label: "Employment Status" },
              { value: "Active", label: "Active" },
              { value: "New Hire", label: "New Hire" },
              { value: "Terminated", label: "Terminated" },
              { value: "COBRA", label: "COBRA" },
              { value: "On Leave", label: "On Leave" },
              { value: "Retired", label: "Retired" },
            ]} />
            <FilterSelect value={elig} onChange={setElig} label="Eligibility" options={[
              { value: "all", label: "Eligibility" },
              { value: "eligible", label: "Eligible" },
              { value: "ineligible", label: "Ineligible" },
              { value: "pending", label: "Pending" },
            ]} />
            <FilterSelect value={missing} onChange={setMissing} label="Missing Data" options={[
              { value: "all", label: "Missing Data" },
              { value: "email", label: "Missing Email" },
              { value: "class", label: "Missing Class" },
              { value: "eligibility", label: "Eligibility Undetermined" },
            ]} />
            <Button variant="outline" size="sm" className="h-9">
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />Advanced Filters
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Quick filters:</span>
            {QUICK_CHIPS.map((chip) => {
              const active = chips.includes(chip.key);
              return (
                <button
                  key={chip.key}
                  onClick={() => toggleChip(chip.key)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {chip.label}
                  {active && <X className="h-3 w-3" />}
                </button>
              );
            })}
            {filtersActive && (
              <button onClick={clearFilters} className="ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="border-t p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hire Date</TableHead>
                <TableHead>Eligibility Class</TableHead>
                <TableHead>Eligibility</TableHead>
                <TableHead className="text-center">Dependents</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    No employees match the current filters.{" "}
                    <button onClick={clearFilters} className="font-medium text-primary hover:underline">Clear filters</button>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((e) => {
                const statusLabel = employmentStatusLabel(e);
                const elig = eligibilityBadge(e);
                const issues = employeeIssues(e);
                return (
                  <TableRow key={e.employeeId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.employeeNumber ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{e.firstName} {e.lastName}</div>
                      <div className="text-xs text-muted-foreground">{e.email ?? "No email"}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={statusTone(statusLabel)}>{statusLabel}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.hireDate ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.eligibilityClass ?? <span className="text-warning">Missing</span>}</TableCell>
                    <TableCell><Badge variant="outline" className={elig.cls}>{elig.label}</Badge></TableCell>
                    <TableCell className="text-center text-sm">{e.dependentCount}</TableCell>
                    <TableCell>
                      {issues.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-warning/40 bg-warning/15 text-[10px] text-warning-foreground">
                          <AlertCircle className="h-3 w-3" />{issues.length}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                        <Link to="/employers/$employerId/employees/$employeeId" params={{ employerId, employeeId: e.employeeId }}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
