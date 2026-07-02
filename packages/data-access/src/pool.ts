/**
 * Connection pooling. ALL tenants share one Aurora cluster (via RDS Proxy);
 * the *database name* is the tenant selector. We keep one mysql2 pool per
 * database name, cached across warm Lambda invocations. RDS Proxy handles the
 * real connection multiplexing underneath.
 */
import mysql, { type Pool, type Connection } from "mysql2/promise";
import { getConfig, getDbCredentials } from "./config.js";

const pools = new Map<string, Pool>();

/** Get (or create) a pooled connection bound to a specific database. */
export async function getPool(database: string): Promise<Pool> {
  const existing = pools.get(database);
  if (existing) return existing;

  const cfg = getConfig();
  const creds = await getDbCredentials();
  const pool = mysql.createPool({
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    database,
    connectionLimit: 5,
    namedPlaceholders: true,
    multipleStatements: false, // SECURITY: app connections never run multi-statement SQL
    timezone: "Z",
    // DATE/DATETIME columns are returned as strings, NOT JS Date objects. A JS Date
    // JSON-serializes to a full ISO datetime ("2026-01-01T00:00:00.000Z"), which is
    // NOT valid for the AppSync AWSDate scalar (expects "YYYY-MM-DD"). With
    // dateStrings, a DATE column comes back as "2026-01-01" — AWSDate-compatible —
    // and a DATETIME as "YYYY-MM-DD HH:MM:SS". Fixes plan-year (period_start/end) and
    // all employee/dependent date fields at the source, once, for every resolver.
    dateStrings: true,
    // RDS Proxy + IAM/TLS settings would go here in AWS.
  });
  pools.set(database, pool);
  return pool;
}

/**
 * Dedicated single-use connection for the MIGRATION RUNNER only.
 * multipleStatements is enabled here so a whole .sql file can run in one call —
 * this connection is NEVER used for normal application queries.
 */
export async function createMigrationConnection(database: string): Promise<Connection> {
  const creds = await getDbCredentials();
  return mysql.createConnection({
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    database,
    multipleStatements: true, // isolated to migrations
    // NOTE: namedPlaceholders is intentionally OFF here. The runner executes raw
    // .sql files that may contain `?` or `:` inside comments/strings (which mysql2's
    // named-placeholder compiler would misread as bind params); its only
    // parameterized query — the schema_migrations version insert — uses positional
    // `?` with an array, which works without named placeholders.
  });
}

/** Control-plane (shared) connection. */
export async function controlPlanePool(): Promise<Pool> {
  return getPool(getConfig().controlPlaneDb);
}

/** Per-customer connection, selected by the registry's db_name. */
export async function customerPool(dbName: string): Promise<Pool> {
  return getPool(dbName);
}
