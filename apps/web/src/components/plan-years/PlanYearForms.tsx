// Plan-year lifecycle forms (Phase D-5b). Wires the Plan Years page's placeholder
// header buttons — "New Plan Year" and "Copy From Prior Year" — to the D-5 mutations.
// Same conventions as the census C1MutationForms: intentionally small inline panels
// built from existing ui primitives, gated by the data source (mock mode is a no-op
// with a note), typed form errors, invalidation handled inside the hooks.
import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveDataSource } from "@/lib/api/dataSource";
import { useCreatePlanYear, useCopyFromPriorYear, type FormMutationError } from "@/lib/api/mutationHooks";
import type { PlanYearRow } from "@/lib/mock/db";

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

/** 4-digit year or null — inputs stay strings until submit. */
function parseYear(v: string): number | null {
  const n = Number(v.trim());
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

// --- New Plan Year -------------------------------------------------------------
export function NewPlanYearForm({ employerId }: { employerId: string }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");
  const [label, setLabel] = useState("");
  const m = useCreatePlanYear(employerId);
  const parsedYear = parseYear(year);

  if (!open) {
    return (
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New Plan Year
      </Button>
    );
  }
  return (
    <div className="w-full max-w-md space-y-2 rounded-md border border-border bg-card p-3">
      <div className="text-sm font-medium">New Plan Year</div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Year (e.g. 2027)"
          inputMode="numeric"
          value={year}
          onChange={(ev) => {
            setYear(ev.target.value);
            if (!label || label === labelFor(parseYear(year))) setLabel(labelFor(parseYear(ev.target.value)));
          }}
        />
        <Input placeholder="Label (e.g. PY 2027)" value={label} onChange={(ev) => setLabel(ev.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Starts in Setup with a calendar-year coverage period. Add plans manually, or use Copy From Prior Year instead to renew.
      </p>
      <MockNote op="createPlanYear" employerId={employerId} />
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={m.isPending || parsedYear == null || !label.trim()}
          onClick={() =>
            m.mutate(
              { year: parsedYear!, label: label.trim() },
              { onSuccess: () => { setOpen(false); setYear(""); setLabel(""); } }
            )
          }
        >
          {m.isPending ? "Creating…" : "Create"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}

function labelFor(year: number | null): string {
  return year == null ? "" : `PY ${year}`;
}

// --- Copy From Prior Year (renewal) ---------------------------------------------
export function CopyFromPriorYearForm({ employerId, years }: { employerId: string; years: PlanYearRow[] }) {
  const [open, setOpen] = useState(false);
  const [fromPlanYearId, setFrom] = useState("");
  const [toYear, setToYear] = useState("");
  const m = useCopyFromPriorYear(employerId);
  const parsedToYear = parseYear(toYear);
  // Default the source to the newest non-archived year (typically the active one).
  const defaultSource = years.find((y) => y.status !== "Archived") ?? years[0];
  const sourceId = fromPlanYearId || defaultSource?.id || "";

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)} disabled={years.length === 0}>
        <Copy className="h-4 w-4" /> Copy From Prior Year
      </Button>
    );
  }
  return (
    <div className="w-full max-w-md space-y-2 rounded-md border border-border bg-card p-3">
      <div className="text-sm font-medium">Copy From Prior Year</div>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={sourceId}
          onChange={(ev) => setFrom(ev.target.value)}
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>{y.label}</option>
          ))}
        </select>
        <Input placeholder="New year (e.g. 2027)" inputMode="numeric" value={toYear} onChange={(ev) => setToYear(ev.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Copies the source year's plans, options, and rates into a new year in Setup. Copied plans
        come back as drafts to review — update rates and confirm before launch.
      </p>
      <MockNote op="copyFromPriorYear" employerId={employerId} />
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={m.isPending || parsedToYear == null || !sourceId}
          onClick={() =>
            m.mutate(
              { fromPlanYearId: sourceId, toYear: parsedToYear! },
              { onSuccess: () => { setOpen(false); setFrom(""); setToYear(""); } }
            )
          }
        >
          {m.isPending ? "Copying…" : "Copy Forward"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}
