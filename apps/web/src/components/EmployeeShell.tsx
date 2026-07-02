import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { HeartPulse, Users, Sparkles, FileText, ClipboardCheck, LifeBuoy, ListChecks } from "lucide-react";
import { RoleSwitcher } from "@/components/RoleSwitcher";

// Employee self-service shell — intentionally SEPARATE from the admin AppShell.
// Self-service uses row-level "own records only" authorization later; it must NOT
// reuse HR-admin nav or assumptions. (Auth not implemented in the FE.)
const nav = [
  { to: "/employee", label: "My Benefits", icon: HeartPulse, exact: true },
  { to: "/employee/enroll", label: "Enroll", icon: ClipboardCheck },
  { to: "/employee/elections", label: "My Elections", icon: ListChecks },
  { to: "/employee/dependents", label: "My Dependents", icon: Users },
  { to: "/employee/life-events", label: "Life Events", icon: Sparkles },
  { to: "/employee/documents", label: "Documents", icon: FileText },
  { to: "/employee/help", label: "Help", icon: LifeBuoy },
];

export function EmployeeShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1000px] items-center gap-6 px-4">
          <span className="flex items-center gap-2 py-3 font-semibold"><HeartPulse className="h-5 w-5 text-primary" /> My Benefits</span>
          <nav className="flex gap-1">
            {nav.map((n) => {
              const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
              return (
                <Link key={n.to} to={n.to} className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm ${active ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  <n.icon className="h-4 w-4" />{n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto"><RoleSwitcher /></div>
        </div>
      </header>
      <main className="mx-auto max-w-[1000px] p-6">
        <Outlet />
      </main>
    </div>
  );
}
