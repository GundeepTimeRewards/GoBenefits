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
