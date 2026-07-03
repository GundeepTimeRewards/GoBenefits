/**
 * Tenant provisioner Lambda. Creates a new per-customer database, applies the
 * customer schema + seed, and registers the employer in the control-plane
 * tenant registry. Idempotent: safe to re-run for an existing customer.
 *
 * FOUNDATION-DEPLOY-2b — optional DEPLOYMENT SEED (closes gap G3: Aurora sits in
 * private subnets, so first-deploy smoke setup has no direct SQL/bastion path):
 *   - adminCognitoSub/adminEmail(/adminRoleKey): upsert a control-plane
 *     `user_account` bound to the REAL Cognito sub + a `user_employer_access`
 *     grant for the provisioned employer.
 *   - seedPlanYear: upsert one plan year (default active) in the tenant DB so
 *     `currentPlanYear` resolves.
 * All seed fields are optional — omitted, behavior is exactly the pre-2b flow.
 * This is deployment/bootstrap flow only; resolver business logic is untouched.
 *
 * Event: { legalName, ein?, agencyId?, brokerId?, legacyUserDb?,
 *          adminCognitoSub?, adminEmail?, adminRoleKey?, seedPlanYear? }
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { controlPlanePool, getPool, runMigrations } from "@goben/data-access";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CUSTOMER_DIR = path.resolve(HERE, "../../../db/migrations/customer");

export type SeedPlanYearInput = number | { year: number; label?: string; status?: string };

export type ProvisionInput = {
  legalName: string;
  ein?: string;
  agencyId?: string;
  brokerId?: string;
  legacyUserDb?: number;
  // ---- optional deployment seed (FOUNDATION-DEPLOY-2b) ----
  adminCognitoSub?: string;
  adminEmail?: string;
  adminRoleKey?: string;
  seedPlanYear?: SeedPlanYearInput;
};

export type ProvisionResult = {
  employerId: string;
  dbName: string;
  applied: string[];
  /** present when adminCognitoSub was supplied */
  adminUserId?: string;
  /** present when seedPlanYear was supplied */
  planYearId?: string;
};

/**
 * Roles a DEPLOYMENT SEED may assign — employer-scoped only. Platform/support/agency
 * roles are deliberately excluded so a provisioner payload can never mint a
 * cross-tenant/platform identity (no privilege escalation via bootstrap).
 */
export const SEEDABLE_ROLE_KEYS = ["employer_admin", "broker", "employer_read_only", "employee"] as const;
export const DEFAULT_SEED_ROLE = "employer_admin";

// Cognito subs are UUIDs; local dev subs look like "sub-emp-admin-a". Allow both,
// reject whitespace/quotes/anything exotic.
const SUB_RE = /^[A-Za-z0-9._:-]{1,128}$/;
// Loose email shape (local dev uses e.g. "hr.a@test"): one @, no whitespace.
const EMAIL_RE = /^[^@\s]+@[^@\s]+$/;

export class ProvisionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionValidationError";
  }
}

/** PURE validation of the optional seed fields (unit-testable; throws on bad input). */
export function validateSeedInput(input: ProvisionInput): void {
  const { adminCognitoSub, adminEmail, adminRoleKey, seedPlanYear } = input;
  if (adminCognitoSub !== undefined) {
    if (!SUB_RE.test(adminCognitoSub)) {
      throw new ProvisionValidationError("adminCognitoSub is not a valid Cognito sub");
    }
    if (!adminEmail || !EMAIL_RE.test(adminEmail)) {
      throw new ProvisionValidationError("adminEmail is required (valid email) when adminCognitoSub is supplied");
    }
    const roleKey = adminRoleKey ?? DEFAULT_SEED_ROLE;
    if (!(SEEDABLE_ROLE_KEYS as readonly string[]).includes(roleKey)) {
      throw new ProvisionValidationError(
        `adminRoleKey "${roleKey}" is not a seedable role (allowed: ${SEEDABLE_ROLE_KEYS.join(", ")})`
      );
    }
  } else if (adminEmail !== undefined || adminRoleKey !== undefined) {
    throw new ProvisionValidationError("adminEmail/adminRoleKey require adminCognitoSub");
  }
  if (seedPlanYear !== undefined) normalizeSeedPlanYear(seedPlanYear); // throws on bad shape
}

const PLAN_YEAR_STATUSES = ["setup", "active", "archived"] as const;

/** PURE normalization of seedPlanYear (unit-testable; throws on bad shape). */
export function normalizeSeedPlanYear(seed: SeedPlanYearInput): { year: number; label: string; status: string } {
  const obj = typeof seed === "number" ? { year: seed } : seed;
  if (!obj || !Number.isInteger(obj.year) || obj.year < 2000 || obj.year > 2100) {
    throw new ProvisionValidationError("seedPlanYear.year must be an integer year (2000–2100)");
  }
  const status = obj.status ?? "active";
  if (!(PLAN_YEAR_STATUSES as readonly string[]).includes(status)) {
    throw new ProvisionValidationError(`seedPlanYear.status must be one of ${PLAN_YEAR_STATUSES.join(", ")}`);
  }
  return { year: obj.year, label: obj.label ?? `${obj.year} Benefits`, status };
}

