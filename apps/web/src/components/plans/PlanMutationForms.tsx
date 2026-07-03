// Plans & Rates mutation forms (Phase D-6b). Wires the Plans & Rates page's
// placeholder header buttons — Add Plan, Import Rates, contribution editing — plus a
// per-plan Duplicate action, to the D-6 mutations. Same conventions as the census
// C1MutationForms: intentionally small inline panels from existing ui primitives,
// gated by the data source (mock mode = no-op with note), typed form errors,
// invalidation inside the hooks.
import { useState } from "react";
import { Copy, DollarSign, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveDataSource } from "@/lib/api/dataSource";
import {
  useAddPlan,
  useDuplicatePlan,
  useImportRates,
  useUpdateContributionRule,
  type FormMutationError,
} from "@/lib/api/mutationHooks";
import type { RateBandInput } from "@/lib/api/operations";

function MockNote({ op, employerId }: { op: string; employerId: string }) {
  if (resolveDataSource(op, employerId) === "live") return null;
  return (
    <p className="text-xs text-muted-foreground">
      Mock mode: not persisted. Enable hybrid live mode + select a live employer to save for real.
    </p>
  );
}

function ErrText({ error }: { error: FormMutationError | null }) {
  if (!error) return null;
  const prefix = error.type === "validation" ? "" : error.type === "unauthorized" ? "Not permitted: " : "Error: ";
  return <p className="text-xs text-destructive">{prefix}{error.message}</p>;
}

// CoverageLine enum values (api/schema.graphql) with display labels.
const COVERAGE_LINES: { value: string; label: string }[] = [
  { value: "medical", label: "Medical" },
  { value: "dental", label: "Dental" },
  { value: "vision", label: "Vision" },
  { value: "rx", label: "Rx" },
  { value: "basic_life", label: "Basic Life" },
  { value: "vol_life", label: "Voluntary Life" },
  { value: "std", label: "Short-Term Disability" },
  { value: "ltd", label: "Long-Term Disability" },
  { value: "accident", label: "Accident" },
  { value: "critical_illness", label: "Critical Illness" },
  { value: "hospital", label: "Hospital Indemnity" },
];

