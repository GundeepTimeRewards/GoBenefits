# GoBenefits V4 — Implementation Status

**Updated:** 2026-07-01

> **API (contract-first) restart:** see [`API_ROADMAP.md`](API_ROADMAP.md). **Phase A**
> (inventory) + **Phase B** (schema SDL) are done — `api/schema.graphql` is now the full
> contract (`employerId` public naming, `planYearId: ID!` read models, aggregate
> workspace types, future mutations as signatures-only, subscriptions deferred; validated
> with `graphql.buildSchema`). **Phase C+ resolvers remain BLOCKED until the census/
> plan-year foundation passes MySQL integration tests.**

## Product decisions
- **Agencies and brokers do not manage payroll. Payroll is employer-level only.**
  (Frontend nav enforces this now; backend seed still grants `payroll.*` to
  broker/agency_admin — remove those grants in a later seed pass.)

## Milestone

> ## ✅ Integration-verified (2026-07-02)
>
> The foundation + first modules (tenant routing, migrations, census, dependents)
> are verified against a **real local MySQL 8.0.31**. All five integration gates
> pass; the full suite is **63/63**, stable across repeated runs. **Phase C
> resolvers are now UNBLOCKED.**

---

## Verification status

Verified on **MySQL 8.0.31** (`/usr/local/mysql`, 127.0.0.1:3306), user `goben`,
via `bun local/setup.ts` + `bun test`. Full suite: **63 pass / 0 fail**.

| Tier | What | Status |
|---|---|---|
| Offline | `bun run typecheck` (4 packages) | ✅ clean |
| Offline | `bun run test:unit` (validation, normalization, scope decision) | ✅ 26/26 pass |
| Integration | local bootstrap (`setup:local`) | ✅ `Local setup complete.` |
| Integration | control-plane migrations | ✅ applied |
| Integration | customer migrations | ✅ applied |
| Integration | seed + fixtures | ✅ applied |
| Integration | tenant-isolation tests (`test:tenant`) | ✅ 17/17 |
| Integration | census tests (`test:census`) | ✅ 14/14 |
| Integration | dependents + detail tests (`test:dependents`) | ✅ 6/6 |
| Integration | full suite (`bun test`) | ✅ 63/63 |

### Fixes made during verification (foundation bugs the gates surfaced)
1. **Migration runner** (`packages/data-access/src/pool.ts`): removed
   `namedPlaceholders: true` from `createMigrationConnection`. Raw `.sql` files
   contain `?`/`:` in comments/strings, which mysql2's named-placeholder compiler
   misread as bind params (customer `0002` seed failed on a `?` inside a comment).
   The runner's only parameterized query — the `schema_migrations` version insert —
   uses positional `?`, which works without named placeholders.
2. **Reference seed** (`db/migrations/control-plane/0002_seed_reference_data.sql`):
   granted `dependent.read` to `broker`, `employer_admin`, and `employee` (they had
   `dependent.manage` but not `.read`, so `listDependents` — which requires
   `dependent.read` — failed). Mirrors how `employee.read`+`.create/.update` are
   paired elsewhere; dependent access stays row-scoped in the app layer.
3. **Tenant-isolation test** (`packages/data-access/test/tenant-isolation.test.ts`):
   the platform-routing assertion used exact-equality on `cust_employer_a`'s employee
   list, which is brittle when the census/dependents suites add rows in a full run.
   Rewrote it to assert routing + cross-tenant **isolation** (seed present in its own
   tenant, never leaking across) — order-independent and a stronger isolation check.

### Local env (already configured on this machine)
- MySQL **8.0.31** running (`/usr/local/mysql`, root pw `tryit4me`).
- `.env` at repo root → `DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=goben DB_PASSWORD=goben`.
- MySQL `goben`@`localhost`/`127.0.0.1`/`%` (pw `goben`, `mysql_native_password`, ALL priv).
- Databases `control_plane`, `cust_employer_{a,b,c}` (from `local/init/01-create-databases.sql`).
- Root-level workspace symlink `node_modules/@goben/{data-access,census}` so
  `local/setup.ts` resolves `@goben/data-access` from the repo root.

### Re-run (from repo root — `.env` supplies creds; note `test:*` scripts set `DB_USER ??= root`, so run from root where `.env` sets `DB_USER=goben`)
```
bun local/setup.ts     # → Local setup complete.
bun run test:tenant    # 17/17
bun run test:census    # 14/14
bun run test:dependents # 6/6
bun test               # 63/63 (full)
```