function dbNameFor(legacyUserDb?: number): string {
  // Stable, collision-free naming. For migrated tenants, mirror legacy hcmuser<N>.
  return legacyUserDb ? `cust_legacy_${legacyUserDb}` : `cust_${Date.now().toString(36)}`;
}

export const handler = async (input: ProvisionInput): Promise<ProvisionResult> => {
  validateSeedInput(input);

  const cp = await controlPlanePool();
  const dbName = dbNameFor(input.legacyUserDb);

  // 1. Create the per-customer database (idempotent).
  await cp.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`);

  // 2. Apply customer schema + seed to it (isolated migration connection).
  const applied = await runMigrations(dbName, CUSTOMER_DIR);

  // 3. Register in the tenant registry (idempotent on db_name).
  // UUID_TO_BIN(NULL) returns NULL, so null scope ids pass through cleanly.
  await cp.query(
    `INSERT INTO employer (agency_id, broker_id, legal_name, ein, status, db_name, legacy_user_db)
     VALUES (UUID_TO_BIN(:agencyId), UUID_TO_BIN(:brokerId),
             :legalName, :ein, 'setup', :dbName, :legacyUserDb)
     ON DUPLICATE KEY UPDATE legal_name = VALUES(legal_name)`,
    {
      agencyId: input.agencyId ?? null,
      brokerId: input.brokerId ?? null,
      legalName: input.legalName,
      ein: input.ein ?? null,
      dbName,
      legacyUserDb: input.legacyUserDb ?? null,
    }
  );

  const [rows] = await cp.query(
    `SELECT BIN_TO_UUID(id) AS id FROM employer WHERE db_name = :dbName LIMIT 1`,
    { dbName }
  );
  const employerId = (rows as { id: string }[])[0]?.id;
  const result: ProvisionResult = { employerId, dbName, applied };

  // 4. Optional deployment seed: control-plane identity + access grant.
  if (input.adminCognitoSub) {
    const roleKey = input.adminRoleKey ?? DEFAULT_SEED_ROLE;
    // The role must exist in the reference seed (fail loudly, not silently).
    const [roleRows] = await cp.query(`SELECT BIN_TO_UUID(id) AS id FROM role WHERE key_name = :roleKey LIMIT 1`, { roleKey });
    if ((roleRows as unknown[]).length === 0) {
      throw new ProvisionValidationError(`role "${roleKey}" not found — run the control-plane migrator first`);
    }
    // Upsert keyed on uq_user_cognito. (email is also unique — a clash on a DIFFERENT
    // sub with the same email fails loudly rather than silently rebinding a user.)
    await cp.query(
      `INSERT INTO user_account (id, cognito_sub, email, role_id, status)
       SELECT UUID_TO_BIN(UUID()), :sub, :email, r.id, 'active' FROM role r WHERE r.key_name = :roleKey
       ON DUPLICATE KEY UPDATE email = VALUES(email), role_id = VALUES(role_id), status = 'active'`,
      { sub: input.adminCognitoSub, email: input.adminEmail, roleKey }
    );
    // Access grant (idempotent; PK = user_account_id + employer_id).
    await cp.query(
      `INSERT IGNORE INTO user_employer_access (user_account_id, employer_id)
       SELECT u.id, UUID_TO_BIN(:employerId) FROM user_account u WHERE u.cognito_sub = :sub`,
      { employerId, sub: input.adminCognitoSub }
    );
    const [userRows] = await cp.query(
      `SELECT BIN_TO_UUID(id) AS id FROM user_account WHERE cognito_sub = :sub LIMIT 1`,
      { sub: input.adminCognitoSub }
    );
    result.adminUserId = (userRows as { id: string }[])[0]?.id;
  }

  // 5. Optional deployment seed: one plan year in the tenant DB (idempotent on
  //    uq_plan_year(year)) so currentPlanYear resolves for C1 smoke tests.
  if (input.seedPlanYear !== undefined) {
    const py = normalizeSeedPlanYear(input.seedPlanYear);
    const tenant = await getPool(dbName);
    await tenant.query(
      `INSERT INTO plan_year (id, label, year, period_start, period_end, status)
       VALUES (UUID_TO_BIN(UUID()), :label, :year, :start, :end, :status)
       ON DUPLICATE KEY UPDATE label = VALUES(label), status = VALUES(status)`,
      { label: py.label, year: py.year, start: `${py.year}-01-01`, end: `${py.year}-12-31`, status: py.status }
    );
    const [pyRows] = await tenant.query(
      `SELECT BIN_TO_UUID(id) AS id FROM plan_year WHERE year = :year LIMIT 1`,
      { year: py.year }
    );
    result.planYearId = (pyRows as { id: string }[])[0]?.id;
  }

  return result;
};
