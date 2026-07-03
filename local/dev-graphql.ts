/**
 * LOCAL-ONLY GraphQL dev endpoint for the frontend.
 *
 * Serves api/schema.graphql over HTTP and dispatches each Query/Mutation field to the
 * REAL resolver `handler` (api/resolvers) against local MySQL — the same shape AppSync
 * uses: { info.fieldName, arguments, identity.sub }. This gives the browser SPA a
 * callable GraphQL endpoint for C1 hybrid mode WITHOUT any AWS dependency.
 *
 *   bun local/dev-graphql.ts            # starts on http://localhost:4000/graphql (GraphiQL)
 *   GRAPHQL_PORT=4100 bun local/dev-graphql.ts
 *
 * Auth is a DEV SHIM only (never real Cognito): the seeded `cognito_sub` is taken from
 * the `x-dev-auth-sub` header, else the `Authorization` header value, else the
 * DEV_AUTH_SUB env var. See local/seed-control-plane.sql for available subs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, GraphQLScalarType, GraphQLError, Kind } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createYoga } from "graphql-yoga";
import { handler as realHandler } from "../api/resolvers/src/handler";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(HERE, "../api/schema.graphql");

/** The AppSync-event shape the resolver handler consumes. */
export type ResolverHandler = (event: {
  info: { fieldName: string; parentTypeName?: string };
  identity?: { sub?: string };
  arguments: Record<string, unknown>;
}) => Promise<unknown>;

/** Seeded dev subs (local only) — mirror local/seed-control-plane.sql. */
export const DEV_AUTH_SUBS = {
  platform: "sub-platform",
  support: "sub-support",
  agency: "sub-agency",
  broker: "sub-broker-a",
  employer_admin: "sub-emp-admin-a",
  employer_admin_b: "sub-emp-admin-b",
  employee: "sub-employee-a",
} as const;

/** Extract the dev `cognito_sub` from request headers (x-dev-auth-sub > Authorization > env). */
export function subFromHeaders(headers: { get(name: string): string | null } | Record<string, string | undefined>): string | undefined {
  const get = (name: string): string | undefined => {
    if (typeof (headers as { get?: unknown }).get === "function") {
      return (headers as { get(n: string): string | null }).get(name) ?? undefined;
    }
    const h = headers as Record<string, string | undefined>;
    return h[name] ?? h[name.toLowerCase()];
  };
  const direct = get("x-dev-auth-sub");
  if (direct) return direct;
  const auth = get("authorization");
  if (auth) return auth.replace(/^Bearer\s+/i, "").trim() || undefined;
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.DEV_AUTH_SUB;
}

// AppSync scalars have no special local semantics — pass strings through unchanged.
function passthroughScalar(name: string): GraphQLScalarType {
  return new GraphQLScalarType({
    name,
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral: (ast) => ("value" in ast ? (ast as { value: unknown }).value : null),
  });
}

/** Build an executable schema whose every Query/Mutation field dispatches to `handlerFn`. */
export function createDevSchema(handlerFn: ResolverHandler = realHandler as ResolverHandler) {
  const sdl = readFileSync(SCHEMA_PATH, "utf8");
  const introspect = buildSchema(sdl);
  const queryFields = Object.keys(introspect.getQueryType()?.getFields() ?? {});
  const mutationFields = Object.keys(introspect.getMutationType()?.getFields() ?? {});

  const makeResolver = (fieldName: string, parentTypeName: "Query" | "Mutation") =>
    async (_parent: unknown, args: Record<string, unknown>, context: { devSub?: string }) => {
      try {
        return await handlerFn({ info: { fieldName, parentTypeName }, identity: { sub: context?.devSub }, arguments: args ?? {} });
      } catch (e) {
        // Surface the backend's typed error under `extensions.errorType` (the FE client
        // reads either the top-level errorType (AppSync) or extensions.errorType (here)).
        const err = e as { message?: string; errorType?: string; name?: string };
        throw new GraphQLError(err.message ?? "Resolver error", {
          extensions: { errorType: err.errorType ?? err.name ?? "InternalError" },
        });
      }
    };

  const Query: Record<string, unknown> = {};
  for (const f of queryFields) Query[f] = makeResolver(f, "Query");
  const Mutation: Record<string, unknown> = {};
  for (const f of mutationFields) Mutation[f] = makeResolver(f, "Mutation");

  return makeExecutableSchema({
    typeDefs: sdl,
    resolvers: {
      AWSDate: passthroughScalar("AWSDate"),
      AWSDateTime: passthroughScalar("AWSDateTime"),
      AWSEmail: passthroughScalar("AWSEmail"),
      Query,
      Mutation,
    },
  });
}

/** Create the Yoga app (GraphiQL enabled). Context carries the dev sub per request. */
export function createDevYoga(handlerFn: ResolverHandler = realHandler as ResolverHandler) {
  return createYoga({
    schema: createDevSchema(handlerFn),
    graphiql: true,
    landingPage: false,
    context: ({ request }: { request: Request }) => ({ devSub: subFromHeaders(request.headers) }),
  });
}

// Ensure Kind import isn't tree-shaken away (used implicitly by graphql AST typing).
void Kind;

if (import.meta.main) {
  const port = Number((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GRAPHQL_PORT ?? 4000);
  const yoga = createDevYoga();
  // Bun.serve — local dev only.
  (globalThis as unknown as { Bun: { serve(o: { port: number; fetch: (r: Request) => Response | Promise<Response> }): { url: URL } } }).Bun.serve({
    port,
    fetch: yoga.fetch as unknown as (r: Request) => Promise<Response>,
  });
  // eslint-disable-next-line no-console
  console.log(`Local GraphQL dev endpoint: http://localhost:${port}/graphql  (GraphiQL enabled)`);
  console.log(`Dev auth: set header 'x-dev-auth-sub' or DEV_AUTH_SUB. Seeded subs: ${Object.values(DEV_AUTH_SUBS).join(", ")}`);
}
