// Minimal C1 mutation forms (add/edit employee, add/edit/remove dependent). These wire
// the existing placeholder buttons to the C1 mutation hooks. Intentionally small — a few
// inputs + Save/Cancel using existing ui primitives, not a UI redesign. Behavior follows
// the data-source gate: in mock/fallback mode the mutation is a NO-OP (a note is shown);
// in hybrid-live mode it calls the API and invalidates the relevant reads.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveDataSource } from "@/lib/api/dataSource";
import {
  useCreateEmployee,
  useUpdateEmployee,
  useAddDependent,
  useUpdateDependent,
  useRemoveDependent,
  type FormMutationError,
} from "@/lib/api/mutationHooks";
import type { CensusEmployee, Dependent } from "@/lib/census-mock";

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

// --- Add employee ------------------------------------------------------------
export function AddEmployeeForm({ employerId, trigger }: { employerId: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [employeeNumber, setNum] = useState("");
  const m = useCreateEmployee(employerId);

  if (!open) {
    return <span onClick={() => setOpen(true)}>{trigger ?? <Button size="sm">Add Employee</Button>}</span>;
  }
  return (
    <div className="w-full max-w-md space-y-2 rounded-md border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="First name" value={firstName} onChange={(ev) => setFirst(ev.target.value)} />
        <Input placeholder="Last name" value={lastName} onChange={(ev) => setLast(ev.target.value)} />
        <Input placeholder="Email (optional)" value={email} onChange={(ev) => setEmail(ev.target.value)} />
        <Input placeholder="Employee # (optional)" value={employeeNumber} onChange={(ev) => setNum(ev.target.value)} />
      </div>
      <MockNote op="createEmployee" employerId={employerId} />
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || !lastName.trim()} onClick={() => m.mutate(
          { firstName, lastName, email: email || undefined, employeeNumber: employeeNumber || undefined },
          { onSuccess: () => { setOpen(false); setFirst(""); setLast(""); setEmail(""); setNum(""); } }
        )}>{m.isPending ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}

// --- Edit employee -----------------------------------------------------------
export function EditEmployeeForm({ employerId, employee, trigger }: { employerId: string; employee: CensusEmployee; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirst] = useState(employee.firstName);
  const [lastName, setLast] = useState(employee.lastName);
  const m = useUpdateEmployee(employerId);

  if (!open) {
    return <span onClick={() => setOpen(true)}>{trigger ?? <Button size="sm" variant="outline">Edit Employee</Button>}</span>;
  }
  return (
    <div className="w-full max-w-md space-y-2 rounded-md border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="First name" value={firstName} onChange={(ev) => setFirst(ev.target.value)} />
        <Input placeholder="Last name" value={lastName} onChange={(ev) => setLast(ev.target.value)} />
      </div>
      <MockNote op="updateEmployee" employerId={employerId} />
      <ErrText error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || !lastName.trim()} onClick={() => m.mutate(
          { employeeId: employee.employeeId, firstName, lastName },
          { onSuccess: () => setOpen(false) }
        )}>{m.isPending ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); m.reset(); }}>Cancel</Button>
      </div>
    </div>
  );
}

// --- Dependents: add + edit + remove ----------------------------------------
const RELATIONSHIPS = ["spouse", "child", "domestic_partner", "other"] as const;

export function DependentManager({ employerId, employeeId, dependents }: { employerId: string; employeeId: string; dependents: Dependent[] }) {
  const [adding, setAdding] = useState(false);
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [relationship, setRel] = useState<string>("child");
  const add = useAddDependent(employerId);
  const update = useUpdateDependent(employerId);
  const remove = useRemoveDependent(employerId);
  const [editing, setEditing] = useState<string | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Dependents ({dependents.length})</span>
        {!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Add Dependent</Button>}
      </div>

      {adding && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="First name" value={firstName} onChange={(e) => setFirst(e.target.value)} />
            <Input placeholder="Last name" value={lastName} onChange={(e) => setLast(e.target.value)} />
            <select className="rounded-md border border-input bg-background px-2 text-sm" value={relationship} onChange={(e) => setRel(e.target.value)}>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <MockNote op="addDependent" employerId={employerId} />
          <ErrText error={add.error} />
          <div className="flex gap-2">
            <Button size="sm" disabled={add.isPending || !lastName.trim()} onClick={() => add.mutate(
              { employeeId, firstName, lastName, relationship },
              { onSuccess: () => { setAdding(false); setFirst(""); setLast(""); setRel("child"); } }
            )}>{add.isPending ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); add.reset(); }}>Cancel</Button>
          </div>
        </div>
      )}

      {dependents.map((d) => (
        <div key={d.dependentId} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-2">
          {editing === d.dependentId ? (
            <>
              <Input className="h-8 max-w-[120px]" value={editFirst} onChange={(e) => setEditFirst(e.target.value)} />
              <Input className="h-8 max-w-[120px]" value={editLast} onChange={(e) => setEditLast(e.target.value)} />
              <Button size="sm" disabled={update.isPending} onClick={() => update.mutate(
                { dependentId: d.dependentId, employeeId, firstName: editFirst, lastName: editLast, relationship: d.relationship },
                { onSuccess: () => setEditing(null) }
              )}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(null); update.reset(); }}>Cancel</Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm">{d.firstName} {d.lastName} <span className="text-xs text-muted-foreground">· {d.relationship}</span></span>
              <Button size="sm" variant="outline" onClick={() => { setEditing(d.dependentId); setEditFirst(d.firstName); setEditLast(d.lastName); }}>Edit</Button>
              <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate({ dependentId: d.dependentId })}>Remove</Button>
            </>
          )}
        </div>
      ))}
      <MockNote op="removeDependent" employerId={employerId} />
    </div>
  );
}
