// Enrollment mutation forms (Phase D-7b). Wires the Enrollment Center's placeholder
// actions — New Enrollment Window and Send Reminders — to the D-7 mutations. Same
// conventions as the other mutation forms: small inline panels, data-source gate
// (mock mode = no-op with note), typed errors, invalidation inside the hooks.
import { useState } from "react";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveDataSource } from "@/lib/api/dataSource";
import {
  useCreateEnrollmentWindow,
  useSendEnrollmentReminders,
  type FormMutationError,
} from "@/lib/api/mutationHooks";

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

// Customer-DB enrollment_event enum values with display labels.
const WINDOW_TYPE_OPTIONS = [
  { value: "open_enrollment", label: "Open Enrollment" },
  { value: "new_hire", label: "New Hire" },
  { value: "life_event", label: "Life Event" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function NewEnrollmentWindowForm({
  employerId,
  planYearId,
  variant = "outline",
}: {
  employerId: string;
  planYearId: string;
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("open_enrollment");
  const [name, setName] = useState("");
  const [windowStart, setStart] = useState("");
  const [windowEnd, setEnd] = useState("");
  const m = useCreateEnrollmentWindow(employerId);
  const datesValid = ISO_DATE.test(windowStart) && ISO_DATE.test(windowEnd) && windowStart <= windowEnd;

  if (!open) {
    return (
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />New Enrollment Window
      </Button>
    );
  }
  return (
    <div className="w-full max-w-md space-y-2 rounded-md border border-border bg-card p-3 text-left">
      <div className="text-sm font-medium">New Enrollment Window</div>
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          {WINDOW_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Start (YYYY-MM-DD)" value={windowStart} onChange={(e) => setStart(e.target.value)} />
        <Input placeholder="End (YYYY-MM-DD)" value={windowEnd} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Open Enrollment windows attach to this plan year's annual OE event; New Hire and Life Event windows get their own event.
      </p>
      <MockNote op="createEnrollmentWindow" employerId={employerId} />
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || !datesValid} onClick={() => m.mutate(
          { planYearId, input: { type, name: name.trim() || undefined, windowStart, windowEnd } },
          { onSuccess: () => { setOpen(false); setName(""); setStart(""); setEnd(""); } }
        )}>{m.isPending ? "Creating…" : "Create Window"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}

const AUDIENCES = [
  { value: "all", label: "Everyone not submitted" },
  { value: "not_started", label: "Not started only" },
  { value: "in_progress", label: "In progress only" },
];

export function SendRemindersControl({ employerId, planYearId }: { employerId: string; planYearId: string }) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState("all");
  const [result, setResult] = useState<string | null>(null);
  const m = useSendEnrollmentReminders(employerId);

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        {result && <span className="text-xs text-success">{result}</span>}
        <Button variant="outline" size="sm" onClick={() => { setOpen(true); setResult(null); }}>
          <Send className="mr-1.5 h-4 w-4" />Send Reminders
        </Button>
      </span>
    );
  }
  return (
    <div className="w-full max-w-sm space-y-2 rounded-md border border-border bg-card p-3 text-left">
      <div className="text-sm font-medium">Send Enrollment Reminders</div>
      <select className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={audience} onChange={(e) => setAudience(e.target.value)}>
        {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">Employees who already submitted are never reminded.</p>
      <MockNote op="sendEnrollmentReminders" employerId={employerId} />
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate(
          { planYearId, audience },
          {
            onSuccess: (res) => {
              const status = (res.data as { sendEnrollmentReminders?: { status?: string } } | null)?.sendEnrollmentReminders?.status;
              setResult(res.live ? status ?? "Reminders sent" : "Mock mode — nothing sent");
              setOpen(false);
            },
          }
        )}>{m.isPending ? "Sending…" : "Send"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}
