import { useNavigate, useRouterState } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { useRole, roleLabels, ROLES, type Role } from "@/lib/role-context";

// "View as" persona switcher (mock, not auth). Selecting Employee jumps to the
// self-service shell; picking an admin role while in /employee returns to admin.
export function RoleSwitcher() {
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function onChange(r: Role) {
    setRole(r);
    if (r === "employee") navigate({ to: "/employee" });
    else if (pathname.startsWith("/employee")) navigate({ to: "/dashboard" });
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
