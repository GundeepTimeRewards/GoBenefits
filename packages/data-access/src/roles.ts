/**
 * DB role key -> GraphQL `Role` enum mapping (Phase C / C1, decision R6).
 *
 * The control-plane `role.key_name` set is richer than the public GraphQL `Role`
 * enum. C1 does NOT redesign the role model — it maps the DB keys the FE actually
 * consumes to the enum, via an EXPLICIT table, and FAILS CLOSED for anything else.
 *
 * IMPORTANT: `Me.role` is FE-facing only — it drives persona navigation. It is NOT
 * an authorization input. Backend access is always enforced by `ctx.permissions`
 * (role_permission) via decideEmployerAccess/assertPermission, regardless of this
 * mapping. So the mapping never widens real privilege.
 *
 * Mapping table:
 *   platform_admin          -> super_admin
 *   benefits_support_admin  -> support
 *   agency_admin            -> agency_admin
 *   broker                  -> broker
 *   employer_admin          -> employer_admin
 *   employee                -> employee
 *
 * Intentionally UNMAPPED (fail closed): employer_read_only, employer_payroll_admin,
 * cobra_admin. These specialized employer sub-roles have no GraphQL `Role` equivalent
 * and are not exercised by any C1 surface. Rather than silently up-privileging them to
 * `employer_admin` (they are more restricted) or mis-labeling them as `employee`
 * (wrong surface), C1 fails closed until the Role enum is expanded (out of C1 scope).
 */

/** GraphQL `Role` enum values (mirror api/schema.graphql `enum Role`). */
export type GraphQLRole =
  | "super_admin"
  | "support"
  | "agency_admin"
  | "broker"
  | "employer_admin"
  | "employee";

/** Explicit, closed mapping. Any key not present here is rejected (fail closed). */
const ROLE_KEY_TO_GRAPHQL: Readonly<Record<string, GraphQLRole>> = {
  platform_admin: "super_admin",
  benefits_support_admin: "support",
  agency_admin: "agency_admin",
  broker: "broker",
  employer_admin: "employer_admin",
  employee: "employee",
};

export class RoleMappingError extends Error {
  constructor(roleKey: string) {
    super(`Role "${roleKey}" is not permitted in this API version`);
    this.name = "RoleMappingError";
  }
}

/**
 * Map a control-plane role key to the GraphQL `Role` enum. Throws RoleMappingError
 * (fail closed) for any key without an explicit, safe mapping.
 */
export function mapRoleKeyToGraphQL(roleKey: string): GraphQLRole {
  const mapped = ROLE_KEY_TO_GRAPHQL[roleKey];
  if (!mapped) throw new RoleMappingError(roleKey);
  return mapped;
}
