/**
 * Tenant provisioner Lambda. Creates a new per-customer database, applies the
 * customer schema + seed, and registers the employer in the control-plane
 * tenant registry. Idempotent: safe to re-run for an existing customer.
 *
 * Event: { legalName, ein?, agencyId?, brokerId?, legacyUserDb? }
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { controlPlanePool, runMigrations } from "@goben/data-access";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CUSTOMER_DIR = path.resolve(HERE, "../../../db/migrations/customer");

type ProvisionInput = {
  legalName: string;
  ein?: string;
  agencyId?: string;
  brokerId?: string;
  legacyUserDb?: number;
};

function dbNameFor(legacyUserDb?: number): string {
  // Stable, collision-free naming. For migrated tenants, mirror legacy hcmuser<N>.
  return legacyUserDb ? `cust_legacy_${legacyUserDb}` : `cust_${Date.now().toString(36)}`;
}

export const handler = async (input: ProvisionInput): Promise<{ employerId: string; dbName: string; applied: string[] }> => {
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
  return { employerId, dbName, applied };
};
