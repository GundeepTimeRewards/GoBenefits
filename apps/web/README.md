# @goben/web — GoBenefits frontend

The **production** GoBenefits frontend: a Vite + React 19 SPA, bundled and
deployed to **S3 + CloudFront** (see `../../IMPLEMENTATION_PLAN.md` §2). This is
the app we ship — **not** the Lovable project, which is a visual reference only.

## Run
```bash
bun install      # from V4Main root (workspace) or here
bun run dev      # vite dev server
bun run build    # tsc -b && vite build -> dist/ (upload to S3/CloudFront)
bun run typecheck
```

## Layout
```
src/
  main.tsx            entry
  App.tsx             shell (state-based view switching for now)
  styles.css          Tailwind v4 + semantic color tokens
  lib/                cn() + API-shaped mock data (census-mock, plan-year-checklist-mock)
  components/ui/      shadcn primitives (button, badge, card, input, table, progress)
  components/census/  CensusHealth, DependentsSection
  components/plan-year/ PlanYearChecklist (derived-readiness)
  pages/              CensusPage, EmployeeDetailPage, PlanYearSetupPage
```

## Status / TODO
- **Mock data only.** Field names/types mirror `../../api/schema.graphql`, so the
  swap to AppSync is a 1:1 change. No backend calls are wired.
- **Routing is simplified** (App.tsx view state). Replace with **TanStack Router**
  (file or code-based) + route guards.
- **Auth:** add Amazon Cognito (Amplify/oidc) + attach the JWT to AppSync.
- **Data layer:** add `@tanstack/react-query` + an AppSync GraphQL client; map the
  mock shapes to `employees`, `employeeDetail`, `dependents`,
  `employerCensusContext`, and the checklist's derived status.
- Carries over the simplified census, employee detail sections, dependents
  component, and derived-readiness checklist from the design pass
  (`../../docs/FRONTEND_DESIGN_PLAN.md`).
- The broad GraphQL renames (`customerId`→`employerId`, `id` vs `<entity>Id`) are
  pending (`../../docs/IMPLEMENTATION_STATUS.md`); bind field names after that lands.

## GraphQL client groundwork (C2-FE-FOUNDATION-1)

The GraphQL transport now exists as **groundwork** in `src/lib/api/`:
`config.ts` (env config), `client.ts` (typed request + error mapping), and
`operations.ts` (the 14 Phase C **C1** operations). **Mock mode remains the default —
no screen calls the live API yet.** The existing `use*` hooks still read the mock
getters, so the app runs locally with **no backend endpoint required**.

### Configure the GraphQL endpoint later (env only — never hardcoded)
Vite build-time env (e.g. `apps/web/.env.local`):

```
VITE_GRAPHQL_ENDPOINT=https://<appsync-id>.appsync-api.<region>.amazonaws.com/graphql
VITE_USE_LIVE_API=true
```

`isLiveApiEnabled()` returns true **only** when `VITE_USE_LIVE_API=true` **and**
`VITE_GRAPHQL_ENDPOINT` is set. If either is missing, the app stays in mock mode — a
missing/typo'd endpoint can never silently break screens. `createGraphQLClient()` with
no endpoint throws `NotConfigured` instead of making a request.

### Auth token provider
AppSync uses Cognito user-pool auth: send a **Cognito ID token** in the `Authorization`
header. The client takes a token provider; register it once when auth lands:

```ts
import { setAuthTokenProvider } from "@/lib/api";
setAuthTokenProvider(async () => await getCognitoIdToken()); // returns the ID token, or null
```

The default provider returns `null` (no header). Per-request the client calls the
provider, so token refresh is handled by the provider.

### Error handling
`client.request(...)` rejects with a `GraphQLClientError` whose `type` is one of
`Unauthorized` | `ValidationError` | `GraphQL` | `Network` | `NotConfigured` — mapped
from the backend's `errorType` (see `api/resolvers/src/handler.ts`). Screens can branch
on `type` (e.g. show a permission message for `Unauthorized`, field errors for
`ValidationError`).

