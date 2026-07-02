# GoBenefits V4 — Phase 0 Infrastructure Plan

**Status:** Draft v1 · **Date:** 2026-06-30
**Goal:** establish the foundation — infra, tenant routing, DB connection pattern,
config, and skeleton APIs — **before** any business module. No business logic yet.

---

## 1. SAM `template.yaml` structure

A single SAM application (`infra/template.yaml`) using nested/embedded
CloudFormation for stateful infra. Top-level resources:

- **AppSync GraphQL API** (`AWS::AppSync::GraphQLApi`, Cognito user-pool auth) +
  schema from `api/schema.graphql` + resolvers wired to Lambda data sources.
- **Lambda functions** (see §2) — `AWS::Serverless::Function`, Node 20, TypeScript
  (esbuild), in a VPC (private subnets) to reach Aurora/RDS Proxy.
- **Cognito** user pool + app client (`AWS::Cognito::UserPool`).
- **Aurora MySQL Serverless v2 cluster** + **RDS Proxy** + DB subnet group +
  security groups (CloudFormation).
- **KMS key** (encryption), **Secrets Manager** secret (DB creds), **S3 bucket**
  (documents), **EventBridge bus** + **SQS queues** (skeleton, for later modules).
- **IAM roles** scoped least-privilege per function.

Parameters: `Env` (dev/staging/prod), `VpcId`, `SubnetIds`, `DbMinACU/DbMaxACU`.
SAM `Globals` set runtime, timeout, tracing (X-Ray), and VPC config for all funcs.

## 2. Lambda functions needed for MVP foundation

Phase 0 ships only the foundation set:

- **`graphql-resolver`** — the primary AppSync resolver (one function, routed by
  field, or a small set per domain later). In Phase 0 it serves `me`,
  `myEmployers`, and a stubbed `employees` to prove tenant routing end-to-end.
- **`tenant-provisioner`** — creates a per-customer DB, applies the customer
  migrations + seed, registers the employer in the control-plane tenant registry.
- **`migration-runner`** — orchestrated by Step Functions later; Phase 0 = a
  skeleton that applies `db/migrations/customer/*` to a target DB.
- **`db-migrator`** — applies `db/migrations/control-plane/*` (and is reused by
  the provisioner for per-customer). Run on deploy.

Business-module functions (enrollment, payroll, exports…) come in later phases.

## 3. AppSync / API structure

- GraphQL schema already defined in `api/schema.graphql`.
- **Auth:** Cognito user pools; JWT carries `sub`. AppSync passes identity to the
  resolver Lambda via `event.identity`.
- **Resolver model:** Lambda data source. Each request → resolve user → authorize
  (permission × scope) → route to the right DB → execute.
- **Subscriptions:** `onCustomerProgressChanged` published by an EventBridge
  consumer (later); wiring stubbed now.

## 4. Tenant resolution / routing strategy (the #1 security control)

Per request, in `packages/data-access`:

1. **Identify user:** read `event.identity.sub` (Cognito). Look up `user_account`
   in the **control-plane** by `cognito_sub` → role, agency/broker scope.
2. **Determine target employer:** from the operation's `customerId` arg, or — for
   `employer_admin`/`employee` — their bound employer (via `user_employer_access`
   / their employee record).
3. **Authorize (permission × scope):**
   - *Permission:* the user's role must grant the required permission key
     (`role_permission`).
   - *Scope:* the target employer must be in the user's authorized set
     (`user_employer_access`, or agency match for `agency_admin`; `platform_admin`
     and `benefits_support_admin` are platform-scoped). **Broker never resolves an
     employer outside their book.**
4. **Route:** look up `employer.db_name` in the registry → open a **customer
   connection** to that database (same cluster/proxy, switch database).
5. **Tenant id is never taken from client input for data access** — only used to
   *select among* employers the user is already authorized for.
6. **Audit:** support/admin mutations record `audit_event.done_by` = the acting
   user (support users are identifiable, never impersonated silently).

## 5. Control-plane database access

- Fixed connection to the `control_plane` database via RDS Proxy.
- Holds: agency, broker, employer registry, user_account + access, role/permission,
  carrier, benefit_type, setup-step definitions, customer_progress aggregate,
  migration registry.
- A small `ControlPlaneRepo` in `packages/data-access` (no business logic) for
  user lookup, employer lookup, scope checks.

## 6. Per-customer database access

- Same Aurora cluster + RDS Proxy; the **database name** is the tenant selector
  (`cust_<id>`). A `CustomerDb` factory opens a pooled connection bound to that
  database (mysql2 `database` option / `USE`).
- Connection reuse: cache per `db_name` within a warm Lambda; RDS Proxy handles
  pooling across invocations.
- **Cross-DB references are soft** — `benefit_type_key`, `step_key`, `source_db`
  validated in the service layer, never by FK.

## 7. Migration runner approach

- **Plain SQL files**, ordered (`0001_init`, `0002_seed_…`), per tier folder.
- A lightweight runner records applied versions in a `schema_migrations` table
  (one per database). Idempotent; re-runnable.
- **Control-plane:** run once per deploy (`db-migrator`).
- **Per-customer:** the `tenant-provisioner` runs `customer/*` on DB creation;
  schema upgrades run `customer/*` across **all** tenant DBs (loop over registry),
  later orchestrated by Step Functions for safety/observability.
- **Legacy ETL** (separate, later): Lambda reads SQL Server `hcmuser<N>` → staging
  → transform → load (no DMS), per `IMPLEMENTATION_PLAN.md`.

## 8. Secrets / configuration strategy

- **Secrets Manager:** Aurora master/app credentials (one secret; the app selects
  the database per tenant — no per-tenant secret needed since they share the
  cluster). Integration tokens (ADP/Bamboo/QB/Adobe) added per module later.
- **SSM Parameter Store / env vars:** non-secret config (RDS Proxy endpoint,
  control-plane DB name, S3 bucket, region, EventBridge bus name).
- **KMS:** encrypt the secret, S3 objects, and app-level field encryption for
  `ssn_enc`.
- `packages/data-access/config.ts` centralizes resolution (env → SSM → Secrets).

## 9. Local / dev environment assumptions

- **Node 20 + TypeScript**, bun for the monorepo workspaces.
- **Local DB:** a local MySQL 8 (Docker) with the same migrations applied; a
  `control_plane` DB + one or two `cust_*` DBs for testing routing.
- **`sam local invoke` / `sam local start-api`** for Lambda; AppSync mocked or a
  thin local GraphQL harness for resolver tests.
- Secrets faked via local env vars; no real AWS calls required to run unit tests.
- **Tenant-isolation tests** run locally against the two-DB setup.

## 10. Deployment order

1. Network + KMS + Secrets (VPC params provided).
2. Aurora cluster + RDS Proxy.
3. `db-migrator` → apply control-plane migrations + seed.
4. Cognito user pool + app client.
5. Lambda functions + IAM.
6. AppSync API + schema + resolver wiring.
7. S3 + EventBridge + SQS (skeleton).
8. Smoke test: authenticate → `me` → `myEmployers` → routed `employees` stub.
9. (Per tenant, on demand) `tenant-provisioner` creates + migrates a customer DB.

---

## Phase 0 "done" criteria

- `sam deploy` stands up the stack in `dev`.
- A Cognito user can call `me` and `myEmployers`.
- A routed query reaches the correct per-customer DB and **cannot** reach an
  employer the user isn't authorized for (isolation test passes).
- Control-plane + customer migrations apply cleanly and idempotently.
- No business module logic yet.
