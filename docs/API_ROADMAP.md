# GoBenefits V4 — AppSync API Roadmap (contract-first)

**Updated:** 2026-07-02 · **Phase:** A (inventory) + **B (schema SDL)** complete;
**MySQL integration verification PASSED** (63/63 on MySQL 8.0.31, see
`IMPLEMENTATION_STATUS.md`). Phase C resolvers **UNBLOCKED**. See **§10 — Current UI → API
Reconciliation** (2026-07-02) for the latest UI-to-contract alignment and the confirmed
Phase C slice.

> **Phase B done (2026-07-01):** `api/schema.graphql` rewritten as the contract —
> `employerId` everywhere (no `customerId` on public fields), `planYearId: ID!` on all
> plan-year read models, aggregate read-model types for every page/workspace, and all
> future mutations as **signatures only** (grouped + labeled `NOT IMPLEMENTED` by phase).
> Subscriptions deferred (candidate list in a trailing comment). Validated with
> `graphql.buildSchema` (121 types, references resolve). **No resolvers wired.**
> Settled decisions: (1) contract uses `employerId`, internal routing maps to the
> customer DB; (2) explicit `planYearId: ID!` + `currentPlanYear(employerId)` for defaults;
> (3) server-computed aggregate read models per page; (4) subscriptions deferred.

> ✅ **Backend status — foundation Integration-verified (2026-07-02).** The Aurora MySQL
> database-per-customer + resolver foundation (tenant routing, migrations, census,
> dependents) now passes all integration gates on a real **MySQL 8.0.31** (full suite
> **63/63**; see `IMPLEMENTATION_STATUS.md`). **Phase C resolvers are unblocked.** This
> roadmap stays **contract-first**: the SDL is agreed; wire resolvers phase-by-phase,
> keeping the FE on mocks behind each query seam until the matching resolver is ready.

This document aligns the AppSync GraphQL schema + resolver plan with the **current
mock-driven frontend**. It is derived by inventorying the FE **query seam**
(`apps/web/src/lib/api/*` hooks → `apps/web/src/lib/mock/db.ts` getters) and comparing
it to the existing `api/schema.graphql`. Field-level expectations already live in
[`FRONTEND_API_CONTRACT_GAPS.md`](FRONTEND_API_CONTRACT_GAPS.md) §3.1–§3.6; this doc is
the schema/resolver **roadmap** on top of those.

---

## 1. Principles

1. **Contract-first.** Land SDL (types, queries, mutations) + a resolver *plan* before
   any resolver code. The SDL is the source of truth the FE swaps its mock `queryFn`s to.
2. **1:1 with the FE seam.** Every `use*` hook maps to exactly one query (or mutation).
   The FE was built so "swap the queryFn only" is the whole migration — keep that.
3. **Tenant routing is the #1 control.** Every per-employer field resolves
   `permission × scope` server-side (`decideEmployerAccess`) before touching a
   customer DB. `customerId`/`employerId` from the client is a *claim*, never trusted raw.
4. **Plan-year scoped by default.** The top bar drives an active plan year; most reads
   are `(employerId, planYearId)`. The API scopes by plan year **from day one**, even
   where the current mock still returns employer-level data (documented below).