### Remains before the C2 hook swap
Mock stays default until the backend is deployed and smoke-tested. The swap is then:
in each hook, when `isLiveApiEnabled()`, point the `queryFn`/`mutationFn` at
`runOperation(graphqlClient, operations.<name>, args)` instead of the mock getter —
query keys and component code stay the same.

## Running mock vs hybrid local-live (C2-FE-2)

**Mock mode (default) — no backend required:**
```
bun run dev            # from apps/web  (VITE_DATA_SOURCE defaults to mock)
```
Every screen uses `lib/mock/db.ts`. Nothing calls the network.

**Hybrid local-live mode — C1 foundation reads come from real local MySQL:**
```
# 1) one-time / when schema or seed changes:
bun local/setup.ts                         # from repo root (needs local MySQL)

# 2) start the local GraphQL dev endpoint (dispatches to the real resolver over MySQL):
bun run dev:graphql                        # http://localhost:4000/graphql  (GraphiQL enabled)

# 3) run the web app in hybrid mode (apps/web/.env.local):
VITE_DATA_SOURCE=hybrid
VITE_USE_LIVE_API=true
VITE_GRAPHQL_ENDPOINT=http://localhost:4000/graphql
VITE_DEV_AUTH_SUB=sub-emp-admin-a          # which seeded persona to act as
VITE_SHOW_DATA_SOURCE_BADGE=true           # optional: force the dev badge
```
Then `bun run dev`. **Only C1 read hooks** (`me`, `myEmployers`, `employer`, `planYears`,
`currentPlanYear`, `employees`, `employerCensusContext`, `employeeDetail`, `dependents`)
read live — and only for **live (UUID) employer ids**, to avoid mixing id-spaces with the
mock slug employers. All other hooks stay mock. If the endpoint/auth env is missing, hybrid
falls back to mock (a dev warning is logged and the badge shows `hybrid-fallback`).

**GraphiQL explorer:** open `http://localhost:4000/graphql` in a browser. Set an
`x-dev-auth-sub` header (GraphiQL → Headers) to a seeded sub to authorize.

**Seeded dev auth subs (local only — NOT real Cognito):**
| sub | role | scope |
|---|---|---|
| `sub-platform` | super_admin | all employers |
| `sub-support` | support | all employers |
| `sub-agency` | agency_admin | agency's employers |
| `sub-broker-a` | broker | Employer A |
| `sub-emp-admin-a` | employer_admin | Employer A |
| `sub-emp-admin-b` | employer_admin | Employer B |
| `sub-employee-a` | employee | Employer A (self-service; not a C1 read surface) |

**C1 smoke test** (server running + `bun local/setup.ts` done):
```
bun run smoke:c1                           # or: DEV_AUTH_SUB=sub-broker-a bun run smoke:c1
```
Exercises `me`, `myEmployers`, `planYears`, `employees`, `employeeDetail`, `dependents`
end-to-end against the local endpoint. No AWS.

**Dev source indicator:** a tiny corner badge (dev builds only) shows `mock` /
`hybrid-live` / `hybrid-fallback`; hidden in production and in default mock mode unless
`VITE_SHOW_DATA_SOURCE_BADGE=true`. `getDataSourceDiagnostics()` is available in devtools.

## What remains before mutation hooks / full C2 swap
- **Mutation hooks** (`createEmployee`, `updateEmployee`, `addDependent`, `updateDependent`,
  `removeDependent`) are **not** wired yet — the operation wrappers exist; the `useMutation`
  hooks + optimistic/invalidations are a fast-follow.
- **Live employer selection**: the switcher/routes still center on mock slug ids; to drive
  hybrid across a whole screen, the active employer must be a live UUID (from `myEmployers`).
- **Deployed backend**: hybrid uses the *local* endpoint; AppSync live needs FOUNDATION-DEPLOY
  (Cognito MFA fix + a target AWS account) and real Cognito auth in place of the dev sub shim.
- **Non-C1 hooks** stay mock until their Phase D–F resolvers exist.

## C1 mutation hooks + forms (C2-FE-3)

The five C1 mutations are now available as hooks (`@/lib/api`): `useCreateEmployee`,
`useUpdateEmployee`, `useAddDependent`, `useUpdateDependent`, `useRemoveDependent`. Minimal
inline forms (`components/census/C1MutationForms.tsx`) wire the existing **Add Employee**
(Census), **Edit Employee** and the **Dependents** tab (add/edit/remove) on the employee
detail page.

