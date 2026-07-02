# GoBenefits V4 — Frontend Design Plan (Lovable alignment)

**Updated:** 2026-06-30 · **Scope:** frontend UX + mock data + API-contract
alignment only. **No** real backend wiring, **no** new backend modules.

> Work is applied to the Lovable MVP (`gobenefits-e92b2d8b`) for now; the eventual
> home per architecture is `V4Main/apps/web`. Changes are local only (not pushed).

---

## 1. Design plan

Align the frontend to the backend's **camelCase API shape** and the
**permission × scope** model, and reduce visual overload. Principles:

- **Lean primary tables, rich detail on demand.** The census list shows core
  fields; everything else moves to the detail page/drawer or an expandable panel.
- **Mock data mirrors the GraphQL contract** (field names + types from
  `api/schema.graphql`), so swapping mock → AppSync later is a 1:1 change.
- **Status as a small vocabulary** reused everywhere: a single
  `ReadinessStatus` (`not_started | in_progress | complete | needs_attention |
  blocked | not_applicable`) for the checklist; coverage/eligibility badges reuse
  the existing tone tokens.
- **No SSN in the UI** (masked only, later). Don't surface fields the API can't
  yet provide — show placeholders labeled "coming soon" instead of fake-precise data.

---

## 2. Screen-by-screen refinement list

### A. Employer Setup (`employer-profile.tsx`) — *usable as-is, light additions*
Already tabbed (Company / Addresses / Contacts / Payroll & Tax / ACA / Carrier /
Branding / Audit) with a health card. Keep. Add:
- **Divisions / Classes** sub-section (under Company or a new "Structure" tab) —
  eligibility classes + divisions list.
- **COBRA settings** placeholder card (under ACA/Compliance or its own).
- **Plan Years** quick-link card (to `/plan-years`).
- Map fields to API: `legalName`, `dba`, `ein`, address parts, contacts, locations.
*Verdict: usable; 3 small additions, no rewrite.*

### B. Employee Census (`employees/index.tsx`) — **too busy → simplify (DONE)**
Rewritten to a **lean core table** + **compact expandable Census Health** +
4-KPI strip. Core columns only:
`employeeNumber, name(+email), employmentStatus, hireDate, eligibilityClass,
eligibilityStatus, dependentCount, issues`. Secondary fields (location, payroll
group, benefit class detail, comparisons) moved to the **detail page**.
*Verdict: was too busy; now simplified.*

### C. Census Health — **compact expandable panel (DONE)**
Collapsible, shows: total, active, missing required fields, missing eligibility
class, dependents missing data, employees needing review. Collapsed by default.

### D. Employee Detail (`employees/$employeeId.tsx`) — *split into sections*
Refine into clear sections/tabs: **Basic profile · Employment · Contact ·
Address · Dependents (expandable) · Beneficiaries (placeholder) · Current
elections (placeholder) · Documents (placeholder) · Audit/history (placeholder)**.
Dependents rendered via the new reusable `DependentsSection` component.
*Verdict: structure is rich but should be reorganized into the section list above;
Dependents component provided.*

### E. Dependents — *reusable component (DONE: `DependentsSection`)*
Card/row per dependent: name, relationship, DOB, **age (derived)**, gender (if
collected), student/disabled (if collected), covered-status placeholder, missing-
info indicator. **No SSN shown.**

### F. Plan Year Setup Checklist — **derived-readiness model (DONE: `PlanYearChecklist`)**
Replaces the grouped count summary with a **per-step** list: step name, status
(6-value enum), short description, required/optional, route/action button,
needs-attention message, admin-override note placeholder. Status is mock now;
**derived from domain entities later** (see `DATA_MODEL.md` §10.1).

---

## 3. Components added / changed
- `src/lib/census-mock.ts` — API-shaped mock: `CensusEmployee[]`,
  `EmployeeDetail`, `Dependent[]`, `EmployerCensusContext`, plus UI-derived
  health metrics and `ageFromDob` helper.
- `src/lib/plan-year-checklist-mock.ts` — `ChecklistStep[]` with the 17 seeded
  steps + mock derived statuses + override notes.
