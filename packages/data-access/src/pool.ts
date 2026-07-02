/**
 * Connection pooling. ALL tenants share one Aurora cluster (via RDS Proxy);
 * the *database name* is the tenant selector. We keep one mysql2 pool per
 * database name, cached across warm Lambda invocations. RDS Proxy handles the
 * real connection multiplexing underneath.
 */
import mysql, { type Pool, type Connection } from "mysql2/promise";
import { getConfig, getDbCredentials } from "./config.js";

const pools = new Map<string, Pool>();

/**
 * TLS for the AWS/RDS-Proxy path only. The proxy is created with `RequireTLS: true`
 * (see infra/template.yaml), so connections through it MUST use TLS; local dev MySQL
 * is plaintext. We enable TLS only when an AWS DB path is configured (a Secrets
 * Manager ARN or an RDS Proxy endpoint is present) and return `undefined` locally so
 * `bun local/setup.ts` + tests keep working unchanged. `rejectUnauthorized: true`
 * verifies the server cert against the runtime trust store (the nodejs20.x Lambda
 * image trusts the Amazon root CAs that sign RDS Proxy certificates).
 */
function dbTlsOption(): { rejectUnauthorized: boolean } | undefined {
  const useTls = Boolean(process.env.DB_SECRET_ARN || process.env.RDS_PROXY_ENDPOINT);
  return useTls ? { rejectUnauthorized: true } : undefined;
}

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
    // TLS is required through RDS Proxy (RequireTLS); enabled only on the AWS path.
    ssl: dbTlsOption(),
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
    ssl: dbTlsOption(), // TLS on the AWS/RDS-Proxy path; undefined locally
    multipleStatements: true, // isolated to migrations
    // NOTE: namedPlaceholders is intentionally OFF here. The runner executes raw
    // .sql files that may contain `?` or `:` inside comments/strings (which mysql2's
    // named-placeholder compiler would misread as bind params); its only
    // parameterized query — the schema_migrations version insert — uses positional
    // `?` with an array, which works without named placeholders.
  });
}

/**
 * Deployment bootstrap: create a database if it doesn't exist yet. Opens a
 * connection WITHOUT selecting a database (MySQL allows this) and runs a single
 * `CREATE DATABASE IF NOT EXISTS`. Aurora's cluster has no default database, so the
 * control-plane DB must be created before DbMigratorFn can connect to it. Idempotent
 * and safe to re-run. Used by the migration Lambda only — NOT on the request path.
 */
export async function ensureDatabase(database: string): Promise<void> {
  // The database name cannot be a bind parameter; it is server/deploy-controlled,
  // never client input, but validate defensively before interpolating.
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Refusing to create database with unsafe name: ${database}`);
  }
  const creds = await getDbCredentials();
  const conn = await mysql.createConnection({
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    ssl: dbTlsOption(), // TLS on the AWS/RDS-Proxy path; undefined locally
    // no `database` selected — we are about to create it
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
  } finally {
    await conn.end();
  }
}

/** Control-plane (shared) connection. */
export async function controlPlanePool(): Promise<Pool> {
  return getPool(getConfig().controlPlaneDb);
}

/** Per-customer connection, selected by the registry's db_name. */
export async function customerPool(dbName: string): Promise<Pool> {
  return getPool(dbName);
}
