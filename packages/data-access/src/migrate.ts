/**
 * Lightweight SQL migration runner. Applies ordered *.sql files from a directory
 * to a given database, recording applied versions in `schema_migrations`.
 *
 * Multi-statement handling (see PHASE0_PLAN §migration runner hardening):
 *   - Normal app connections use multipleStatements:false.
 *   - This runner uses an ISOLATED connection with multipleStatements:true
 *     (createMigrationConnection), so a whole .sql file runs in one call.
 *   - No per-file transaction: MySQL DDL auto-commits (implicit commit), so a
 *     transaction would not roll back schema changes anyway. The runner is
 *     idempotent — an interrupted run resumes from the first unapplied file.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createMigrationConnection } from "./pool.js";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(255) NOT NULL,
    applied_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

export async function runMigrations(database: string, dir: string): Promise<string[]> {
  const conn = await createMigrationConnection(database);
  try {
    await conn.query(ENSURE_TABLE);
    const [applied] = await conn.query(`SELECT version FROM schema_migrations`);
    const done = new Set((applied as { version: string }[]).map((r) => r.version));

    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const newlyApplied: string[] = [];

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      try {
        await conn.query(sql); // multi-statement OK on this isolated connection
        await conn.query(`INSERT INTO schema_migrations (version) VALUES (?)`, [file]);
        newlyApplied.push(file);
      } catch (err) {
        throw new Error(`Migration failed at ${file}: ${(err as Error).message}`);
      }
    }
    return newlyApplied;
  } finally {
    await conn.end();
  }
}