5. **Server computes; FE renders.** Readiness %, ALE/FTE, affordability, deduction math,
   1095-C codes — all server-side. No business math in the FE (see the mock "no real
   calculations" note).
6. **Gate on verification.** No resolver ships until the census/dependents/plan-year
   foundation is integration-verified against MySQL.

## 2. Conventions & open naming decisions

- **`employerId` (FE) == `customerId` (control-plane).** The schema currently uses
  `customerId`. **Decision needed:** standardize the public field name. Recommend
  exposing `employerId` in the GraphQL contract (FE-facing) and mapping to `customerId`
  at the data layer.
- **Plan-year identifier.** FE uses a **string id** (`"2027"`, `"2026"`). Schema uses
  `planYear: Int!` in places. **Decision:** use `planYearId: ID!` consistently and keep a
  `year: Int!` field on `PlanYear`. Migrate `customerProgress(planYear: Int!)` →
  `(planYearId: ID!)`.
- **Aggregate "workspace" / "readiness" reads** (dashboards, launch readiness, plan
  catalog, payroll workspace, document workspace, election review, life-event queue) are
  **server-computed read models** — one query returns a composed type. Do NOT make the FE
  stitch these from primitives. Cache-key = `(employerId, planYearId)`.
- **Status legend:** ✅ Exists in `schema.graphql` · 🟡 Partial (type exists but needs
  fields, or query exists but not plan-year-scoped) · 🆕 New.

---

## 3. Query inventory (FE hook → proposed query → status)

Grouped by the UI areas that changed. "Hook" = `apps/web/src/lib/api/*`.

### Identity, employers, plan years
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| Role/nav, "View as" | (Cognito claims) | `me: UserContext!` | ✅ | drives permission × scope |
| Employer switcher, Book of Business | `useEmployers` | `myEmployers: [Employer!]!` | ✅ | `Customer`→`Employer` rename |
| Employer dashboard / overview | `useEmployer`, `useEmployerOverview` | `employer(employerId)`, `employerOverview(employerId, planYearId): EmployerOverview!` | 🟡 | overview is a **new read model** (KPIs + needs-attention) |
| Plan Years overview cards | `usePlanYears` | `planYears(employerId): [PlanYear!]!` | 🟡 | `PlanYear` needs `status(Setup\|OpenEnrollment\|Active\|Archived)`, `oeWindow`, `completion`, `eligibleCount`, `enrollmentPct`, `launchBlockers`, `oeDaysLeft`, `needsActionCount` |
| Plan Years "Recent Activity" | `usePlanYearActivity` | `planYearActivity(employerId): [ActivityItem!]!` | 🆕 | audit feed |
| Active plan year (top bar) | `useCurrentPlanYear` | field on `Employer.currentPlanYearId` | 🟡 | resolve default |
| Plan Year Setup checklist | `usePlanYearSetupSteps` | `planYearChecklist(employerId, planYearId): [ChecklistStep!]!` | 🆕 | **derived** view (StepDefinition × domain state); no task table |

### Census & people
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| Employee Census table + filters | `useCensus` | `employees(employerId, search, filters, limit, nextToken): CensusEmployeeConnection!` | ✅ | add filter args (employmentStatus, eligibility, missingData) |
| Census KPIs / Census Health | `useCensusContext` | `employerCensusContext(employerId): EmployerCensusContext!` | 🟡 | add `missingEligibilityClassCount`, `dependentsMissingDataCount`, `needsReviewCount` |
| Employee Detail (tabs) | `useEmployeeDetail` | `employeeDetail(employeeId, employerId): EmployeeDetail!` | 🟡 | eligibility/elections/EOI/docs/audit tabs are **mock** — future sub-resolvers |
| Dependents | `useDependents` | `dependents(employeeId, employerId): [Dependent!]!` | ✅ | |

### Plans & Rates
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| Plans & Rates list | `useBenefitPlans` | `benefitPlans(employerId, planYearId): [Plan!]!` | 🟡 | add `effective`, `setupIssues` |
| Plan detail (Benefits/Rates/Elig/Docs) | `useBenefitPlanDetail` | `benefitPlanDetail(employerId, planId): PlanDetail!` | 🆕 | composite (coverage rows, rate table, contributions, eligibility, docs) |
| Plan Readiness card + table | `usePlanCatalog` | `planCatalog(employerId, planYearId): PlanCatalog!` | 🆕 | **read model**: per-plan rate/contribution/document status + launch blockers |

### Documents & Forms
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| Documents workspace | `useDocumentWorkspace` | `documentWorkspace(employerId, planYearId): DocumentWorkspace!` | 🆕 | readiness + issues + tasks + categories + docs. `Document` fields in §3.2 of gaps doc. **Migration:** preserve legacy PDFs as `Archived` searchable records |

### Enrollment Center / Progress
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| Live progress (dashboard/summary) | `useEnrollmentProgress`, `useOpenEnrollmentSummary` | `enrollmentProgress(employerId, planYearId): EnrollmentProgress!`, `openEnrollmentSummary(...): OpenEnrollmentSummary!` | 🟡 | `customerProgress` exists; these are richer read models. **OE-only numbers** (no new-hire/QLE) |
| OE dashboard (reminders/attention/by-benefit) | `useOpenEnrollmentDashboard` | `openEnrollmentDashboard(employerId): OeDashboard!` | 🆕 | |
| Launch Readiness (blockers/warnings) | `useLaunchReadiness` | `launchReadiness(employerId, planYearId): LaunchReadiness!` | 🆕 | blocker vs warning is **authoritative server-side** |
| Enrollment Windows | `useEnrollmentWindows` | `enrollmentWindows(employerId, planYearId): [EnrollmentWindow!]!` | 🆕 | OE/new-hire/QLE/special |
| Ongoing Enrollment Work | `useOngoingEnrollmentWork` | `ongoingEnrollmentWork(employerId, planYearId): [OngoingWorkItem!]!` | 🆕 | |
| Legacy events summary | `useEnrollmentEvents` | (subsumed by the above) | 🟡 | retire |

### Elections Review (HR)
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| Election review queues | `useElectionReview` | `electionReview(employerId, planYearId): ElectionReview!` | 🆕 | read model: counts + rows (issueType, changeType, status). Per-employee `electionsForEmployee` ✅ exists |

### Life Events
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| HR work queue | `useLifeEventQueue` | `lifeEventQueue(employerId, planYearId): LifeEventQueue!` | 🆕 | cases + counts + tasks. Lifecycle: `submitted→under_review→needs_documents→approved\|denied→election_window_open→election_submitted→completed` |
| Employee "Report Life Event" wizard | (employee self mock) | `myLifeEvents`, mutation `reportLifeEvent` | 🆕 | **row-level "own records only"** auth |

### Deductions & Payroll Data (two separate employer pages, one workspace)
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| Deductions + Payroll Data | `usePayrollWorkspace` | `payrollWorkspace(employerId, planYearId): PayrollWorkspace!` | 🆕 | groups: `payrollConnection`, `payrollReadiness`, `importSummary`, `importedPayPeriods`, `employeePayrollRecords`, `deductionReview`+`deductionSummary`, `deductionChanges`, `exportBatches`, `settings`, `acaLookback` (§3.5) |
| Legacy deduction list | `usePayrollDeductions` | `payrollDeductions(employerId, planYearId): [PayrollDeduction!]!` | ✅ | |
| Carrier Files | `useCarrierExports` | `carrierExportBatches(employerId, planYearId): [CarrierBatch!]!` | 🆕 | |

### Compliance (ACA + COBRA)
| UI | Hook | Proposed query | Status | Notes |
|---|---|---|---|---|
| Compliance (Overview/ACA·ALE/COBRA/Notices) | `useAcaAleSummary`, `useCobraSummary`, (page inline mock) | `complianceOverview(employerId, complianceYear): ComplianceOverview!` + sub-reads `acaFilingReadiness`, `aleDetermination`, `measurementTracking`, `affordability`, `form1095c`, `filingStatus`, `cobra`, `complianceNotices` | 🆕 | **largest new domain.** ACA lookback/affordability **fed by Payroll Data** (§3.5). Server-computed. See gaps §3.6 |

---

## 4. Mutation inventory

| Domain | Mutation | Status |
|---|---|---|
| Census | `createEmployee`, `updateEmployee` | ✅ |
| Dependents | `addDependent`, `updateDependent`, `removeDependent` | ✅ |
| Elections | `submitElection` | ✅ |
| Elections Review | `approveElection`, `sendBackElection`, `requestEOI`, `requestDependentDocs`, `approveAllReady` | 🆕 |
| Quoting | `generateQuote` | ✅ |
| Payroll | `generatePayrollDeductions` (async) | ✅ |
| Deductions | `mapDeductionCode`, `exportReadyDeductions`, `reconcileBatch` | 🆕 |
| Payroll Data | `syncPayrollProvider`, `importPayrollData`, `runAcaLookback`, `recalculateLookback` | 🆕 |
| Plan Years | `createPlanYear`, `copyFromPriorYear`, `activatePlanYear`, `archivePlanYear` | 🆕 |
| Plans & Rates | `addPlan`, `duplicatePlan`, `importRates`, `updateContributionRule` | 🆕 |
| Enrollment | `launchEnrollment`, `sendReminders`, `createEnrollmentWindow` | 🆕 |
| Life Events (employee) | `reportLifeEvent` | 🆕 |
| Life Events (HR) | `approveLifeEvent`, `denyLifeEvent`, `requestLifeEventDocs`, `openElectionWindow` | 🆕 |
| Documents | `uploadDocument`, `requestSignature`, `generateConfirmations` | 🆕 |
| Compliance | `generate1095c`, `sendToFilingPartner`, `calculateAleStatus`, `generateCobraNotice`, `recordCobraPayment` | 🆕 |

## 5. Subscriptions
- `onCustomerProgressChanged` ✅ (live OE progress). Future: `onLaunchReadinessChanged`,
  `onDeductionBatchStatus`. Low priority.

---

## 6. Phased delivery plan (post-inventory)

> Every phase after B is **gated on the census/plan-year foundation passing MySQL
> integration tests**. B is safe now (SDL only, no execution).

- **Phase A — Inventory** ✅ *(this doc).*
- **Phase B — Schema unification (SDL only, no resolvers).** Extend `api/schema.graphql`:
  rename `Customer→Employer`/`customerId→employerId`; move to `planYearId: ID!`; add the
  new read-model types (§3) + new mutations (§4) as SDL with descriptions. **Deliverable:**
  compiled, lint-clean SDL the FE can type-check against. No behavior.
- **Phase C — Verify & wire the foundation.** Run the existing census/dependents/plan-year
  resolvers against real MySQL (the blocked step). Only once green, wire:
  `employees`, `employeeDetail`, `dependents`, `employerCensusContext`, `planYears`,
  `planYearChecklist`. These are the highest-traffic, already-drafted reads.
- **Phase D — Benefits + enrollment reads.** `benefitPlans`, `planCatalog`,
  `benefitPlanDetail`; `enrollmentProgress`, `launchReadiness`, `enrollmentWindows`,
  `openEnrollmentSummary`. (Powers dashboard + Enrollment Center + Plans & Rates.)
- **Phase E — Operational workflows.** `electionReview` (+ mutations), `payrollWorkspace`
  (+ deduction/export mutations), `documentWorkspace`, life-event queue + `reportLifeEvent`.
- **Phase F — Compliance & quoting.** ACA/ALE/1095-C/COBRA read models + mutations;
  quoting. Largest, most calculation-heavy — **explicitly last**.
- **Cross-cutting (throughout):** `decideEmployerAccess` on every per-employer field;
  plan-year resolution; error/permission shapes; connection pagination on all tables.

## 7. Open decisions (need product/eng sign-off before Phase B)
1. Public id naming: `employerId` (recommended) vs keep `customerId`.
2. `planYearId: ID!` everywhere (recommended) + `year: Int` field.
3. Read-model queries as **server-computed aggregates** (recommended) vs client-composed.
4. Do dashboards/readiness need **live** subscriptions for MVP, or is polling fine?
5. Compliance is a big domain — confirm it's **Phase F / post-MVP** (matches UI, which is
   representative mock).

