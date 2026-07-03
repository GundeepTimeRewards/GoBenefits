// Live identity → persona/nav role (C2-FE-5). In hybrid mode the shell's role comes
// from the live `me` query; in mock mode (default) the mock role switcher stays the
// source. Nav is FRONTEND-ONLY — the backend enforces real permissions regardless of
// what nav a persona sees, so this mapping never widens backend access.
import { useMe, resolveDataSource } from "@/lib/api";
import { useRole, type Role } from "@/lib/role-context";

/**
 * Map the GraphQL `Role` enum (me.role) to the FE persona/nav role vocabulary.
 * Fail-safe: anything unknown/missing gets the most restricted admin nav
 * (employer_admin) — matching getPersonaNav's own fallback.
 *  - super_admin → platform_admin
 *  - support     → platform_admin (nav-only; backend permissions still apply)
 *  - employee    → employee (the admin shell then falls back to employer_admin nav;
 *                  employee self-service is out of scope and never auto-navigated)
 */
export function mapMeRoleToPersonaRole(meRole: string | null | undefined): Role {
  switch (meRole) {
    case "super_admin": return "platform_admin";
    case "support": return "platform_admin";
    case "agency_admin": return "agency_admin";
    case "broker": return "broker";
    case "employer_admin": return "employer_admin";
    case "employee": return "employee";
    default: return "employer_admin"; // fail safe
  }
}

export type EffectiveIdentity = {
  role: Role;
  /** "mock" = role switcher is the source (mock mode or hybrid-fallback); "live" = me.role. */
  source: "mock" | "live";
  email: string | null;
  loading: boolean;
};

/**
 * PURE resolution (unit-testable): which role drives the shell/nav.
 *  - me not live (mock mode, or hybrid-fallback with no endpoint) → mock switcher role.
 *  - live + me loaded → mapped me.role.
 *  - live + me still loading/errored → employer_admin fail-safe (most restricted nav).
 */
export function resolveEffectiveRole(
  meSource: "mock" | "live" | "fallback",
  mockRole: Role,
  liveMeRole: string | null | undefined,
  meLoaded: boolean
): EffectiveIdentity {
  if (meSource !== "live") return { role: mockRole, source: "mock", email: null, loading: false };
  if (meLoaded) return { role: mapMeRoleToPersonaRole(liveMeRole), source: "live", email: null, loading: false };
  return { role: "employer_admin", source: "live", email: null, loading: true };
}

/** Trivial-but-explicit: prefer the live employer profile when available. */
export function pickEmployerProfile<T>(live: T | undefined, mock: T): T {
  return live ?? mock;
}

/** The role driving the shell/nav — live `me.role` in hybrid, mock switcher otherwise. */
export function useEffectiveRole(): EffectiveIdentity {
  const { role: mockRole } = useRole();
  const meSource = resolveDataSource("me");
  const me = useMe(); // called unconditionally (Rules of Hooks); cheap mock value in mock mode
  const resolved = resolveEffectiveRole(meSource, mockRole, me.data?.role, Boolean(me.data));
  if (resolved.source === "live" && !resolved.loading) {
    return { ...resolved, email: me.data?.email ?? null };
  }
  return resolved;
}