**Mock mode (default):** mutations are a **no-op** — nothing is persisted (matching the
prior placeholder buttons); the form shows a "Mock mode: not persisted" note. No screen
breaks; no backend required.

**Hybrid-live mode:** with `VITE_DATA_SOURCE=hybrid` + endpoint/auth configured **and a live
(UUID) employer selected**, forms submit through the C1 GraphQL mutations and, on success,
invalidate the relevant reads (`census`, `censusContext`, `employeeDetail`, `dependents`) so
the UI refreshes. A non-live (mock slug) employer stays no-op to avoid id-space mixing.

**Error handling:** `ValidationError` → inline field-style message; `Unauthorized` →
"Not permitted: …"; anything else → generic "Error: …". (`FormMutationError.type` is
`validation | unauthorized | error`.)

**Optional mutation smoke test** (writes to the local DB — off by default):
```
# server running + bun local/setup.ts done:
SMOKE_MUTATIONS=true bun run smoke:c1        # create→update employee, add→update→remove dependent
bun local/setup.ts                           # reset the local DB afterwards (the created employee remains)
```
Regular `bun run smoke:c1` is read-only and never mutates.

## What remains before broader C2 rollout
- **Live employer/plan-year selection**: the switcher/routes still center on mock slug ids;
  the active employer must be a live UUID for hybrid to drive a whole screen (incl. mutations).
- **Richer forms**: the C1 forms are intentionally minimal (name/email/relationship). Full
  field coverage + validation UX is a later design pass, not this task.
- **Deployed backend**: hybrid uses the local endpoint; AppSync live needs FOUNDATION-DEPLOY
  (Cognito MFA fix + target account) + real Cognito auth in place of the dev sub shim.
- **Non-C1 hooks/screens** (aggregate workspaces, employee self-service) remain mock-only
  until their Phase D–F backends exist.

## Hybrid UI end-to-end (C2-FE-4)

C2-FE-4 aligns the **active employer** and **active plan-year** contexts to the live UUID
id-space when hybrid mode is on, so the full C1 flow works in the browser. Mock mode is
unchanged (mock slugs). The employer switcher options come from `myEmployers` (live UUIDs
in hybrid); selecting an employer updates the plan-year context and refetches the
employer-scoped C1 reads (keyed by `employerId`). Employers with no plan year resolve to an
empty plan-year id gracefully.

### Run it end-to-end locally
```
# 1) DB + endpoint
bun local/setup.ts
bun run dev:graphql                         # http://localhost:4000/graphql

# 2) apps/web/.env.local
VITE_DATA_SOURCE=hybrid
VITE_USE_LIVE_API=true
VITE_GRAPHQL_ENDPOINT=http://localhost:4000/graphql
VITE_DEV_AUTH_SUB=sub-emp-admin-a           # or sub-broker-a / sub-agency / sub-platform

# 3) frontend
bun run dev
```

### Manual hybrid UI smoke checklist
- [ ] Employer switcher lists **live** employers (UUID-backed; e.g. "Employer A").
- [ ] Selecting a live employer navigates within `/employers/<uuid>/…` (no mock slug).
- [ ] Plan-year switcher shows the employer's live plan years; active PY = live current.
- [ ] Census page loads live employees + census KPIs for the selected employer.
- [ ] Employee detail loads a live employee; dependents tab shows live dependents.
- [ ] **Add Employee** persists (row appears after refetch).
- [ ] **Edit Employee** persists.
- [ ] **Add / Edit / Remove Dependent** persist and refresh the dependents list.
- [ ] The dev badge reads `hybrid-live`.
- [ ] Aggregate/non-C1 screens (dashboard, plans & rates, enrollment, payroll, compliance)
      remain **mock** (their hooks are not live-capable).
- [ ] An employer with no plan year does not crash (plan-year switcher hides / empty state).

Reset after mutating: `bun local/setup.ts`. Automated proof of the read + mutation paths:
`bun run smoke:c1` and `SMOKE_MUTATIONS=true bun run smoke:c1`.