// --- Add Plan --------------------------------------------------------------------
export function AddPlanForm({ employerId, planYearId }: { employerId: string; planYearId: string }) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState("medical");
  const [planName, setName] = useState("");
  const [carrierName, setCarrier] = useState("");
  const m = useAddPlan(employerId);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />Add Plan
      </Button>
    );
  }
  return (
    <div className="w-full max-w-md space-y-2 rounded-md border border-border bg-card p-3 text-left">
      <div className="text-sm font-medium">Add Plan</div>
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={line} onChange={(e) => setLine(e.target.value)}>
          {COVERAGE_LINES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <Input placeholder="Carrier (optional)" value={carrierName} onChange={(e) => setCarrier(e.target.value)} />
        <Input className="col-span-2" placeholder="Plan name" value={planName} onChange={(e) => setName(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">Created as a draft — add rates and documents before launch.</p>
      <MockNote op="addPlan" employerId={employerId} />
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || !planName.trim()} onClick={() => m.mutate(
          { planYearId, line, planName: planName.trim(), carrierName: carrierName.trim() || undefined },
          { onSuccess: () => { setOpen(false); setName(""); setCarrier(""); } }
        )}>{m.isPending ? "Creating…" : "Create Draft Plan"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}

// --- Duplicate (per-plan action) ---------------------------------------------------
export function DuplicatePlanButton({ employerId, planId, disabled }: { employerId: string; planId: string; disabled?: boolean }) {
  const m = useDuplicatePlan(employerId);
  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" disabled={disabled || m.isPending} onClick={() => m.mutate({ planId })}>
        <Copy className="mr-1.5 h-3.5 w-3.5" />{m.isPending ? "Duplicating…" : "Duplicate Plan"}
      </Button>
      <ErrText error={m.error} />
    </div>
  );
}

/**
 * Parse the rate-band textarea: one band per line, comma-separated
 * `age, ee, spouse, child, family` — age blank or "-" = composite band; tiers
 * beyond EE are optional. Returns bands or a per-line error message.
 */
export function parseRateBands(text: string): { rows?: RateBandInput[]; error?: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "Enter at least one rate row" };
  const rows: RateBandInput[] = [];
  for (const [i, lineText] of lines.entries()) {
    const parts = lineText.split(",").map((p) => p.trim());
    const [ageRaw, eeRaw, spouseRaw, childRaw, familyRaw] = parts;
    const age = !ageRaw || ageRaw === "-" ? null : Number(ageRaw);
    if (age != null && (!Number.isInteger(age) || age < 0 || age > 120)) return { error: `Line ${i + 1}: bad age "${ageRaw}"` };
    const num = (raw: string | undefined, label: string): number | null | string => {
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : `Line ${i + 1}: bad ${label} "${raw}"`;
    };
    const rateEe = num(eeRaw, "EE rate");
    if (rateEe == null) return { error: `Line ${i + 1}: EE rate is required` };
    if (typeof rateEe === "string") return { error: rateEe };
    const optional = { rateEeSpouse: num(spouseRaw, "spouse rate"), rateEeChild: num(childRaw, "child rate"), rateFamily: num(familyRaw, "family rate") };
    for (const v of Object.values(optional)) if (typeof v === "string") return { error: v };
    rows.push({ age, rateEe, ...(optional as { rateEeSpouse: number | null; rateEeChild: number | null; rateFamily: number | null }) });
  }
  return { rows };
}

// --- Import Rates ------------------------------------------------------------------
export function ImportRatesForm({
  employerId,
  plans,
}: {
  employerId: string;
  plans: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const [effectiveDate, setDate] = useState("");
  const [bandsText, setBands] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const m = useImportRates(employerId);
  const selectedPlanId = planId || plans[0]?.id || "";

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={plans.length === 0}>
        <Upload className="mr-1.5 h-4 w-4" />Import Rates
      </Button>
    );
  }
  const submit = () => {
    const parsed = parseRateBands(bandsText);
    if (parsed.error || !parsed.rows) { setParseError(parsed.error ?? "Invalid rows"); return; }
    setParseError(null);
    m.mutate(
      { planId: selectedPlanId, input: { effectiveDate, rows: parsed.rows } },
      { onSuccess: () => { setOpen(false); setBands(""); setDate(""); } }
    );
  };
  return (
    <div className="w-full max-w-lg space-y-2 rounded-md border border-border bg-card p-3 text-left">
      <div className="text-sm font-medium">Import Rates</div>
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={selectedPlanId} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Input placeholder="Effective date (YYYY-MM-DD)" value={effectiveDate} onChange={(e) => setDate(e.target.value)} />
      </div>
      <textarea
        className="h-28 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        placeholder={"One band per line: age, EE, spouse, child, family\nBlank age or \"-\" = composite (non-age-banded)\ne.g.\n-, 612, 1285, 1150, 1835\n25, 300.50, 650, 580, 940"}
        value={bandsText}
        onChange={(e) => setBands(e.target.value)}
      />
      <p className="text-xs text-warning-foreground">
        Replaces this plan's ENTIRE rate table with the imported bands at the given effective date.
      </p>
      <MockNote op="importRates" employerId={employerId} />
      {parseError && <p className="text-xs text-destructive">{parseError}</p>}
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || !selectedPlanId || !effectiveDate.trim() || !bandsText.trim()} onClick={submit}>
          {m.isPending ? "Importing…" : "Import (Replace Table)"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); setParseError(null); }}>Cancel</Button>
      </div>
    </div>
  );
}

// --- Contribution rule editor --------------------------------------------------------
const PCT_FIELDS = [
  ["pctEmployeeHealth", "EE Health %"],
  ["pctEmployeeDental", "EE Dental %"],
  ["pctEmployeeVision", "EE Vision %"],
  ["pctDependentHealth", "Dep Health %"],
  ["pctDependentDental", "Dep Dental %"],
  ["pctDependentVision", "Dep Vision %"],
] as const;

export function ContributionRuleForm({ employerId }: { employerId: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const m = useUpdateContributionRule(employerId);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <DollarSign className="mr-1.5 h-4 w-4" />Contributions
      </Button>
    );
  }
  const patch: Record<string, number> = {};
  let invalid = false;
  for (const [field] of PCT_FIELDS) {
    const raw = values[field]?.trim();
    if (!raw) continue; // blank = keep current value
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) { invalid = true; continue; }
    patch[field] = n;
  }
  return (
    <div className="w-full max-w-md space-y-2 rounded-md border border-border bg-card p-3 text-left">
      <div className="text-sm font-medium">Employer Contribution Rule</div>
      <div className="grid grid-cols-3 gap-2">
        {PCT_FIELDS.map(([field, label]) => (
          <label key={field} className="space-y-1 text-[11px] text-muted-foreground">
            {label}
            <Input inputMode="decimal" placeholder="—" value={values[field] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))} />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Percent the employer pays per line (0–100). Blank fields keep their current value. Drives per-paycheck deductions.
      </p>
      <MockNote op="updateContributionRule" employerId={employerId} />
      {invalid && <p className="text-xs text-destructive">Percentages must be between 0 and 100</p>}
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || invalid || Object.keys(patch).length === 0} onClick={() => m.mutate(patch, { onSuccess: () => { setOpen(false); setValues({}); } })}>
          {m.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}
