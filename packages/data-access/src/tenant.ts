/**
 * Tenant resolution & authorization — the #1 security control.
 *
 * Flow per request:
 *   identity (Cognito sub)  ->  user + permissions (control-plane)
 *   -> resolve target employer (arg or bound)  ->  authorize (permission x scope)
 *   -> route to that employer's per-customer DB.
 *
 * The tenant id is NEVER taken from client input for access decisions — it only
 * SELECTS AMONG employers the user is already authorized for.
 */
import type { Pool } from "mysql2/promise";
import {
  getUserByCognitoSub,
  getPermissionsForRole,
  getEmployerById,
  hasEmployerAccess,
  type UserAccount,
  type EmployerRegistry,
} from "./control-plane.js";
import { customerPool } from "./pool.js";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Audit hook for internal support/admin tenant access. Support users
 * (benefits_support_admin) cross tenant boundaries, so every such access is
 * surfaced here to be recorded. Phase 0 exposes the hook (prepared for audit
 * logging / audit_event.done_by); a later module wires it to durable storage.
 */
export type SupportAccessEvent = {
  userId: string;
  roleKey: string;
  employerId: string;
  at: Date;
};
export const auditHooks: { onSupportAccess?: (e: SupportAccessEvent) => void } = {};

export type AuthContext = {
  user: UserAccount;
  permissions: Set<string>;
  /** true for platform_admin / benefits_support_admin */
  isPlatform: boolean;
};

/** Build the auth context from the Cognito identity on an AppSync event. */
export async function buildAuthContext(cognitoSub: string | undefined): Promise<AuthContext> {
  if (!cognitoSub) throw new AuthError("No identity on request");
  const user = await getUserByCognitoSub(cognitoSub);
  if (!user || user.status === "disabled") throw new AuthError("Unknown or disabled user");
  const permissions = await getPermissionsForRole(user.roleKey);
  const isPlatform = user.roleKey === "platform_admin" || user.roleKey === "benefits_support_admin";
  return { user, permissions, isPlatform };
}

/** Assert the user's role grants a permission key (the ACTION dimension). */
export function assertPermission(ctx: AuthContext, permission: string): void {
  if (!ctx.permissions.has(permission)) {
    throw new AuthError(`Missing permission: ${permission}`);
  }
}

/**
 * Resolve & authorize the target employer (the SCOPE dimension).
 * @param requestedEmployerId optional arg from the operation.
 */
export async function resolveEmployer(
  ctx: AuthContext,
  requestedEmployerId?: string
): Promise<EmployerRegistry> {
  // Determine the candidate employer.
  let employerId = requestedEmployerId;
  if (!employerId) {
    // Non-platform users with a single bound employer could default here.
    // For employer_admin/employee this would come from their binding; left as
    // an explicit requirement for now to avoid ambiguity.
    throw new AuthError("employerId is required for this operation");
  }

  const employer = await getEmployerById(employerId);
  if (!employer) throw new AuthError("Employer not found"); // fail closed: unknown tenant

  // Only the explicit-access roles need the (DB) access lookup; platform/agency
  // are decided by their own rules. Keeping the decision PURE + testable below.
  const needsExplicit = !ctx.isPlatform && ctx.user.roleKey !== "agency_admin";
  const hasExplicitAccess = needsExplicit ? await hasEmployerAccess(ctx.user.id, employer.id) : false;

  decideEmployerAccess(ctx, employer, hasExplicitAccess);
  return employer;
}

const ACTIVE_EMPLOYER_STATES = new Set(["prospect", "setup", "active"]);

/**
 * PURE scope decision (no DB). Throws AuthError if access is denied; fires the
 * support-audit hook for benefits_support_admin. Separated from resolveEmployer
 * so the security branching is unit-testable offline.
 *
 * @param hasExplicitAccess result of user_employer_access lookup (only meaningful
 *        for broker / employer_* / employee roles).
 */
export function decideEmployerAccess(
  ctx: AuthContext,
  employer: EmployerRegistry,
  hasExplicitAccess: boolean
): void {
  // Disabled/archived employer fails closed for everyone except platform/support
  // (who may need to access archived data for support/fixes).
  if (!ACTIVE_EMPLOYER_STATES.has(employer.status) && !ctx.isPlatform) {
    throw new AuthError("Employer is not active");
  }

  if (ctx.isPlatform) {
    // platform/support: allowed across tenants. Support access is audited
    // (support users are never silently impersonated).
    if (ctx.user.roleKey === "benefits_support_admin") {
      auditHooks.onSupportAccess?.({
        userId: ctx.user.id,
        roleKey: ctx.user.roleKey,
        employerId: employer.id,
        at: new Date(),
      });
    }
    return;
  }

  if (ctx.user.roleKey === "agency_admin") {
    if (employer.agencyId && employer.agencyId === ctx.user.agencyId) return;
    throw new AuthError("Employer outside your agency");
  }

  // broker / employer_* / employee → explicit access only.
  // A broker can NEVER resolve an employer outside their assigned book.
  if (hasExplicitAccess) return;
  throw new AuthError("Not authorized for this employer");
}

/**
 * One-shot helper: authorize (permission x scope) and return a routed
 * per-customer DB connection for the target employer.
 */
export async function getCustomerDb(
  ctx: AuthContext,
  permission: string,
  requestedEmployerId?: string
): Promise<{ employer: EmployerRegistry; db: Pool }> {
  assertPermission(ctx, permission);
  const employer = await resolveEmployer(ctx, requestedEmployerId);
  const db = await customerPool(employer.dbName);
  return { employer, db };
}