## 8. Do NOT build yet
- Any Phase C–F resolver before the MySQL integration verification passes.
- Compliance (ACA/ALE/1095-C/COBRA) and Quoting resolvers — SDL only for now.
- Mutations for stubbed FE actions (launch, export, generate, sync) — SDL only.
- Employee self-service authorization (row-level "own records") — design in Phase E,
  don't half-implement.

## 9. Coverage note (mock ≠ plan-year yet)
Several FE screens still read **employer-level** mock even though the API should be
plan-year-scoped (census/plans/payroll/carrier/ACA rows don't vary by year in the mock;
see `FRONTEND_ROADMAP.md`). The **API contract scopes by `planYearId` regardless** — the
FE will pass the active plan year once the real resolver returns per-year data.

---

## 10. Current UI → API Reconciliation (2026-07-02)

Second reconciliation pass after the large UI evolution (Enrollment Center, Payroll
split, Compliance tabs, Life Events split, role-aware nav). Method: inventoried
`apps/web/src/router.tsx` (routes), `lib/persona.ts` (role→nav), `lib/api/*` (query
seam), `lib/mock/db.ts` (getters), the two context providers, and every page component's
hook/getter usage, then compared against `api/schema.graphql`.

**Headline:** the contract is in good shape. **Zero `customerId`** anywhere in the FE;
employer routes are uniformly `employerId`; the query seam is used by essentially every
data page. The gaps are all **FE-seam** (not schema) except one small compliance field
set — and even that already exists. The Phase C slice below is confirmed with one
addition.

