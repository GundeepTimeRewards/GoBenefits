/**
 * GraphQL SDL validation for api/schema.graphql.
 *
 * Parses + builds the schema (buildSchema) so type references resolve and the SDL is
 * well-formed. Run: `bun run schema:validate`. Exits non-zero on any SDL error so it
 * can gate CI. This is the project's canonical schema-validation step (Phase B used
 * graphql.buildSchema; this makes it a repeatable command).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema } from "graphql";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(HERE, "../api/schema.graphql");

try {
  const sdl = readFileSync(SCHEMA_PATH, "utf8");
  const schema = buildSchema(sdl, { assumeValid: false });
  const typeCount = Object.keys(schema.getTypeMap()).length;
  const queryFields = Object.keys(schema.getQueryType()?.getFields() ?? {}).length;
  const mutationFields = Object.keys(schema.getMutationType()?.getFields() ?? {}).length;
  console.log(
    `Schema OK — ${typeCount} types, ${queryFields} queries, ${mutationFields} mutations (api/schema.graphql).`
  );
  process.exit(0);
} catch (e) {
  console.error("Schema validation FAILED:");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
