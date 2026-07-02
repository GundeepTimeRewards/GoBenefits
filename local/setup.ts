/**
 * Local bootstrap: apply migrations + reference seed + TEST fixtures to a clean
 * local MySQL (from docker-compose). Idempotent — safe to re-run.
 *
 *   1. control_plane : control-plane migrations (schema + reference seed) + test fixtures
 *   2. cust_employer_a / _b / _c : customer migrations (schema + life-event seed)
 *   3. sample employees into A and B
 *
 * Usage:  bun local/setup.ts        (after `docker compose up -d`)
 * Also imported by the tenant-isolation tests' beforeAll.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { controlPlanePool, createMigrationConnection, getConfig, runMigrations } from "@goben/data-access";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CONTROL_DIR = path.join(ROOT, "db/migrations/control-plane");
const CUSTOMER_DIR = path.join(ROOT, "db/migrations/customer");

const CUSTOMER_DBS = ["cust_employer_a", "cust_employer_b", "cust_employer_c"];

async function applyFile(database: string, file: string): Promise<void> {
  const sql = await readFile(file, "utf8");
  const conn = await createMigrationConnection(database);
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

async function ensureDatabase(name: string): Promise<void> {
  const cp = await controlPlanePool();
  await cp.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4`);
}

export async function setupLocal(): Promise<void> {
  // 1. Control-plane schema + reference seed, then test fixtures.
  await ensureDatabase(getConfig().controlPlaneDb);
  await runMigrations(getConfig().controlPlaneDb, CONTROL_DIR);
  await applyFile(getConfig().controlPlaneDb, path.join(ROOT, "local/seed-control-plane.sql"));

  // 2. Each customer DB: schema + life-event seed.
  for (const db of CUSTOMER_DBS) {
    await ensureDatabase(db);
    await runMigrations(db, CUSTOMER_DIR);
  }

  // 3. Sample employees in A and B (C left empty — archived test).
  await applyFile("cust_employer_a", path.join(ROOT, "local/seed-cust-employer-a.sql"));
  await applyFile("cust_employer_b", path.join(ROOT, "local/seed-cust-employer-b.sql"));
}

// Run directly: `bun local/setup.ts`
if (import.meta.main) {
  setupLocal()
    .then(() => {
      console.log("Local setup complete.");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
