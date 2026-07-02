/**
 * Control-plane migration Lambda. Applies db/migrations/control-plane/*.sql
 * (schema + seed) to the shared control-plane database. Run on deploy.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig, runMigrations } from "@goben/data-access";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// repo layout: migration/runner/src -> db/migrations/control-plane
const CONTROL_PLANE_DIR = path.resolve(HERE, "../../../db/migrations/control-plane");

export const handler = async (): Promise<{ applied: string[] }> => {
  const applied = await runMigrations(getConfig().controlPlaneDb, CONTROL_PLANE_DIR);
  return { applied };
};
