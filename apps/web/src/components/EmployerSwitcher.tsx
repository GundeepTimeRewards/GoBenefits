import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useEmployer, EMPLOYERS } from "@/lib/employer-context";

// Active-employer selector for broker/agency/platform users who manage many
// employers. Changing it sets the active employer and — if you're on an
// employer-scoped screen — keeps you on the SAME screen for the new employer
// (so switching on Census stays on Census); otherwise goes to the overview.
export function EmployerSwitcher() {
  const { selectedEmployerId, setSelectedEmployerId } = useEmployer();
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

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Building2 className="h-4 w-4" /> Employer
      <select
        value={selectedEmployerId}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[220px] rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
      >
        {EMPLOYERS.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </label>
  );
}
