/**
 * DB bootstrap test (integration; requires local MySQL). Proves `ensureDatabase`
 * creates a database when absent, connecting WITHOUT a pre-selected database — the
 * deploy-time control_plane bootstrap for Aurora (which has no default DB). Idempotent.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { ensureDatabase, controlPlanePool } from "../src/index";

const TEST_DB = "goben_bootstrap_test";

async function dbExists(name: string): Promise<boolean> {
  const pool = await controlPlanePool();
  const [rows] = await pool.query(
    "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
    [name]
  );
  return (rows as unknown[]).length > 0;
}

describe("ensureDatabase (deploy bootstrap)", () => {
  beforeAll(async () => {
    const pool = await controlPlanePool();
    await pool.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  });
  afterAll(async () => {
    const pool = await controlPlanePool();
    await pool.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  });

  test("creates the database when it does not exist", async () => {
    expect(await dbExists(TEST_DB)).toBe(false);
    await ensureDatabase(TEST_DB);
    expect(await dbExists(TEST_DB)).toBe(true);
  });

  test("is idempotent (safe to re-run)", async () => {
    await ensureDatabase(TEST_DB);
    await ensureDatabase(TEST_DB);
    expect(await dbExists(TEST_DB)).toBe(true);
  });

  test("rejects an unsafe database name (no SQL injection via identifier)", async () => {
    await expect(ensureDatabase("bad; DROP DATABASE control_plane")).rejects.toThrow("unsafe name");
  });
});