### 10.1 Readiness legend
- **Ready** = FE already on a seam hook, args stable, schema type exists → safe to wire in Phase C/D.
- **Contract-only** = schema type exists but FE renders inline/static mock or the seam
  hook isn't split yet → align FE seam first (or wire later phase), don't block Phase C.
- **Defer** = placeholder screen / later module (Phase E–F).

### 10.2 Screen-by-screen

Columns: Route · Roles · Mock getter(s) via hook · Main data objects · Proposed query ·
Mutations · Args · Status · Notes.

#### Context / Shell
| Screen | Route | Roles | Hook → getter | Main objects | Query | Args | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| Dashboard | `/dashboard` | all admin (title varies) | `useEmployer`→getEmployerProfile, `useOpenEnrollmentDashboard`→getOpenEnrollmentDashboard, `useEnrollmentProgress`→getEnrollment | KPIs, OE snapshot, needs-attention | `employerOverview` | employerId, **planYearId** | Contract-only | Dashboard should collapse to the single `employerOverview` aggregate. `getOpenEnrollmentDashboard` takes no planYearId today — add it on wiring. |
| Employer selector | top bar | roles with `employerSelector:true` (platform/agency/broker) | `EmployerSwitcher`→listEmployers | employer list | `myEmployers` | — | Ready | employer_admin has selector off (single employer). |
| Plan Year selector | top bar | all | `PlanYearSwitcher`→getPlanYears + `useActivePlanYear` | plan years, active PY | `planYears` + `currentPlanYear` | employerId | Ready | Active PY resolver = route `$planYearId` > remembered > `currentPlanYear`. Maps 1:1 to `currentPlanYear(employerId)`. |
| Role / persona switcher | top bar | mock "View as" | `RoleSwitcher`→role-context | Role enum | `me` (`me.roles`) | — | Ready | FE switcher is mock-only; real roles come from `me`. Not a mutation. |
| Sidebar nav | shell | per role (`personaNav`) | `getPersonaNav` (static config) | nav items | *(none — client config)* | — | n/a | Nav is client-side; backend enforces via `me.permissions`. No query. |

