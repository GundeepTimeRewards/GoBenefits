# GoBenefits V4 — Frontend ↔ API Contract Gaps

**Updated:** 2026-06-30

Tracks where the mock UI expects data the backend doesn't yet provide, naming
mismatches, and product decisions needed. Mock objects are kept API-shaped
(field names/types lean toward the GraphQL contract in `../api/schema.graphql`).

## 0. Mock-data access pattern (route-driven employer)
The active employer is read from the **route** (`$employerId`) via
`useActiveEmployerId()`; screens call the centralized `src/lib/mock/db.ts` getters
(`getCensus(employerId)`, `getPlanYears(employerId)`, `getEmployeeDetail(employerId,
employeeId)`, …). This mirrors the eventual GraphQL calls 1:1 — swap each getter
for an AppSync query keyed by the same id. **Employee detail returns null for a
wrong-employer/unknown id**, and the UI shows a friendly not-found state (it never
silently shows another employer's employee). Deep links like
`/employers/northstar/census` and `/employers/harbor/plan-years/2026/setup` work.

## 0.1 Hook → future GraphQL mapping (TanStack Query seam)
Screens call `src/lib/api/*` hooks (mock today). Each maps to a future AppSync query:

| Hook | Query key | Future GraphQL |
|---|---|---|
| `useEmployers()` | `['employers']` | `myEmployers` |
| `useEmployer(id)` / `useEmployerOverview(id)` | `['employer', id]` | `employer(id)` |
| `useCensus(id)` | `['census', id]` | `employees(customerId)` |
| `useCensusContext(id)` | `['censusContext', id]` | `employerCensusContext(customerId)` |
| `useEmployeeDetail(id, empId)` | `['employeeDetail', id, empId]` | `employeeDetail(id, customerId)` |
| `useDependents(id, empId)` | `['dependents', id, empId]` | `dependents(employeeId, customerId)` |
| `usePlanYears(id)` | `['planYears', id]` | `planYears(customerId)` |
| `usePlanYearSetupSteps(id, pyId)` | `['planYearSetup', id, pyId]` | derived readiness service |
| `useBenefitPlans(id)` | `['benefitPlans', id]` | `benefitPlans(customerId, planYear)` |
| `useEnrollmentEvents/Progress(id)` | `['enrollmentEvents'/'enrollmentProgress', id]` | enrollment queries |
| `usePayrollDeductions(id)` | `['payroll', id]` | `payrollDeductions(customerId, planYear)` |
| `useCarrierExports(id)` | `['carrierExports', id]` | carrier export batches |
| `useAcaAleSummary/useCobraSummary(id)` | `['acaAle'/'cobra', id]` | ACA/COBRA summaries |

Note the FE key uses **`employerId`** while the GraphQL arg is **`customerId`** —
map at the queryFn when wiring AppSync (see §1).

## 0.2 Payroll is EMPLOYER-LEVEL only (permission rule + seed flag)
Product decision: **agencies and brokers do NOT manage payroll** — it's an
employer responsibility. Frontend: payroll is removed from Agency Admin & Broker
sidebars; if they hit an employer payroll route, a "Not available for this role"
message shows. Intended permission rule:
- `payroll.read` / `payroll.manage` / `payroll.export` → **Employer Admin,
  Employer Payroll Admin**, and possibly internal support/platform. **NOT** Agency
  Admin or Broker by default.
- ⚠️ **Backend seed adjustment needed:** `db/migrations/control-plane/0002_seed_reference_data.sql`
  currently grants `payroll.read` to **both `broker` and `agency_admin`** roles.
  Remove `payroll.*` from those two roles' `role_permission` grants when revisiting
  the seed (flagged, not changed — backend work).

## 1. Naming mismatches (frontend vs backend)
| Concept | Frontend | Backend (current) | Resolution |
|---|---|---|---|
| The tenant/employer | **`employerId`** (routes, params, mock) | GraphQL args say **`customerId`** | Map `employerId`→`customerId` at the data layer until the backend rename lands (tracked in `IMPLEMENTATION_STATUS.md`). |
| Object identity fields | mixed (`employeeId`, `dependentId`) | mixed `id` vs `<entity>Id` | Pending `id`-convention cleanup (deferred). |

## 2. Frontend-expected API fields NOT yet in the schema
- **`EmployerCensusContext`**: `missingEligibilityClassCount`,
  `dependentsMissingDataCount`, `needsReviewCount` (census-health metrics).
  → add to a `employerCensusContext` v2 (server-derived preferred).
- **Employee derived display:** `employmentStatusLabel` ("New Hire" derived from
  hire date) and per-employee **`issues[]`** (data-quality). Currently derived
  client-side; should become a server data-quality pass.
- **`Dependent.coveredStatus`** (covered/not/pending) — not modeled until the
  enrollment/coverage module; placeholder in UI.
- **Employer `dba`** — schema only has `legal_name`; UI shows DBA.
- **Employer SIC/industry**, payroll provider name, QuickBooks-sync flag — UI
  shows them; confirm where they live (`employer_profile` / settings).
- **Carrier export line errors** (e.g., "SSN mismatch") — modeled in
  `carrier_export_line` already; UI needs the list endpoint.
- **Payroll export diff** ("what changed since last export") — implied by
  `payroll_export_batch`/`line.change_type`; needs a diff query.
- **Beneficiary** data for the detail page — `beneficiary` table exists; no UI
  query yet (placeholder).
- **ACA measurement/stability periods** + **1095-C records** lists — tables exist
  (`measurement_period`, `stability_period`, `form_1095_record`); need queries.
- **COBRA** qualified beneficiaries / notices / payments — tables exist
  (`cobra_*`); UI currently shows a flattened event row only.

## 3. Backend model decisions the UI already respects
- `employee_number` is a first-class census field, **separate from integration
  IDs** (`employee_integration_ref`) and legacy ids.
- **Elections (intent) vs active coverage** are separated — Elections Review and
  the employee Review/Submit copy say so explicitly; coverage is created on
  effective date.
- **Plan Year setup checklist status is DERIVED** (mock now), not a task table;
  `override` is admin-only.
- **Payroll deductions are derived/reviewed**, not hand-entered.
- **Carrier exports are generated batches** with lines + errors.
- **COBRA and ACA are separate modules** but read shared employee/dependent/
  coverage data.
- **Employee self-service** lives under a separate `/employee/*` shell and must
  get **row-level "own records only"** authorization later — it does NOT reuse
  HR-admin nav/permissions.

## 3.1 Enrollment Events — launch readiness + windows (API expectations)
`EnrollmentEventsPage` expects two plan-year-scoped queries (mock today via
`getLaunchReadiness` / `getEnrollmentWindows`):
- **`launchReadiness(employerId, planYearId)`** → `{ planYearStatus, readinessPercent,
  canLaunch, launchState: not_launched|launched|closed|archived, blockers[], warnings[],
  checklist[] }`. Each blocker/warning = `{ key, label, severity, area, description }`.
  The **blocker vs warning distinction is authoritative from the API** — the FE only
  gates the Launch button on `blockers.length === 0` (never invents blockers). Broker/
  agency callers must have payroll/carrier-area items filtered server-side too (FE
  filters `area ∈ {Payroll, Carriers}` as a stopgap). `readinessPercent` is
  server-derived (FE mirrors the plan year's setup completion today).
- **`enrollmentWindows(employerId, planYearId)`** → `EnrollmentWindow[]`
  `{ id, name, type: Open Enrollment|New Hire|Life Event|Special Enrollment, windowLabel,
  effectiveRule, employeesAffected, status, completionPercent, nextAction }`.
  `nextAction`/`status` strings are presentation hints; a real API may return codes the
  FE maps to labels.
- **Launch is a mutation later** (`launchEnrollmentEvent`) — today it's a local mock
  (success banner, no state persistence). **Launch authority is employer-only**; broker/
  agency see a disabled "Employer approval required / Ready for Employer Review" button.
- Route stays `/employers/:id/enrollment-events`; plan year comes from top-bar context
  (no `planYearId` in the path yet — add later if events become per-year deep links).
  **Preferred future route: `/employers/:employerId/enrollment`** (broad enough for OE +
  new hire + QLE + special windows; rename deferred until low-risk).

## 3.2 Documents & Forms — workspace (API expectations)
`DocumentsPage` expects a plan-year-scoped `documentWorkspace(employerId, planYearId)`
(mock: `getDocumentWorkspace`) returning readiness (`readinessPercent, missingCount,
employeeActionCount, expiringSoonCount, readOnly`), `issues[]`, `tasks[]`, `categories[]`,
and `docs[]`. **Future `Document` record fields** (per row) the FE will consume:
`documentId, name, category, relatedEntityType, relatedEntityId, requiredFor, status,
expiresAt, uploadedAt, uploadedBy, planYearId, employerId, carrierId, coverageType,
employeeActionRequired, signatureStatus, generatedFormStatus`. Today the mock derives plan
documents from the employer's benefit plans + standard forms; the real API should join
plan/carrier/coverage + plan-year context server-side. **Broker/agency callers must not
receive payroll-area document tasks** (FE filters `area === "payroll"` as a stopgap).
Upload / e-signature / confirmation generation are **future mutations** (`uploadDocument`,
`requestSignature`, `generateConfirmations`) — all stubbed in the FE today.
**Legacy migration:** the document migration must **preserve old PDFs/forms as
archive/searchable records** — map legacy documents into this `Document` shape with
`status: Archived` and a `planYearId`, so historical plan years render as read-only
archives (SBCs, signed forms, confirmations, notices) and remain searchable in the library.

## 3.3 Life Events — employee report flow vs HR queue (API expectations)
Two distinct surfaces backed by the same `life_event_request` record:
- **Employee `reportLifeEvent` mutation** (future) — from `/employee/life-events/report`.
  Payload: `{ eventType, eventDate, notes, priorCoverageEndDate?, newCoverageStartDate?,
  affectedPeople[] (employee + dependentIds + newDependent?), documents[] }`. Employee
  self-service is **row-level "own records only"** (see §2). Today all mock; upload /
  submit / save-draft are stubs.
- **HR `life_event_request` queue** — review/approve/deny/open-window; separate screen.
- **Lifecycle states the API should expose:** `submitted → under_review → needs_documents
  → approved | denied → election_window_open → election_submitted → completed`. The FE
  renders employee-facing status labels (e.g., "Under Review") from these.
- Estimated effective date is **advisory in the FE** ("subject to HR review and plan
  rules") — the authoritative effective date is server-computed from approval + plan
  rules, mirroring the `employee_election` (intent) vs `coverage_record` (active) split.

## 3.4 Plans & Rates — plan catalog (API expectations)
`PlansRatesPage` expects a plan-year-scoped `planCatalog(employerId, planYearId)` (mock:
`getPlanCatalog`) → `{ readOnly, summary, rows[] }`. **Future `BenefitPlan` fields** the FE
consumes per row: `planId, planYearId, employerId, benefitType, carrierId, planName,
status, coverageTiers, rateStatus, contributionStatus, documentStatus, eligibilityClassIds,
launchBlockers, warnings, rates, contributionRules`. `status`/`*Status` are server-derived
readiness (the FE mirrors them from plan setup today). This catalog is the source for the
**Plan Year Setup** readiness + **Enrollment Center** launch blockers — keep the
blocker/warning determination authoritative on the server. **Model separation (do not
mix):** `benefit_plan` / `plan_option` / `coverage_tier` / `plan_rate` /
`employer_contribution_rule` are plan SETUP; `employee_election` (intent) and
`coverage_record` (active coverage) are separate and must NOT be joined into the plan
catalog. Add/Copy-Prior-Year/Import-Rates/rate edits are **future mutations** (all stubbed).

## 3.5 Payroll — Deductions + Payroll Data (API expectations)
**Two separate employer-level pages** (nav items) share one plan-year-scoped
`payrollWorkspace(employerId, planYearId)` query (mock: `getPayrollWorkspace`):
- **Deductions** (`/employers/:id/deductions`) = the **recurring per-pay-period** benefit
  deduction workflow → consumes `deductionReview[]` + `deductionReviewSummary` +
  `deductionChanges[]` + `payrollExportBatches[]`.
- **Payroll Data** (`/employers/:id/payroll-data`) = supporting **setup/history/compliance**
  → consumes `payrollConnection` + `payrollImportSummary` + `importedPayPeriods[]` +
  `employeePayrollRecords[]` + `acaLookback`. Legacy `/payroll` → Payroll Data only.
**Agencies and brokers do NOT manage payroll or deductions** (FE blocks
`broker`/`agency_admin`; remove the backend `payroll.*` grant for them). Future query
groups the FE consumes:
- **`payrollConnection`** — `{ provider, frequency, currentGroup, firstImported,
  lastImported, measurementPeriod, stabilityPeriod, lastSync, nextSync, dataSource,
  connected, lookbackReady }`.
- **`payrollReadiness`** — `{ percent, issues[] { key, label, count, tone } }` (ACA
  lookback readiness; server-derived).
- **`payrollImportSummary`** — `{ importedPayPeriods, matchedEmployees, unmatchedEmployees,
  lastSyncStatus }` (Payroll Data tab KPI row).
- **`importedPayPeriods[]`** — `{ id, period, payDate, group, emps, hours, wages, status,
  issues, source }`.
- **`employeePayrollRecords[]`** — `{ id, name, empNumber, group, matchedCensus, hours,
  wages, aca, issues, lastImported }` (ACA full-time/lookback determination).
- **`acaLookback`** (SEPARATE from payroll-import fields — powers the ACA Lookback tab) —
  `{ measurementPeriod, stabilityPeriod, administrativePeriod, calcStatus, lastCalculated,
  fullTimeDeterminationStatus, affordabilityStatus, form1095Status }`. These are ACA
  measurement/affordability/1095-C readiness, computed server-side from the payroll import
  data — NOT the same as `importedPayPeriods`/`employeePayrollRecords`. **Payroll Data
  (imported/synced history) and ACA Lookback (measurement/affordability/readiness) are
  distinct concerns and are separate tabs/queries in the FE.**
- **`deductionReview[]`** — `{ id, employee, plan, tier, effective, payrollGroup, code, ee,
  er, changeType, status, issue }` (benefit deductions from elections × rates ×
  contributions — no FE math) + **`deductionReviewSummary`** `{ readyToExport, needsReview,
  missingCode, amountChanged, effectiveThisPeriod, totalEe, totalEr }`. **Deduction Review
  is the primary RECURRING per-pay-period workflow** (default tab); it drives the export
  pipeline. `payrollImportSummary` / `importedPayPeriods` / `employeePayrollRecords` /
  `acaLookback` are **supporting historical/compliance** data (Payroll Data + ACA Lookback
  tabs), reviewed far less often — keep them distinct from the deduction workflow.
- **`deductionChanges[]`** — `{ id, employee, changeType, prev, next, effective, status }`.
- **`payrollExportBatches[]`** — `{ id, batchDate, payPeriod, employees, totalEe, totalEr,
  status, file, issues }`.
- **`payrollSettings`** — `{ provider, frequency, deductionSchedule, payrollGroups,
  codeMapping, syncSettings, exportFormat }`.
Sync / import / lookback / export / settings-edit are **future mutations** (all stubbed).
**Payroll is employer-level only** — see §0.2. **Agencies and brokers do not manage
payroll** (FE blocks `broker`/`agency_admin`); the backend seed grant of `payroll.*` to
broker/agency should be removed. Two payroll surfaces exist in the FE: the canonical
**Payroll** workspace (this page) and a legacy `/payroll-deductions` list — consolidate later.

## 3.6 Compliance — ACA + COBRA (API expectations)
`CompliancePage` (`/employers/:id/compliance`) is a single grouped workspace with **4 MVP
tabs — Overview / ACA / ALE / COBRA / Notices** (separate 1095-C, ALE/FTE, and Compliance
Calendar tabs are DEFERRED; calendar folded into Overview). Compliance is where ACA results
are reviewed/filed; **Payroll Data / ACA Lookback (§3.5) supplies the underlying lookback +
affordability inputs** (no FE math). **Broker/agency get a limited Overview-only summary
with no payroll detail.** Today all data is **representative inline mock** (not a getter
yet) — the future API should provide plan-year/compliance-year-scoped groups:
- **`acaFilingReadiness`** — `{ percent, blockedForms, issues[], workflow[] }`.
- **`form1095c[]`** — `{ employee, acaStatus, line14, line16, monthsCovered, status, issues }`
  (+ a per-employee `form1095cDetail`).
- **`aleDetermination`** — `{ aleStatus, avgMonthlyCount, readiness, months[] {ft, ptHours,
  fte, total, seasonal, source, status}, attention[] }`.
- **`measurementTracking`** — `{ variableHour, trendingFullTime, missingHours, employees[]
  {type, period, avgHours, eligibility, stabilityPeriod, status} }`.
- **`affordability`** — `{ safeHarborMethod, threshold, counts, employees[] {basis, wage,
  premium, result, safeHarborCode, status} }`.
- **`filing1094c`** — `{ employer{...}, monthlyCounts[], readiness[] }`.
- **`filingStatus[]`** — multi-year `{ year, forms, partner, generated, submitted, irsStatus,
  corrections }`.
- **`cobra`** — `{ readinessIssues[], setup, events[] {qualifyingEvent, noticeStatus,
  cobraStatus, paymentStatus, tpaStatus, nextStep}, notices[], payments[] }`.
Compliance is **employer-level**; ACA lookback data is fed by Payroll Data (§3.5) — keep the
measurement/affordability determination server-side (no FE math). All actions (generate,
transmit, calculate, resolve) are future mutations, stubbed today.

## 4. Product decisions needed
1. **"New Hire" rule** — derive from hire date within N days (currently 30) or a
   stored status? Confirm N.
2. **Census-health metrics** — server-derived (recommended) vs client-computed?
3. **DBA, SIC, payroll provider** — add to `employer_profile`?
4. **Multi-employer selection** UX for brokers/agency admins (employer switcher).
5. **Beneficiary allocation** UX/validation (sum to 100% per type) — when the
   beneficiary screen is built.
6. **Enroll flow sub-routes** — keep the single stepper (`/employee/enroll`) or
   split into `/compare`, `/elect`, etc.? (Suggested route list had sub-paths.)

## 5. Not implemented on purpose (no real calculations)
Eligibility status, deduction amounts, ACA counts, COBRA deadlines, enrollment
progress, and carrier-export errors are **realistic placeholders only** — no real
business math in the FE. The golden-master rate/deduction logic stays server-side.
