import { useNavigate, useRouterState } from "@tanstack/react-router";
import { UserCog, Lock } from "lucide-react";
import { useRole, roleLabels, ROLES, type Role } from "@/lib/role-context";
import { useEffectiveRole } from "@/lib/live-identity";

// "View as" persona switcher (mock, not auth). Selecting Employee jumps to the
// self-service shell; picking an admin role while in /employee returns to admin.
//
// C2-FE-5: when the live identity is active (hybrid mode with `me` loaded), the role
// comes from the backend — the switcher becomes a read-only diagnostic chip. In mock
// mode (default) and in hybrid-fallback (no endpoint), the interactive switcher is
// unchanged.
export function RoleSwitcher() {
  const { role, setRole } = useRole();
  const identity = useEffectiveRole();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function onChange(r: Role) {
    setRole(r);
    if (r === "employee") navigate({ to: "/employee" });
    else if (pathname.startsWith("/employee")) navigate({ to: "/dashboard" });
  }

  if (identity.source === "live") {
    // Read-only: role is determined by `me` (seeded dev sub locally / Cognito later).
    return (
      <span
        className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
        title={`Role from live identity (me)${identity.email ? ` · ${identity.email}` : ""}. Change VITE_DEV_AUTH_SUB to test another seeded role.`}
      >
        <Lock className="h-3.5 w-3.5" /> Role: {roleLabels[identity.role]}
        <span className="text-[10px] uppercase tracking-wide">live</span>
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <UserCog className="h-4 w-4" /> View as
      <select
        value={role}
        onChange={(e) => onChange(e.target.value as Role)}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{roleLabels[r]}</option>
        ))}
      </select>
    </label>
  );
}