#### Employer / Agency
| Screen | Route | Roles | Hook → getter | Main objects | Query | Mutations | Args | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Agency Dashboard | `/agencies/$agencyId`, `/agency` | platform, agency | `useEmployerOverview` | agency rollup | `employerProgress` / agency rollup | — | (agencyId) planYearId | Contract-only | Cross-tenant rollup = `employerProgress(planYearId)`; agency-level aggregate not yet a named query. |
| Book of Business | `/book-of-business` | broker, agency | `useEmployers` | employer worklist | `myEmployers` (+ progress) | — | — | Ready | |
| Employer Directory | `/employers`, `/agencies/$agencyId/employers` | broker, agency | `useEmployers` | employer list | `myEmployers` | — | — | Ready | |
| Employer Overview | `/employers/$employerId` | employer + up | `useEmployer` | employer profile | `employer` / `employerOverview` | — | employerId (,planYearId) | Ready | |
| Employer Setup | `/employers/$employerId/setup` (+ locations/contacts/payroll-tax/aca-cobra) | employer_admin | `useEmployer` | setup sections | `employer` + `planYearSetupStatus` | (Phase D setup mutations) | employerId | Contract-only | Sub-routes reuse one page; setup writes are Phase D. |
| Brokers / Producers | `/agency/brokers` | agency | *(inline mock)* | broker list | `brokers`/agency query | — | agencyId | Defer | Agency-management module, later. |

#### Plan Year / Benefits Setup
| Screen | Route | Roles | Hook → getter | Main objects | Query | Mutations | Args | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Plan Years overview | `/employers/$employerId/plan-years` | employer_admin | `usePlanYears`, `usePlanYearActivity`, `useEmployer` | plan-year cards, activity | `planYears`, `planYearActivity` | (Phase D: create/copy/activate/archive) | employerId | Ready (read) | Card status derives from `PlanYear.status` enum. |
| Plan Year Setup | `/employers/$employerId/plan-years/$planYearId/setup` | employer_admin, (broker/agency nav) | `PlanYearChecklist`→`usePlanYearSetupSteps`→getPlanYearChecklist | checklist steps, completion | `planYearSetupStatus` | — | employerId, **planYearId** | Ready | Status is **derived from domain entities** (decision preserved). Mock getter ignores planYearId + returns bare `ChecklistStep[]`; schema wraps `{completionPct, blockers, steps}` — align on wiring. |
| Plans & Rates | `/employers/$employerId/benefit-plans` | employer_admin, broker | `usePlanCatalog`, `useEmployer` | plan catalog, rates, readiness | `planCatalog` | (Phase D: addPlan/duplicatePlan/importRates/updateContributionRule) | employerId, **planYearId** | Ready (read) | Route stays `/benefit-plans`; label "Plans & Rates". |
| Plan detail | `/employers/$employerId/benefit-plans/$planId` | employer_admin, broker | `useBenefitPlanDetail` | plan detail, tiers | `benefitPlanDetail` | — | employerId, **planYearId**, planId | Ready (read) | Schema query takes planYearId; mock hook currently omits it — add on wiring. |
| Eligibility & Contributions | `/employers/$employerId/eligibility-contributions` | employer_admin | *(no hook — static)* | rules | folds into `planCatalog`/plan detail | — | employerId, planYearId | Defer | Legacy/hidden; not in sidebar. Contribution rules live under Plans & Rates. |

#### People
| Screen | Route | Roles | Hook → getter | Main objects | Query | Mutations | Args | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Employee Census | `/employers/$employerId/census` | employer_admin, broker | `useCensus`, `useCensusContext`, `useEmployer` | employee rows, KPI context | `employees`, `employerCensusContext` | createEmployee | employerId, **planYearId**, search | **Ready (Phase C)** | Schema `employees` is paginated + planYearId; mock returns full list — pagination is additive. |
| Employee Detail | `/employers/$employerId/employees/$employeeId` | employer_admin, broker | `useEmployeeDetail` | profile, employment, contact, address, dependents | `employeeDetail`, `dependents` | updateEmployee | employerId, employeeId | **Ready (Phase C)** | |
| Dependents | (section of Employee Detail + employee self) | employer_admin, employee | `useDependents`→getEmployeeDetail().dependents | dependent rows | `dependents` | addDependent/updateDependent/removeDependent | employerId, employeeId | **Ready (Phase C)** | `dependent.read` grant fix landed in verification. |

