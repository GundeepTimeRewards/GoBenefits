// The mock app assumes a single selected employer. When auth + employer
// selection land, this comes from the route/session instead of a constant.
export const SELECTED_EMPLOYER_ID = "acme";

// Auth-guard scaffolding (NOT enforced in the frontend — backend is the source
// of truth). Attached to routes via staticData for future role/scope guards.
export type ScopeType = "platform" | "agency" | "broker" | "employer" | "employee";

export type RouteGuardMeta = {
  requiredRole?: string;
  requiredPermission?: string;
  scopeType?: ScopeType;
};
