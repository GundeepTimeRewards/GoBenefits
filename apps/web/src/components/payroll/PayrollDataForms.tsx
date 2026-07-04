// Payroll data mutation forms (FE-polish). Wires the Payroll Data page's placeholder
// header actions — Import Payroll Data, Run Lookback, Sync Provider — to the E-5
// backend. Same conventions as the other mutation forms: inline panels, data-source
// gate (mock = no-op with note), typed errors, invalidation inside the hooks.
import { useState } from "react";
import { Upload, Calculator, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveDataSource } from "@/lib/api/dataSource";
import { useImportPayrollData, useRunAcaLookback, useSyncPayrollProvider, type FormMutationError } from "@/lib/api/mutationHooks";
import type { PayrollRowInput } from "@/lib/api/operations";

function MockNote({ op, employerId }: { op: string; employerId: string }) {
  if (resolveDataSource(op, employerId) === "live") return null;
  return <p className="text-xs text-muted-foreground">Mock mode: not persisted. Enable hybrid live mode + select a live employer to save for real.</p>;
}
function ErrText({ error }: { error: FormMutationError | null }) {
  if (!error) return null;
  const prefix = error.type === "validation" ? "" : error.type === "unauthorized" ? "Not permitted: " : "Error: ";
  return <p className="text-xs text-destructive">{prefix}{error.message}</p>;
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the import textarea: one employee per line, `employeeNumber, hours[, wages]`.
 * Employee number is the census match key; wages optional.
 */
export function parsePayrollRows(text: string): { rows?: PayrollRowInput[]; error?: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "Enter at least one payroll row" };
  const rows: PayrollRowInput[] = [];
  for (const [i, line] of lines.entries()) {
    const [num, hoursRaw, wagesRaw] = line.split(",").map((p) => p.trim());
    if (!num) return { error: `Line ${i + 1}: employee number is required` };
    const hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || hours < 0 || hours > 1000) return { error: `Line ${i + 1}: bad hours "${hoursRaw}"` };
    const row: PayrollRowInput = { employeeNumber: num, hours };
    if (wagesRaw) {
      const wages = Number(wagesRaw);
      if (!Number.isFinite(wages) || wages < 0) return { error: `Line ${i + 1}: bad wages "${wagesRaw}"` };
      row.wages = wages;
    }
    rows.push(row);
  }
  return { rows };
}

export function ImportPayrollForm({ employerId }: { employerId: string }) {
  const [open, setOpen] = useState(false);
  const [periodStart, setStart] = useState("");
  const [periodEnd, setEnd] = useState("");
  const [rowsText, setRows] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const m = useImportPayrollData(employerId);
  const status = m.data?.live ? (m.data.data as { importPayrollData?: { status?: string } })?.importPayrollData?.status : null;

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        {status && <span className="text-xs text-success">{status}</span>}
        <Button size="sm" onClick={() => setOpen(true)}><Upload className="mr-1.5 h-4 w-4" />Import Payroll Data</Button>
      </span>
    );
  }
  const submit = () => {
    if (!ISO.test(periodStart) || !ISO.test(periodEnd)) { setParseError("Period start/end must be YYYY-MM-DD"); return; }
    const parsed = parsePayrollRows(rowsText);
    if (parsed.error || !parsed.rows) { setParseError(parsed.error ?? "Invalid rows"); return; }
    setParseError(null);
    m.mutate({ input: { source: "csv", periodStart, periodEnd, rows: parsed.rows } },
      { onSuccess: () => { setOpen(false); setRows(""); setStart(""); setEnd(""); } });
  };
  return (
    <div className="w-full max-w-lg space-y-2 rounded-md border border-border bg-card p-3 text-left">
      <div className="text-sm font-medium">Import Payroll Data</div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Period start (YYYY-MM-DD)" value={periodStart} onChange={(e) => setStart(e.target.value)} />
        <Input placeholder="Period end (YYYY-MM-DD)" value={periodEnd} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <textarea
        className="h-28 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        placeholder={"One employee per line: employeeNumber, hours, wages\nwages optional; matched to census by number\ne.g.\nEMP-1001, 173.33, 7500\nEMP-1002, 160, 6200"}
        value={rowsText}
        onChange={(e) => setRows(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">Rows with no census match are staged and counted — never dropped.</p>
      <MockNote op="importPayrollData" employerId={employerId} />
      {parseError && <p className="text-xs text-destructive">{parseError}</p>}
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || !periodStart || !periodEnd || !rowsText.trim()} onClick={submit}>
          {m.isPending ? "Importing…" : "Import"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); setParseError(null); }}>Cancel</Button>
      </div>
    </div>
  );
}

export function RunLookbackButton({ employerId, planYearId, variant = "outline" }: { employerId: string; planYearId: string; variant?: "outline" | "ghost" }) {
  const m = useRunAcaLookback(employerId);
  const status = m.data?.live ? (m.data.data as { runAcaLookback?: { status?: string } })?.runAcaLookback?.status : null;
  return (
    <span className="inline-flex items-center gap-2">
      {status && <span className="text-xs text-success">{status}</span>}
      {m.error && <span className="text-xs text-destructive">{m.error.message}</span>}
      <Button variant={variant} size="sm" disabled={m.isPending} onClick={() => m.mutate({ planYearId })}>
        <Calculator className="mr-1.5 h-4 w-4" />{m.isPending ? "Calculating…" : "Run Lookback"}
      </Button>
    </span>
  );
}

export function SyncProviderButton({ employerId }: { employerId: string }) {
  const m = useSyncPayrollProvider(employerId);
  const status = m.data?.live ? (m.data.data as { syncPayrollProvider?: { status?: string } })?.syncPayrollProvider?.status : null;
  return (
    <span className="inline-flex items-center gap-2">
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
      <Button variant="outline" size="sm" disabled={m.isPending} onClick={() => m.mutate({})}>
        <RefreshCw className="mr-1.5 h-4 w-4" />{m.isPending ? "Syncing…" : "Sync Provider"}
      </Button>
    </span>
  );
}