#### Documents
| Screen | Route | Roles | Hook → getter | Main objects | Query | Mutations | Args | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Documents & Forms (readiness workspace, tasks, library) | `/employers/$employerId/documents` | employer_admin | `useDocumentWorkspace` | readiness %, issues, tasks, doc library | `documentWorkspace` | (Phase E: uploadDocument/requestSignature/generateConfirmations) | employerId, **planYearId** | Contract-only | One aggregate covers readiness + tasks + library. Read-wireable early; mutations Phase E. |

#### Enrollment
| Screen | Route | Roles | Hook → getter | Main objects | Query | Mutations | Args | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Enrollment Center (state-aware) | `/employers/$employerId/enrollment-events` | employer_admin | `useLaunchReadiness`, `useEnrollmentWindows`, `useOngoingEnrollmentWork`, `useOpenEnrollmentSummary`, `useEmployer` | launch state, readiness, windows, ongoing work, OE summary | `enrollmentCenter` | (Phase D: launchEnrollment/sendEnrollmentReminders/createEnrollmentWindow) | employerId, **planYearId** | Contract-only | FE uses **4 granular hooks**; schema aggregates them into one `enrollmentCenter` (`launchState/launchReadiness/openEnrollmentSummary/windows/ongoingWork`). Consolidate FE to one `useEnrollmentCenter` on wiring. Route name `enrollment-events` is legacy vs concept "Enrollment Center". |
| Enrollment Progress | `/employers/$employerId/enrollment-progress` | employer_admin; **broker/agency** (in their Employers group) | `useEnrollmentProgress`→getEnrollment | live progress, by-status | `enrollmentProgress` | (Phase D: sendEnrollmentReminders) | employerId, **planYearId** | Contract-only | **Separate surface** from Enrollment Center (decision preserved). |
| Elections Review (exception queue) | `/employers/$employerId/elections-review` | employer_admin | `useElectionReview` | review rows, EOI/doc flags | `electionReview` | (Phase E: approveElection/sendBackElection/requestEoi/requestDependentDocs/approveAllReadyElections) | employerId, **planYearId** | Contract-only | **Exception queue, not mandatory per-election review** (decision preserved). |
| Life Events Work Queue (HR/Admin) | `/employers/$employerId/life-events` | employer_admin | `useLifeEventQueue` | case rows, status | `lifeEventQueue` | (Phase E: approveLifeEvent/denyLifeEvent/requestLifeEventDocs/openElectionWindow) | employerId, **planYearId** | Contract-only | **HR surface**, distinct from employee wizard below. |
| Employee Report Life Event (wizard) | `/employee/life-events/report` | employee | *(local-state wizard, no data hook)* | event type, date, doc upload | `employeeLifeEvents` (list) | **reportLifeEvent** | *(identity-scoped)* | Defer (Phase E) | **Employee self surface** — own-records identity scope, no employerId arg. Separate from HR queue. |
| Employee self-service (My Benefits/Elections/Dependents/Documents/Life Events, Enroll) | `/employee/*` | employee | *(mostly static placeholders; EnrollPage local-state)* | own coverage/elections | `employeeLifeEvents`, `electionsForEmployee`, self read models | submitElection, reportLifeEvent | identity + employeeId | Defer (Phase E) | Identity-based own-record scoping (decision preserved). |

#### Operations
| Screen | Route | Roles | Hook → getter | Main objects | Query | Mutations | Args | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Deductions | `/employers/$employerId/deductions` | **employer_admin only** | `usePayrollWorkspace`→getPayrollWorkspace | deduction review, changes, export batches | `deductionsWorkspace` | (Phase E: mapDeductionCode/exportReadyDeductions/reconcileBatch) | employerId, **planYearId** | Contract-only | Schema splits into `deductionsWorkspace`; **FE still shares one `usePayrollWorkspace` with Payroll Data** — split the hook on wiring. Agency/broker have NO access (nav-enforced). |
| Payroll Data | `/employers/$employerId/payroll-data` (+ legacy `/payroll`) | **employer_admin only** | `usePayrollWorkspace`→getPayrollWorkspace | connection, import summary, readiness, **ACA lookback**, pay periods, records | `payrollDataWorkspace` | (Phase E: importPayrollData/syncPayrollProvider/runAcaLookback/recalculateLookback) | employerId, **planYearId** | Contract-only | Same hook-split note. |
| ACA Lookback | *(tab within Payroll Data)* | employer_admin | (part of `payrollDataWorkspace`) | measurement/stability, FT determination | `payrollDataWorkspace.aca` (`PayrollAcaLookback`) | runAcaLookback/recalculateLookback | employerId, **planYearId** | Contract-only | **No new top-level query** — it's a field on `payrollDataWorkspace` (Q13). |
| Carrier Files | `/employers/$employerId/carrier-exports` | employer_admin, broker, agency | `useCarrierExports`→getCarrierExports | export batches | `carrierExportWorkspace` | (Phase E: reconcileBatch) | employerId, **planYearId** | Contract-only | Only Operations item agency/broker retain. |

