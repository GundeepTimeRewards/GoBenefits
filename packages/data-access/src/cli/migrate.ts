/**
 * Migration CLI.
 *   bun packages/data-access/src/cli/migrate.ts control-plane
 *   bun packages/data-access/src/cli/migrate.ts customer <dbName>
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../config.js";
import { runMigrations } from "../migrate.js";
import { controlPlanePool } from "../pool.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../.."); // .../V4Main

async function main() {
  const [target, dbName] = process.argv.slice(2);
  if (target === "control-plane") {
    const applied = await runMigrations(getConfig().controlPlaneDb, path.join(ROOT, "db/migrations/control-plane"));
    console.log("control-plane applied:", applied);
  } else if (target === "customer") {
    if (!dbName) throw new Error("usage: migrate customer <dbName>");
    const cp = await controlPlanePool();
    await cp.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`);
    const applied = await runMigrations(dbName, path.join(ROOT, "db/migrations/customer"));
    console.log(`${dbName} applied:`, applied);
  } else {
    throw new Error("usage: migrate <control-plane | customer <dbName>>");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
