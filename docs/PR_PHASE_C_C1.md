# PR: Phase C (C1) — foundation resolvers wired to the Phase B contract

> **Do not merge / do not deploy yet.** This PR is the C1 backend slice only.
> **C2 frontend seam swap is NOT included.** **AppSync deployment wiring is NOT included.**

## C1 scope summary

Wires the Phase C **C1** foundation resolvers against the Phase B schema
(`api/schema.graphql`), each behind the verified `getCustomerDb(ctx, permission,
employerId)` tenant control. Operations wired (exactly the approved slice):

- **Reads:** `me`, `myEmployers`, `employer`, `planYears`, `currentPlanYear`,
  `employerCensusContext`, `employees`, `employeeDetail`, `dependents`
- **Mutations:** `createEmployee`, `updateEmployee`, `addDependent`, `updateDependent`,
  `removeDependent`

Explicitly **out of scope / not built**: all aggregate workspaces
(`employerOverview`, `enrollmentCenter`, `enrollmentProgress`, `electionReview`,
`lifeEventQueue`, `documentWorkspace`, `deductionsWorkspace`, `payrollDataWorkspace`,
`carrierExportWorkspace`, `complianceWorkspace`), all Phase D–F mutations, employee
self-service, and `planYearActivity` (deferred — needs an audit-feed source that does
not exist in C1).

## Files changed

**New**
- `packages/employer/{package.json,tsconfig.json}`
- `packages/employer/src/{index,types,plan-year-repository,service}.ts`
- `packages/employer/test/employer.test.ts`
- `packages/data-access/src/roles.ts`
- `packages/data-access/test/role-mapping.test.ts`
- `api/resolvers/test/handler.test.ts`
- `db/migrations/control-plane/0003_phase_c_grants.sql`
- `scripts/validate-schema.ts`

**Modified**
- `api/resolvers/src/handler.ts` — full reconcile to `employerId`; add `employer`,
  `planYears`, `currentPlanYear`; fix `me` (role mapping + bound employerId) and
  `myEmployers` (EmployerSummary shape, no fan-out); pass `employerId`-carrying
  mutation inputs through; remove dead `employee` singular case; preserve fail-closed.
- `api/resolvers/package.json` — add `@goben/employer` dependency.
- `api/schema.graphql` — two nullability edits (see below).
- `packages/data-access/src/index.ts` — export `roles.js`.
- `packages/data-access/src/control-plane.ts` — add `getBoundEmployerId`.
- `packages/data-access/src/pool.ts` — `dateStrings: true` (AWSDate serialization).
- `packages/census/src/{types,repository,service}.ts` — census-context additions +
  `planYearId` threading.
- `packages/census/test/census.test.ts` — non-null completeness test.
- `local/seed-cust-employer-a.sql` — seed plan years.
- `package.json` — `schema:validate` + `test:employer` scripts; typecheck includes
  `employer`; `test:unit` includes role-mapping; add `graphql` dev dependency.

## Schema changes

Two minimal nullability relaxations (no placeholder values needed). `buildSchema`
passes (`bun run schema:validate` → 129 types, refs resolve).

| Type.field | Before | After | Why |
|---|---|---|---|
| `EmployerSummary.employeeCount` | `Int!` | `Int` | R1 — `myEmployers` must not fan out across tenant DBs to compute per-employer counts; null in C1. |
| `Employer.currentPlanYearId` | `ID!` | `ID` | A newly-provisioned employer may have no plan year yet; non-null was unsatisfiable. |

`Employer.employeeCount` stays `Int!` — computed from the employer's **own**
single-tenant DB (one routed read, not a fan-out).

## Role mapping table (decision R6)

Explicit closed table in `packages/data-access/src/roles.ts`. `Me.role` is FE-nav
only; backend access is always enforced by `ctx.permissions`, so the mapping never
widens real privilege.

