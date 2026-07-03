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
