import { useEffect } from "react";
import { Link, Outlet, useRouterState, useParams } from "@tanstack/react-router";
import { Building2, HeartPulse } from "lucide-react";
import { useRole, roleLabels } from "@/lib/role-context";
import { useEmployer } from "@/lib/employer-context";
import { getEmployerProfile, isKnownEmployer } from "@/lib/mock/db";
import { getPersonaNav, NAV_ITEMS, itemKey, itemLabel, type NavItemDef } from "@/lib/persona";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { EmployerSwitcher } from "@/components/EmployerSwitcher";
import { PlanYearSwitcher } from "@/components/PlanYearSwitcher";
import { usePlanYearCtx } from "@/lib/plan-year-context";

/** Resolve a route pattern to a concrete path using the active employer + plan year. */
function concretePath(pattern: string, employerId: string, planYearId: string): string {
  return pattern.replace("$employerId", employerId).replace("/$planYearId/setup", `/${planYearId}/setup`);
}

function NavLink({ item, label, activePath, employerId, planYearId }: { item: NavItemDef; label: string; activePath: string; employerId: string; planYearId: string }) {
  // Active iff this item owns the winning (longest) matched path — so a parent route
  // like /agency doesn't also light up when a child like /agency/brokers is active.
  const candidates = (item.activeOn ?? [item.to]).map((p) => concretePath(p, employerId, planYearId));
  const active = !!activePath && candidates.includes(activePath);
  const params = item.employerScoped ? { employerId, planYearId } : undefined;
  return (
    <Link
      to={item.to as never}
      params={params as never}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-sidebar-active font-medium text-sidebar-active-foreground shadow-sm"
          : "text-sidebar-foreground hover:bg-white/5 hover:text-white"
      }`}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

const roleFace: Record<string, { name: string; initials: string }> = {
  platform_admin: { name: "Pat Nguyen", initials: "PN" },
  agency_admin: { name: "Alex Romero", initials: "AR" },
  broker: { name: "Sam Carter", initials: "SC" },
  employer_admin: { name: "Jamie Bennett", initials: "JB" },
  employee: { name: "Jordan Lee", initials: "JL" },
};

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useRole();
  const { selectedEmployerId, setSelectedEmployerId } = useEmployer();
  const { setSelectedPlanYearId } = usePlanYearCtx();
  const params = useParams({ strict: false });
  const routeEmployerId = params.employerId;
  const routePlanYearId = params.planYearId;

  // Keep the active employer + plan year in sync with the URL. Only sync a VALID
  // employer id — a stale/undefined route param must never overwrite the context
  // (that would make every keyed getter return [] and blank the whole app).
  useEffect(() => {
    if (isKnownEmployer(routeEmployerId) && routeEmployerId !== selectedEmployerId) setSelectedEmployerId(routeEmployerId!);
  }, [routeEmployerId, selectedEmployerId, setSelectedEmployerId]);
  useEffect(() => {
    if (routePlanYearId) setSelectedPlanYearId(routePlanYearId);
  }, [routePlanYearId, setSelectedPlanYearId]);

  const persona = getPersonaNav(role);
  const employer = getEmployerProfile(selectedEmployerId);
  const currentPlanYearId = employer.currentPlanYearId;

  // Longest matching nav path wins — resolves parent/child overlaps (e.g. /agency vs
  // /agency/brokers) so only the most specific item highlights.
  let activePath = "";
  for (const g of persona.groups) {
    for (const it of g.items) {
      const nav = NAV_ITEMS[itemKey(it)];
      for (const pat of nav.activeOn ?? [nav.to]) {
        const p = concretePath(pat, selectedEmployerId, currentPlanYearId);
        if ((pathname === p || pathname.startsWith(p + "/")) && p.length > activePath.length) activePath = p;
      }
    }
  }

  const face = roleFace[role] ?? roleFace.employer_admin;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
        <Link to="/dashboard" className="mb-5 flex items-center gap-2 px-2 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-semibold text-white">GoBenefits</span>
        </Link>
        <div className="flex-1">
          {persona.groups.map((g) => (
            <div key={g.label} className="mb-4">
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-heading">{g.label}</div>
              <nav className="space-y-0.5">
                {g.items.map((it) => {
                  const key = itemKey(it);
                  return (
                    <NavLink key={key} item={NAV_ITEMS[key]} label={itemLabel(it)} activePath={activePath} employerId={selectedEmployerId} planYearId={currentPlanYearId} />
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
        <Link to="/employee" className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-white/5 hover:text-white">
          <HeartPulse className="h-4 w-4 shrink-0" /><span className="truncate">Employee Self-Service →</span>
        </Link>
        <div className="flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-white/5 px-3 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-white">{face.initials}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{face.name}</div>
            <div className="truncate text-[11px] text-sidebar-heading">{roleLabels[role]}</div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/80 px-6 py-3 backdrop-blur">
          {!persona.employerSelector ? (
            // Employer Admin: single company (implicit) + plan year selector + status.
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-foreground">{employer.name}</span>
              <span className="text-border">|</span>
              <PlanYearSwitcher />
            </div>
          ) : routeEmployerId ? (
            // Employer-scoped page: pick the active employer + plan year.
            <div className="flex flex-wrap items-center gap-3">
              <EmployerSwitcher />
              <span className="text-border">|</span>
              <PlanYearSwitcher />
            </div>
          ) : (
            // Agency-wide page (dashboard, book of business, directory): no single employer.
            <span className="text-xs text-muted-foreground">All Employers</span>
          )}
          <RoleSwitcher />
        </div>
        <div className="p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