| DB `role.key_name` | GraphQL `Role` |
|---|---|
| `platform_admin` | `super_admin` |
| `benefits_support_admin` | `support` |
| `agency_admin` | `agency_admin` |
| `broker` | `broker` |
| `employer_admin` | `employer_admin` |
| `employee` | `employee` |
| `employer_read_only` | **unmapped → fail closed** |
| `employer_payroll_admin` | **unmapped → fail closed** |
| `cobra_admin` | **unmapped → fail closed** |

The specialized employer sub-roles have no GraphQL `Role` equivalent and are not
exercised by any C1 surface. Rather than up-privilege them to `employer_admin` (more
restricted) or mislabel them as `employee` (wrong surface), C1 **fails closed**
(`RoleMappingError` → `Unauthorized`) until the Role enum is expanded — out of C1
scope per R6 ("do not redesign the full role model").

## Placeholder / null behavior

- **`EmployerCensusContext.needsReviewCount` = `0`** — the only documented zero
  placeholder (real source is the not-yet-built census review/exception pipeline).
  The other two new counts are **real**: `missingEligibilityClassCount`,
  `dependentsMissingDataCount`.
- **`myEmployers`** returns per-tenant metrics as `null`
  (`employeeCount`/`activeCount`/`currentPlanYearId`/… ) — by design (R1, no fan-out).
- **`Employer`** optional display fields (`industry`/`renewalMonth`/`agency`/`broker`)
  return `null` (nullable in the contract); `PlanYear` OE/readiness aggregate fields
  return `null` (Phase D); `PlanYear.planCount` is a real single-tenant count.

## Test results

| Command | Result |
|---|---|
| `bun run schema:validate` | ✅ Schema OK — 129 types, 27 queries, 44 mutations |
| `bun run typecheck` | ✅ PASS (6 tsconfigs) |
| `bun local/setup.ts` | ✅ `Local setup complete.` (migration `0003` + plan-year seed) |
| `bun run test:tenant` | ✅ 17 pass / 0 fail |
| `bun run test:census` | ✅ 15 pass / 0 fail |
| `bun run test:dependents` | ✅ 6 pass / 0 fail |
| `bun test packages/employer` | ✅ 8 pass / 0 fail |
| `bun test` (full) | ✅ **89 pass / 0 fail** |

Verified on local **MySQL 8.0.31** (the foundation's verification env). New tests:
role-mapping (3), employer (8), handler dispatch (15), census non-null (1) → 63 → 89.

## Remaining risks

- **`dateStrings: true` is global** to the app pool — correct for AWSDate/AWSDateTime;
  future code must expect date **strings**, not JS `Date` objects. (Migration runner
  uses a separate connection; unaffected.)
- **`employer`/`planYears` each do one extra single-tenant read** — fine at ~200
  employers; must never become a per-tenant loop in `myEmployers` (kept out per R1).
- **DECIMAL `salary` returns as a string** from mysql2 (pre-existing, untouched);
  revisit when salary data lands and the FE needs a JS number.
- **Specialized employer roles fail closed on `me`** — intended; a real user with such
  a role would be locked out of `me` until the Role enum is expanded (none in fixtures).

## Not included (explicit)

- **C2 frontend seam swap is NOT included** in this PR.
- **AppSync deployment wiring is NOT included** (no data-source attachment / SAM/
  CloudFormation changes); this PR is resolver + package + schema code only.

## Reviewer checklist

- [ ] No aggregate workspace resolvers were added (handler has only the 14 C1 fields).
- [ ] No employee self-service was added.
- [ ] All employer-scoped reads/writes route through `getCustomerDb` (census,
      dependents, and the new employer/plan-year service).
- [ ] `myEmployers` does **not** fan out across customer DBs (control-plane only).
- [ ] Specialized employer roles (`employer_read_only`, `employer_payroll_admin`,
      `cobra_admin`) fail closed in role mapping.
- [ ] `EmployerSummary.employeeCount` and `Employer.currentPlanYearId` nullable
      handling is intentional (R1 / no-plan-year case).
- [ ] `planYearActivity` is deferred (not implemented in C1).