#### Compliance
| Screen | Route | Roles | Hook → getter | Main objects | Query | Mutations | Args | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Compliance workspace (tabs: Overview / ACA·ALE / COBRA / Notices) | `/employers/$employerId/compliance` | employer_admin | **`useEmployer` only — body is inline constants** | overview KPIs, needs-attention, **deadlines (Important Dates)**, 1095-C forms, ALE months, affordability, COBRA events/beneficiaries/payments, notices | `complianceWorkspace` | (Phase F: generate1095c/sendToFilingPartner/calculateAleStatus/generateCobraNotice/recordCobraPayment) | employerId, **planYearId** | Contract-only | **Biggest FE-seam gap:** no `useComplianceWorkspace` hook + no `getComplianceWorkspace` getter; the page renders hardcoded arrays. Schema type is complete. |
| Important Dates | *(section inside Overview tab)* | employer_admin | (inline `DEADLINES`) | deadline rows | `complianceWorkspace.overview.deadlines` (`ComplianceDeadline`) | — | employerId, planYearId | Contract-only | **Not a 5th tab** in the current build (4 tabs only); Important Dates is a section within Overview. **No new API name** (Q8). |
| Legacy ACA/ALE, COBRA screens | `/employers/$employerId/aca-ale`, `/cobra` | employer_admin | `useAcaAleSummary`, `useCobraSummary`→getCompliance | ACA/COBRA summary | superseded by `complianceWorkspace` | — | employerId | Defer/retire | Routable-only remnants of the pre-workspace compliance pages. |

#### Admin / Other
| Screen | Route | Roles | Hook → getter | Query | Status | Notes |
|---|---|---|---|---|---|---|
| Reports | `/reports` | platform, and each role's Reports group | *(static)* | reports module | Defer | Later. |
| Integrations | `/integrations` | platform, agency | *(static)* | integrations module | Defer | Later. |
| Settings | `/settings` | platform | *(static)* | settings module | Defer | Later. |
| Tasks / Renewals / Users / Migration | `/tasks`,`/renewals`,`/users`,`/migration` | per role | `useEmployer`/`useEmployers` or static | assorted | Defer | Admin/ops modules, later phases. |

