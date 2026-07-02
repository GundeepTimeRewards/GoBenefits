/**
 * Control-plane migration Lambda. Applies db/migrations/control-plane/*.sql
 * (schema + seed) to the shared control-plane database. Run on deploy.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDatabase, getConfig, runMigrations } from "@goben/data-access";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// repo layout: migration/runner/src -> db/migrations/control-plane
const CONTROL_PLANE_DIR = path.resolve(HERE, "../../../db/migrations/control-plane");

export const handler = async (): Promise<{ applied: string[] }> => {
  const db = getConfig().controlPlaneDb;
  // Aurora has no default database; the control-plane DB must exist before the
  // migration runner can connect to it. Smallest safe bootstrap (idempotent).
  await ensureDatabase(db);
  const applied = await runMigrations(db, CONTROL_PLANE_DIR);
  return { applied };
};
