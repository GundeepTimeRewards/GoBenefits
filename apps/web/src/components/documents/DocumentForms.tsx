// Document mutation forms (FE-polish). Wires the Documents & Forms page's Upload
// Document header button and a per-row Request Signature action to the E-3 backend
// (metadata-first: no file bytes locally). Same conventions as the other mutation
// forms — inline panel, data-source gate, typed errors, invalidation in the hooks.
import { useState } from "react";
import { Upload, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveDataSource } from "@/lib/api/dataSource";
import { useUploadDocument, useRequestSignature, type FormMutationError } from "@/lib/api/mutationHooks";

function MockNote({ op, employerId }: { op: string; employerId: string }) {
  if (resolveDataSource(op, employerId) === "live") return null;
  return <p className="text-xs text-muted-foreground">Mock mode: not persisted. Enable hybrid live mode + select a live employer to save for real.</p>;
}
function ErrText({ error }: { error: FormMutationError | null }) {
  if (!error) return null;
  const prefix = error.type === "validation" ? "" : error.type === "unauthorized" ? "Not permitted: " : "Error: ";
  return <p className="text-xs text-destructive">{prefix}{error.message}</p>;
}

const CATEGORIES = ["SBC", "Plan Summary", "Carrier Brochure", "Certificate", "Notice", "Other"];

export function UploadDocumentForm({
  employerId,
  planYearId,
  plans,
}: {
  employerId: string;
  planYearId: string;
  plans: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("SBC");
  const [planId, setPlanId] = useState("");
  const m = useUploadDocument(employerId);

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Upload className="mr-1.5 h-4 w-4" />Upload Document</Button>;
  }
  return (
    <div className="w-full max-w-md space-y-2 rounded-md border border-border bg-card p-3 text-left">
      <div className="text-sm font-medium">Upload Document</div>
      <div className="grid grid-cols-2 gap-2">
        <Input className="col-span-2" placeholder="Document name (e.g. UHC-SBC-2026.pdf)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">No plan link</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">Linking a plan marks its documents complete in Plans &amp; Rates. Metadata-first — the file uploads to storage in production.</p>
      <MockNote op="uploadDocument" employerId={employerId} />
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || !name.trim()} onClick={() => m.mutate(
          { planYearId, category, name: name.trim(), planId: planId || undefined },
          { onSuccess: () => { setOpen(false); setName(""); setPlanId(""); } }
        )}>{m.isPending ? "Saving…" : "Record Document"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}

/** Per-document Request Signature action (FE-polish). Mock mode no-ops. */
export function RequestSignatureButton({ employerId, documentId }: { employerId: string; documentId: string }) {
  const m = useRequestSignature(employerId);
  const sent = m.data?.live && (m.data.data as { requestSignature?: { ok?: boolean } })?.requestSignature?.ok;
  return (
    <span className="inline-flex items-center gap-1.5">
      {m.error && <span className="text-[11px] text-destructive">{m.error.message}</span>}
      <Button variant="outline" size="sm" className="h-8" disabled={m.isPending || Boolean(sent)}
        onClick={() => m.mutate({ documentId })}>
        <FileSignature className="mr-1 h-3.5 w-3.5" />{m.isPending ? "Requesting…" : sent ? "Requested" : "Request Signature"}
      </Button>
    </span>
  );
}