### 10.3 Answers to the explicit questions
1. **Any UI still using `customerId`?** No. Zero occurrences in `apps/web/src` (grep-clean). Public contract is `employerId` throughout.
2. **All employer-scoped screens using `employerId` in routes?** Yes — every employer screen is under `/employers/$employerId/...`. Top-level `/benefit-plans` and `/plans-rates` exist only as **redirects** to the employer-scoped path.
3. **Plan-year-sensitive screens consistently using selected `planYearId`?** Yes at the **resolution** layer: `useActivePlanYearId()` = route `$planYearId` > remembered selection > `currentPlanYear`. Only Plan Year Setup carries `$planYearId` in the URL; the rest derive it from context. Several **mock getters still ignore planYearId** (employer-level mock data) — the contract is planYearId-scoped regardless (see §9).
4. **Which hooks read directly from mock instead of the seam?** Data pages all go through the `lib/api/*` seam. The only direct `lib/mock` reads in pages are **`getPersonaNav`** (nav config, not data) and **`DEFAULT_EMPLOYER_ID`** (router redirect constant). The real exception is the **Compliance workspace**, which bypasses the seam entirely and renders **inline constants** (no hook, no getter).
5. **Safe for real AppSync wiring now (Phase C):** `me`, `myEmployers`, `employer`, `planYears`, `currentPlanYear`, `employerCensusContext`, `employees`, `employeeDetail`, `dependents` + `createEmployee`/`updateEmployee`/`addDependent`/`updateDependent`/`removeDependent`. These are seam-wired, args-stable, and integration-verified.
6. **Should remain mock-only (for now):** all dashboards/aggregate workspaces (employerOverview, enrollmentCenter, enrollmentProgress, electionReview, lifeEventQueue, documentWorkspace, deductionsWorkspace, payrollDataWorkspace, carrierExportWorkspace, complianceWorkspace), employee self-service, and admin modules (reports/integrations/settings/renewals/migration). Wire in Phases D–F.
7. **Did the Payroll split require new API names?** The names already exist — `deductionsWorkspace` and `payrollDataWorkspace` are **separate queries** (decision preserved). The remaining work is **FE-only**: split the shared `usePayrollWorkspace` hook into `useDeductionsWorkspace` + `usePayrollDataWorkspace`.
8. **Did Compliance Important Dates require new API names?** No. It maps to the existing `complianceWorkspace.overview.deadlines: [ComplianceDeadline!]`. Note it is a **section inside the Overview tab**, not a separate 5th tab (current build has 4 tabs).
9. **Did the Life Events split require separate employee vs admin surfaces?** Yes, and the schema already reflects it: **HR** = `lifeEventQueue(employerId, planYearId)` + `approve/deny/requestDocs/openElectionWindow` mutations; **employee** = `employeeLifeEvents` (identity-scoped) + `reportLifeEvent` mutation. Two distinct surfaces (decision preserved).
10. **Route/label mismatches vs roadmap?** A few **cosmetic route-vs-concept** legacies (routes only, not API names): `/enrollment-events` → "Enrollment Center" (`enrollmentCenter`); `/benefit-plans` → "Plans & Rates" (`planCatalog`); `/aca-ale` + `/cobra` legacy routes superseded by the Compliance workspace tabs; `/payroll-deductions` (ListScreens) superseded by `/deductions`. None affect GraphQL naming. Recommend renaming `/enrollment-events`→`/enrollment-center` eventually (low priority).

### 10.4 Schema gaps caused by recent UI changes
- **None blocking.** The Phase B schema already covers every current screen's data shape,
  including compliance deadlines (Important Dates), payroll ACA lookback, doc/payroll
  readiness issues, and the enrollment aggregate.
- **Minor, additive (do at wiring time, not now):**
  - `planYearSetupStatus` wraps `{completionPct, blockers, steps}`; the mock getter
    returns a bare `ChecklistStep[]` and ignores `planYearId` — align the FE hook shape.
  - `benefitPlanDetail`/`planCatalog`/dashboard hooks should thread `planYearId` (schema
    already requires it; some mock hooks omit it).
  - `getOpenEnrollmentDashboard` (dashboard) should fold into `employerOverview` and take
    `planYearId`.

### 10.5 FE seam changes needed before those screens wire (not Phase C)
- Add `useComplianceWorkspace`→`complianceWorkspace` and convert `CompliancePage.tsx` off
  inline constants (largest single conversion).
- Split `usePayrollWorkspace` into `useDeductionsWorkspace` + `usePayrollDataWorkspace`.
- Consolidate the 4 Enrollment Center hooks into one `useEnrollmentCenter`.
- Thread `planYearId` through plan/dashboard hooks; wrap the checklist hook in
  `planYearSetupStatus` shape.

### 10.6 Phase C recommendation (confirmed, with one addition)
Your assumed slice is **correct**. Wire exactly:
`me`, `myEmployers`, `employer`, `planYears`, `currentPlanYear`, `employerCensusContext`,
`employees`, `employeeDetail`, `dependents`, and the **census/dependent mutations**
(`createEmployee`, `updateEmployee`, `addDependent`, `updateDependent`, `removeDependent`)
— these already pass integration tests.

**One addition to consider:** `planYearActivity` (drives the Plan Years overview activity
feed; read-only, employerId-scoped, no new model). Optional — include it if you want the
Plan Years overview fully live in Phase C; otherwise hold to Phase D with the other
plan-year mutations.

**Phase C exclusions (explicitly not now):** every aggregate workspace/read model
(`employerOverview`, `enrollmentCenter`, `enrollmentProgress`, `electionReview`,
`lifeEventQueue`, `documentWorkspace`, `deductionsWorkspace`, `payrollDataWorkspace`,
`carrierExportWorkspace`, `complianceWorkspace`), all Phase D–F mutations (plan-year,
plans/rates, enrollment, review, life-event, deductions/payroll, compliance), and all
employee self-service. These are Contract-only until their FE seam is aligned (§10.5) and
their phase arrives.

### 10.7 Ready to proceed?
**Yes.** The contract matches the current UI, the foundation is integration-verified, and
the Phase C slice is confirmed. No schema changes are required to start Phase C. The
aggregate-workspace FE-seam alignments (§10.5) are **not** Phase C work — they're prep for
Phases D–F and can happen independently.