- `src/routes/employees/index.tsx` — simplified census (rewritten).
- `src/components/census/CensusHealth.tsx` — compact expandable health panel.
- `src/components/census/DependentsSection.tsx` — reusable dependents list.
- `src/components/plan-year/PlanYearChecklist.tsx` — derived-readiness checklist.

---

## 4. Backend / API fields the frontend expects

**Census list** (`employees` → `CensusEmployee`): `employeeId, employeeNumber,
firstName, lastName, email, phone, dateOfBirth, gender, employmentStatus,
hireDate, terminationDate, employmentClass, eligibilityClass, payType, salary,
addressSummary, dependentCount, eligibilityStatus`.

**Census context** (`employerCensusContext` → `EmployerCensusContext`):
`employerId, employerName, planYearLabel, totalEmployees, activeEmployees,
missingRequiredCount`. *UI also wants (NOT yet in API — see gaps):*
`missingEligibilityClassCount, dependentsMissingDataCount, needsReviewCount`.

**Employee detail** (`employeeDetail` → `EmployeeDetail`): adds `middleName,
altEmail, homePhone, cellPhone, addressLine1, city, state, zip, originalHireDate,
jobTitle, dependents[]`.

**Dependents** (`dependents` → `Dependent`): `dependentId, firstName, lastName,
dateOfBirth, gender, relationship, disabled, student`. *UI derives `age`; wants a
`coveredStatus` (NOT yet in API — placeholder).*

**Checklist:** `PlanYearSetupStepDefinition` (step_key, label, description,
display_order, category, required_by_default, route) + a **derived status** per
step (computed server-side later) + optional `PlanYearSetupStepOverride`
(override_status, notes, owner, target_date).

---

## 5. Mock data changes required (to match API shape)
- Replace the census `Emp` mock (`name`, `empId`, free-text `status`/`enrollment`/
  `issues`) with `CensusEmployee` (split `firstName`/`lastName`, `employeeNumber`,
  enum `employmentStatus`, `eligibilityClass`, `eligibilityStatus: boolean`,
  `dependentCount`). **DONE** in `census-mock.ts`.
- Employee-detail mock: rename to API fields (`employeeNumber`, `hireDate` as ISO,
  `dependents[]` with `dependentId`/`relationship` enum).
- Dependents: `relationship` ∈ {spouse, child, domestic_partner, other};
  no SSN field surfaced.
- Checklist: from grouped `{label, done, total}` → per-step list with the 6-value
  status enum.

---

## 6. Routes to standardize
- Keep TanStack file-route convention (`employees/`, `employees/$employeeId`,
  `plan-years/$planYearId`).
- **Add real routes** for nav items that currently have none: `Employers` (list),
  `Reports`, `Integrations`, `Settings`, employee self-service
  (`My Dependents/Beneficiaries/Documents/Profile`). (Frontend stubs only.)
- Standardize the employer/tenant route param. Backend GraphQL uses `customerId`
  today but is recommended to rename to **`employerId`** (see
  `IMPLEMENTATION_STATUS.md`). FE should bind to whatever lands; hold on naming.

---

## 7. Design questions / gaps discovered
1. **Health metrics not in API yet:** `missingEligibilityClassCount`,
   `dependentsMissingDataCount`, `needsReviewCount` — are these **derived
   server-side** (preferred) or computed client-side from the census list? Recommend
   server-side as part of `employerCensusContext` v2.
2. **`employmentStatus` display:** API enum is `active|terminated|cobra|retired|
   leave`; the UI shows "New Hire"/"Pending Eligibility" (derived). Where is
   "New Hire" derived — hire date within N days? Need a rule.
3. **`coveredStatus` on dependents** — not modeled until enrollment; show as
   placeholder for now. Confirm.
4. **`issues` / data-quality** per employee — a later data-quality pass; for now
   the UI derives a simple "missing email / missing eligibility class" indicator.
5. **Beneficiaries / elections / documents** on the detail page are placeholders
   until those modules land — confirm placeholder copy is acceptable.
6. **DBA field** — not in the schema yet (only `legal_name`). Add `dba` to
   `employer_profile`? Likely yes.