---

## Module status

| Area | Code | Offline tests | Integration tests | Notes |
|---|---|---|---|---|
| Phase 0 foundation (tenant routing, RDS Proxy pattern, migration runner, SAM skeleton) | drafted | ✅ scope decision | ✅ tenant-isolation 17/17 | the security core |
| Control-plane schema + RBAC + catalogs + migration registry | drafted | n/a | ✅ migrations applied | idempotent |
| Per-customer schema (decomposed, ~55 tables, FKs) | drafted | n/a | ✅ migrations applied | incl. employee_number |
| Reference seed (roles/permissions/benefit types/steps/life events) | drafted | n/a | ✅ applied (+dependent.read fix) | idempotent |
| Module 1 — Census (list/get/create/update + context) | drafted | ✅ validation, normalization | ✅ census 14/14 | |
| Module 1b — Employee Detail + Dependents | drafted | ✅ dependent validation | ✅ dependents 6/6 | |
| Phase D-5 — Plan-year lifecycle mutations (create / renewal copy-forward / activate / archive) | done | n/a | ✅ plan-year-mutations 10/10 | copy-forward deep-copies plans+options+rates as drafts, year-shifted effective dates; activate enforces single-active; `plan_year.manage` co-granted to employer_admin (0006) |
| Phase D-6 — Plans & Rates mutations (addPlan / duplicatePlan / importRates / updateContributionRule) | done | n/a | ✅ plan-mutations 9/9 | contract finalized: `importRates` = sync per-plan rate-table REPLACE (was JobHandle stub); `updateContributionRule` = employer-level upsert (was per-plan stub); `ActionResult.id` added; manage grants co-granted to employer_admin (0007) |
| Phase D-7 — Enrollment mutations (launch / reminders / create window) | done | n/a | ✅ enrollment-mutations 7/7 | launch gates on zero checklist blockers + open OE window, invites idempotently; reminders audience-filtered (all/not_started/in_progress), never target submitted; createEnrollmentWindow finalized with dates input, OE windows attach to the existing OE event |
| Phase E-1 — Elections Review (read model + approve / send-back / EOI / docs / approve-all) | done | n/a | ✅ election-review 7/7 | exception-queue semantics; migration 0003 adds review_flag/review_note to employee_election; approve blocks on open requests; approve-all takes only clean rows; HR-queue read additionally gated on employee.read |
| Phase E-2 — Golden-master rate engine + deduction generation | done | ✅ rate-engine 9/9 | ✅ deduction-generation 5/5 | new @goben/rate-engine package (pure; §4 legacy rules: ER = eeBase×empPct + depPremium×depPct, EE derived so shares sum to the cent, per-pay = monthly×12÷frequency); generatePayrollDeductions writes per-paycheck rows idempotently + updates election costs (clears review 'missing cost'); rate-less plans skipped and counted |
| Phase E-2b — Deductions workspace + export/reconcile/mapCode | done | n/a | ✅ deductions-workspace 5/5 | full lifecycle: generate → map payroll code → export batch (Ready rows only; empty export persists no batch) → regenerate SUPERSEDES exported rows (batch FKs intact, since-last-export diff) → reconcile once; 0008 enforces payroll = employer-only (broker/agency payroll.read revoked) |
| Phase E-4 — Life events (HR queue + employee own-records self-service) | done | n/a | ✅ life-events 5/5 | full QLE loop: employee reports (email-linked own-records identity: user_account.email = employee_contact.email, seeded emp.a@test → Aaron) → HR queue → request docs → approve/deny (decision trail) → openElectionWindow creates a life_event enrollment event + 30-day window on the active year; HR queue gated on employee.read like elections review |
| Phase E-3 — Documents workspace (metadata-first) + upload/signature/confirmations | done | n/a | ✅ documents 5/5 | NO local file bytes (product decision 2026-07-03): s3_key reserved at insert, prod uploads via presigned URL; plan-doc readiness uses the SAME document_link signal as the catalog; generateConfirmations idempotent per approved-election employee (+signature request); documents.read co-granted to employer_admin/broker (0009) |
| Phase E-5 — Payroll data + ACA lookback | done | n/a | ✅ payroll-data 6/6 | customer migration 0004 adds the import staging tables 0001 never carried; importPayrollData finalized with a rows payload (census match by employee_number, unmatched staged + counted); runAcaLookback: 12-month standard measurement ending at latest import, FT at avg ≥ 130 hrs/mo (§4980H), employee_aca upserted; workspace assembles connection/imports/readiness/ACA from real rows. COMPLETES the Phase E backend |
| Phase F-1 — COBRA (events / beneficiaries / notices / elections; NO payments — TPA) | done | n/a | ✅ cobra 4/4 | scope decision 2026-07-03: TPA administers premiums (recordCobraPayment fails closed with the reason; cobra_payment unused); qualifying events auto-create QBs (employee + dependents) with the 44-day notice deadline; election notice = metadata-first document + 60-day window; createCobraEvent/recordCobraElection added as additive contract finalizations |
| Phase F-2 — ACA compliance workspace (ALE + affordability + 1095-C; NO e-file) | done | n/a | ✅ aca-compliance 5/5 | ALE: monthly FT (130+ hrs) + FTE (capped PT ÷ 120) from imports, ALE at avg ≥ 50; affordability: W-2 safe harbor via the SAME rate engine as deductions (per-year IRS pct table); generate1095c: simplified code set (1E/1H, 2C/2B), idempotent, migrated filed/corrected rows immutable (archive-retrieval decision); sendToFilingPartner fails closed (e-file deferred); complianceWorkspace embeds the F-1 cobra section |
| Phase F-3 — Quoting (legacy Step1–5 census-composition proposal) | done | n/a | ✅ quoting 3/3 | "use legacy system" decision: reproduced the Step1–5 wizard — active employees tiered from dependents (family/ee_spouse/ee_child/ee), each requested plan costed via @goben/rate-engine (same monthly math as deductions) using the contribution rule, aggregated per plan, persisted (customer migration 0005 quote/quote_line); rate.manage; ER+EE reconcile to total in aggregate |
| Phase F-4 — Compliance FE (CompliancePage live: ACA/ALE + COBRA + notices + 1095-C) | done | ✅ operations 12/12 | browser-verified (hybrid-live) | the roadmap's biggest FE-seam gap closed — CompliancePage read inline constants, now wired to complianceWorkspace via useComplianceWorkspace (null→mock fallback); overview/ALE/affordability/forms/COBRA/notices all live; Generate 1095-C + Recalculate ALE buttons live; Send to Filing Partner disabled (e-file deferred); schema fix: AcaReadinessIssue type + CobraBeneficiary.name (F-1 latent mismatch) |
| Decision Support 1 — Plan comparison + recommendation (first EN differentiator) | done | ✅ decision-support 9/9 | ✅ plan-comparison 5/5, browser-verified (mock) + live query (hybrid) | new pure total-cost-of-care estimator in @goben/rate-engine (member OOP = min(deductible + coinsurance×(billed−deductible), billed, OOPmax); usage low/med/high = $1k/$6k/$25k billed, default coinsurance 0.2); `planComparison(employerId, planYearId, employeeId, usage)` prices each active medical plan with the SAME rate engine as deductions → annual premium + estimated care → ranks by total annual cost → recommends lowest with savings delta; employee own-records guard (resolves caller's own employeeId, ignores passed id); FE PlanComparisonCard in the enrollment wizard's Compare step (usage toggle re-ranks; recommendation + HSA badges + "Save up to $X/yr"); live query rate-engine parity confirmed via API |
| Decision Support 2 — AI benefits assistant (grounded employee Q&A) | done | ✅ llm/bedrock 6/6 + assistant-prompt 8/8 | ✅ assistant 6/6, browser-verified (mock) + live round-trip (dev fake) | first LLM integration. NEW `@goben/llm` package = narrow LlmClient port + BedrockLlmClient (Converse API, injectable client) + FakeLlmClient; provider chosen = AWS Bedrock (Claude). `askBenefitsAssistant(employerId, planYearId, employeeId, question, usage)` mutation: benefit_plan.read + employee own-records (same guard as planComparison); GROUNDS the model ONLY on the employee's real coverage facts (tier + priced plans + decision-support recommendation, assembled from planComparison) via a pure prompt module (anti-hallucination system prompt: "answer only from CONTEXT, else check with HR"); LLM injected so integration tests use the fake (never hit Bedrock) and assert the real data reached the prompt. FE: AssistantPage chat panel in the employee shell (usage-aware, suggested prompts, disclaimer) with a grounded mock answerer for the demo. Infra: BedrockModelId param + BEDROCK_MODEL_ID/REGION env + least-priv bedrock:InvokeModel + bedrock-runtime VPC endpoint on the resolver Lambda. Dev-only GOBEN_LLM_FAKE hook proves the live GraphQL round-trip (own-records + ValidationError + cross-tenant AuthError) without AWS. Real Bedrock call deferred to the deploy pass. |

**Not started (gated until integration is green):** enrollment, payroll exports,
carrier exports, COBRA, ACA, bulk census import, migration execution.

---

## Integration-test gates — ✅ ALL PASS (2026-07-02, MySQL 8.0.31)

1. `bun run setup:local` completes (`Local setup complete.`). ✅
2. `bun run test:tenant` — broker/employer/employee/platform/support scope +
   fail-closed (unknown/archived/disabled). ✅ 17/17
3. `bun run test:census` — scope, create-writes-correct-DB, no cross-tenant
   update, validation, employee_number dup/update/search. ✅ 14/14
4. `bun run test:dependents` — add/list/detail, A↔B isolation, parent-employee
   guard, update→remove. ✅ 6/6
5. `bun test` — full suite green. ✅ 63/63

All five pass → milestone is **Integration-verified**. Phase C resolvers unblocked.

---

## GraphQL naming review (findings)

**Fixed now (safe):**
- Removed unused legacy stub types `Employee`, `Employment`, `EmployeeConnection`
  (superseded by `CensusEmployee` / `EmployeeDetail`). No resolver impact.

**Recommended, deferred (broad renames — do after integration is green to avoid
churn before the gate):**
1. **`id` vs `<entity>Id` inconsistency.** Object types use `id` (Agency, Broker,
   Customer, PlanYear, Plan, …) while census/detail use `employeeId` /
   `dependentId`. Recommend: object **identity** fields = `id`; reserve
   `<entity>Id` for **foreign-key reference** fields (inputs/relations). Would
   change `CensusEmployee.employeeId`→`id`, `EmployeeDetail.employeeId`→`id`,
   `Dependent.dependentId`→`id`.
2. **"customer" vs "employer" terminology.** Args use `customerId`; types use
   `employer*` (`EmployerCensusContext`, `employerName`) and `Customer*`
   (`Customer`, `CustomerProgress`, `CustomerStatus`). Product language is
   Agency→Broker→**Employer**→Employee. Recommend standardizing on **employer**:
   `customerId`→`employerId` (args), `Customer`→`Employer`,
   `CustomerProgress`→`EmployerProgress`, `CustomerStatus`→`EmployerStatus`,
   `customerProgress`/`myEmployers` aligned. Mechanical but wide (touches
   resolver arg access + service mapping + tests) — batch it as one PR.

---

## Schema / API alignment with Lovable screens

| Lovable screen | API today | Gap / plan |
|---|---|---|
| Employee Census list (`employees/index.tsx`) | `employees` (CensusEmployee) + `employerCensusContext` (KPIs) | enrollment status & computed "issues" = later modules; keep screen simplified + expandable |
| Employee Profile (`employees/$employeeId.tsx`) | `employeeDetail` (personal/employment/contact/address) + `dependents` | per-coverage eligibility, elections, data-quality checklist, beneficiaries = later |
| Add/Edit employee | `createEmployee`/`updateEmployee` | bulk import deferred (gated) |
| Dependents section | `addDependent`/`updateDependent`/`removeDependent` | employee self-service (row-level own-scope) = later separate resolver |

Naming note for FE: GraphQL is camelCase (`employeeNumber`, `dateOfBirth`). The
deferred `id`/`employer` renames (above) would change a few field names — hold FE
binding on those until the rename batch lands.

---

## Next steps (integration is green)
1. ✅ Gates 1–5 passed on local MySQL 8.0.31 (2026-07-02).
2. **Phase C resolvers are now unblocked** — wire the census/dependents/plan-year
   foundation resolvers against the verified schema (`api/schema.graphql`), keeping
   the FE on mocks until each resolver is ready to swap behind its query seam.
3. Then resume modules: Employer Setup essentials → enrollment.
4. Keep the reference seed's read/manage permission pairing consistent as new
   modules add `.manage` grants (co-grant the matching `.read`).
