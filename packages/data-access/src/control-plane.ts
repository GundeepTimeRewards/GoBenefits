/**
 * Control-plane repository — reads org/identity/registry data only.
 * No business logic. UUIDs are stored as BINARY(16); we expose them as strings.
 */
import { controlPlanePool } from "./pool.js";

export type UserAccount = {
  id: string;
  cognitoSub: string;
  email: string;
  roleKey: string;
  agencyId: string | null;
  brokerId: string | null;
  status: string;
};

export type EmployerRegistry = {
  id: string;
  agencyId: string | null;
  brokerId: string | null;
  legalName: string;
  status: string;
  dbName: string;
};

/** Look up a user by their Cognito subject. */
export async function getUserByCognitoSub(sub: string): Promise<UserAccount | null> {
  const pool = await controlPlanePool();
  const [rows] = await pool.query(
    `SELECT BIN_TO_UUID(u.id) AS id, u.cognito_sub AS cognitoSub, u.email,
            r.key_name AS roleKey,
            BIN_TO_UUID(u.agency_id) AS agencyId, BIN_TO_UUID(u.broker_id) AS brokerId,
            u.status
     FROM user_account u JOIN role r ON r.id = u.role_id
     WHERE u.cognito_sub = :sub LIMIT 1`,
    { sub }
  );
  const list = rows as UserAccount[];
  return list[0] ?? null;
}

/** Permission keys granted to a role. */
export async function getPermissionsForRole(roleKey: string): Promise<Set<string>> {
  const pool = await controlPlanePool();
  const [rows] = await pool.query(
    `SELECT p.key_name AS k
     FROM role r
     JOIN role_permission rp ON rp.role_id = r.id
     JOIN permission p ON p.id = rp.permission_id
     WHERE r.key_name = :roleKey`,
    { roleKey }
  );
  return new Set((rows as { k: string }[]).map((x) => x.k));
}

/** Resolve an employer from the tenant registry. */
export async function getEmployerById(employerId: string): Promise<EmployerRegistry | null> {
  const pool = await controlPlanePool();
  const [rows] = await pool.query(
    `SELECT BIN_TO_UUID(id) AS id, BIN_TO_UUID(agency_id) AS agencyId,
            BIN_TO_UUID(broker_id) AS brokerId, legal_name AS legalName, status,
            db_name AS dbName
     FROM employer WHERE id = UUID_TO_BIN(:employerId) LIMIT 1`,
    { employerId }
  );
  return (rows as EmployerRegistry[])[0] ?? null;
}

/** Does this user have explicit access to this employer? (book of business) */
export async function hasEmployerAccess(userId: string, employerId: string): Promise<boolean> {
  const pool = await controlPlanePool();
  const [rows] = await pool.query(
    `SELECT 1 FROM user_employer_access
     WHERE user_account_id = UUID_TO_BIN(:userId)
       AND employer_id = UUID_TO_BIN(:employerId) LIMIT 1`,
    { userId, employerId }
  );
  return (rows as unknown[]).length > 0;
}

/**
 * The single employer a user is BOUND to, for `Me.employerId` (default routing).
 * Only single-employer personas (HR admin / employee and their variants) have one.
 * Broker/agency/platform choose an employer via the selector, so they have none.
 * Returns null unless the user has EXACTLY ONE access grant (unambiguous default).
 */
const EMPLOYER_BOUND_ROLES = new Set([
  "employer_admin",
  "employee",
  "employer_read_only",
  "employer_payroll_admin",
  "cobra_admin",
]);

export async function getBoundEmployerId(user: UserAccount): Promise<string | null> {
  if (!EMPLOYER_BOUND_ROLES.has(user.roleKey)) return null;
  const pool = await controlPlanePool();
  const [rows] = await pool.query(
    `SELECT BIN_TO_UUID(employer_id) AS id FROM user_employer_access
     WHERE user_account_id = UUID_TO_BIN(:userId) LIMIT 2`,
    { userId: user.id }
  );
  const list = rows as { id: string }[];
  return list.length === 1 ? list[0].id : null;
}

/** Employers a user may access (scope set), for list views / pickers. */
export async function listAuthorizedEmployers(user: UserAccount): Promise<EmployerRegistry[]> {
  const pool = await controlPlanePool();
  // platform-scoped roles see everything; others are scoped.
  if (user.roleKey === "platform_admin" || user.roleKey === "benefits_support_admin") {
    const [rows] = await pool.query(
      `SELECT BIN_TO_UUID(id) AS id, BIN_TO_UUID(agency_id) AS agencyId,
              BIN_TO_UUID(broker_id) AS brokerId, legal_name AS legalName, status, db_name AS dbName
       FROM employer ORDER BY legal_name`
    );
    return rows as EmployerRegistry[];
  }
  if (user.roleKey === "agency_admin" && user.agencyId) {
    const [rows] = await pool.query(
      `SELECT BIN_TO_UUID(id) AS id, BIN_TO_UUID(agency_id) AS agencyId,
              BIN_TO_UUID(broker_id) AS brokerId, legal_name AS legalName, status, db_name AS dbName
       FROM employer WHERE agency_id = UUID_TO_BIN(:agencyId) ORDER BY legal_name`,
      { agencyId: user.agencyId }
    );
    return rows as EmployerRegistry[];
  }
  // broker / employer_* / employee → explicit access grants only
  const [rows] = await pool.query(
    `SELECT BIN_TO_UUID(e.id) AS id, BIN_TO_UUID(e.agency_id) AS agencyId,
            BIN_TO_UUID(e.broker_id) AS brokerId, e.legal_name AS legalName, e.status, e.db_name AS dbName
     FROM employer e
     JOIN user_employer_access a ON a.employer_id = e.id
     WHERE a.user_account_id = UUID_TO_BIN(:userId) ORDER BY e.legal_name`,
    { userId: user.id }
  );
  return rows as EmployerRegistry[];
}
