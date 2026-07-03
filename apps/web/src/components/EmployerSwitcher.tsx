import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useEmployer } from "@/lib/employer-context";
import { useEmployers } from "@/lib/api";

// Active-employer selector for broker/agency/platform users who manage many
// employers. Options come from `useEmployers()` — mock slugs in mock mode, live
// UUID employers (myEmployers) in hybrid — so the id-space matches the active mode.
// Changing it sets the active employer and — if you're on an employer-scoped screen —
// keeps you on the SAME screen for the new employer (Census stays on Census);
// otherwise goes to the overview. Switching also refetches employer-scoped C1 reads
// because they are keyed by employerId.
export function EmployerSwitcher() {
  const { selectedEmployerId, setSelectedEmployerId } = useEmployer();
  const { data: employers = [] } = useEmployers();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function onChange(id: string) {
    setSelectedEmployerId(id);
    if (pathname.startsWith("/employers/")) {
      const newPath = pathname.replace(/^\/employers\/[^/]+/, `/employers/${id}`);
      navigate({ to: newPath as never });
    } else {
      navigate({ to: "/employers/$employerId", params: { employerId: id } });
    }
  }

  if (employers.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Building2 className="h-4 w-4" /> Employer
      <select
        value={selectedEmployerId}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[220px] rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
      >
        {employers.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </label>
  );
}
