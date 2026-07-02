# GoBenefits V4 — Target Data Model

**Status:** Draft v1 · **Date:** 2026-06-30

The legacy CloudHCM database is a **migration source only**, not the target. This
document defines a clean, normalized, multi-tenant benefits-administration model
designed from business concepts — and explains exactly how the legacy data maps
into it.

> Legacy facts referenced here come from the inspection of `CloudHCM.Data` (105
> entities, database-per-tenant `hcmuser<N>`, no foreign keys). See
> `../../IMPLEMENTATION_PLAN.md` and the legacy map for detail.

---

## 0. Design principles

- **No god tables.** `Employee` is identity only; employment, address, contact,
  eligibility, payroll, ACA each get their own table.
- **Elections ≠ coverage.** What an employee *chose* (`EmployeeElection`) is
  separate from what is *active today* (`CoverageRecord`). Legacy conflated these.
- **Contributions are explicit.** Percentages and fixed amounts are distinct,
  typed columns — resolving the legacy %-vs-$ ambiguity.
- **Real foreign keys everywhere.** Legacy had none.
- **Multi-tenant by deployment.** Database-per-customer (Option A) — the per-
  customer DB *is* the tenant boundary, so operational tables need no tenant id.
- **Auditable & migration-traceable.** Field-level audit; every migrated row
  carries `legacy_source` + `legacy_id`.
- **Reference data is shared.** Carriers and benefit types live once in the
  control-plane catalog, not duplicated per tenant (legacy duplicated heavily).

## 0.1 Where each entity lives (two tiers)

| Tier | Entities |
|---|---|
| **Control-plane DB** (shared) | Agency, Broker, **Employer (tenant registry)**, EmployerContact, UserAccount, Role, Permission, RolePermission, **Carrier**, **BenefitType** (global catalog), **PlanYearSetupStepDefinition** (shared checklist step catalog), CustomerProgress (aggregate read-model), MigrationBatch, MigrationMapping, MigrationException (cross-tenant control) |
| **Per-customer DB** (one per employer) | EmployerProfile, EmployerLocation, EmployerDivision, EmployerPayrollSettings, EmployerEligibilityRules; **EligibilityClass**; Employee, EmployeeEmployment, EmployeeAddress, EmployeeContact, EmployeeEligibility, Dependent; **Beneficiary**; PlanYear, BenefitPlan, PlanOption, PlanRate, ContributionRule; EnrollmentEvent, EnrollmentWindow, **EnrollmentInvitation**, EmployeeElection, **ElectionHsa**, DependentElection, CoverageRecord, Waiver; LifeEvent, LifeEventType, LifeEventDocument, LifeEventApproval; PayrollDeduction, **DeductionCode**, DeductionSchedule, PayrollExportBatch, PayrollExportLine; **CarrierExportProfile, CarrierExportBatch, CarrierExportLine**; **PlanYearSetupStepOverride**; MeasurementPeriod, StabilityPeriod, ACAEligibilityStatus, ALEMonthlySnapshot, Form1095Record; CobraEvent, CobraQualifiedBeneficiary, CobraElection, CobraPayment, CobraNotice; Document, DocumentLink, SignatureRequest, SignedForm; AuditEvent, EntityChangeLog; LegacySourceRecord |
| **Staging area** (separate schema/DB) | Raw legacy mirrors (`stg_*`) + per-row mapping/exception (see §7) |

---

## 1. Legacy → New mapping

| Legacy table(s) | New entity(ies) | Notes |
|---|---|---|
| *(none — implicit; tenant = DB)* | **Employer** (registry) + **EmployerProfile** | Synthesize one Employer per `hcmuser<N>`. Biggest structural gap. |
| `homecompanyinfo` | EmployerProfile, EmployerPayrollSettings | QB sync + RateFormat → settings. |
| `multiplelocation` | EmployerLocation | BusinessName/FederalTaxID/NoOfEmployees. |
| `association` | EmployerProfile.association_* or AssociationSponsor | Assoc-health-plan sponsor (rare). |
| `usersetup`, `webpages_membership`, `webpages_roles`, `login_details` | UserAccount, Role, Permission | Move identity to Cognito; `SecurityLevel`/`RoleID` → Role. |
| `employee` (145 col) | **Employee + EmployeeEmployment + EmployeeAddress + EmployeeContact + EmployeeEligibility + EmployeeIntegrationRef + employee_aca** | Decompose by theme. `employee.employee_number` = employer-assigned census number (core, unique per customer DB); external/system IDs (`ExtEmployeeId`, ADP/Bamboo/QB) → `EmployeeIntegrationRef`; old-GoBenefits id → `legacy_source_record`. |
| `employeeraw`, `employeecolumnmap` | *(staging only)* CensusImportBatch/Row + ColumnMap | Import mechanics, not core model. |
| `dependent` | Dependent (+ per-line dates → CoverageRecord) | Relationship normalized to enum. |
| `contributionclass` | ContributionRule | Percentages made explicit. |
| `plan`, `clientplan`, `userplan`, `medicalplan`, `newplan`, `metalplan` | **BenefitPlan + PlanOption + plan.attributes_json** | Collapse 5+ plan tables into one model; carrier-specific attrs → JSON. |
| `carriermaster` | Carrier (control-plane catalog) | |
| `planpricing`, `newplanpricing`, `userplanpricing`, `employeeprice` | PlanRate | Age-banded, 4-tier (EE/ES/EC/EF). |
| `planavailability`, `planrestrict` | EmployerEligibilityRules / PlanOption availability | |
| `package`, `packageinfo`, `packagerestriction` | PlanOption groupings | |
| `planenrollment` **and** `employeeplanselection` | **EmployeeElection** (authoritative) + **CoverageRecord** | Resolve the duplicate-table ambiguity; split chosen vs active. |
| `selectedplan`, `offerplan`, `recommendedplan` | Quote / QuoteLine (quoting module) | Proposal output. |
| `depenrolled` | DependentElection / CoverageRecord (dependent rows) | |
| `payrolldeduction` | PayrollDeduction + DeductionSchedule | Denormalized name/SSN/EIN dropped (joined instead). |
| `payrollcalendar` | DeductionSchedule | Frequency/PayCycle. |
| `userpayroll` | *(staging)* PayrollImportBatch/Row | Imported hours/pay. |
| `payrolldeductionreport`, `payrollbup` | PayrollExportBatch / PayrollExportLine | |
| `lookbacklog` + employee ACA fields | MeasurementPeriod, StabilityPeriod, ACAEligibilityStatus | |
| `form1095`, `nelco1095*`, `nelcocompany*` | Form1095Record + ALEMonthlySnapshot | Historical = archive (§5). |
| `w2data2024`, `w2companies2024` | *(archive only)* | Year-stamped; not core. |
| `employee` COBRA fields | **CobraEvent, CobraQualifiedBeneficiary, CobraElection, CobraPayment, CobraNotice** | Net-new module from flags. |
| `document`, `pdfform`, `disclosure` | Document, DocumentLink, SignatureRequest, SignedForm | Files → S3; row = index. |
| `audittrail`, `history` | AuditEvent / EntityChangeLog | Field-level audit preserved. |
| `emaillog`, `b2blogs`, `qblog`, `adpticket`, `vendorbridgelog` | *(archive / operational logs)* | Not core model. |
| `gb` (Adobe tokens), `settings`, `memorizepreference` | Config/Secrets (Secrets Manager) | Not data-model entities. |
| `zipcode`, `siccode`, `area`, `timezone` | Reference tables (control-plane) | Shared geo/rating reference. |

## 2. Legacy fields to PRESERVE (operationally important)

- Identity: names, DOB, gender, SSN (**encrypted**), email, phones, addresses.
- Employment: HireDate, OriginalHireDate, termination date/reason, EmployeeClass,
  JobTitle, hours weekly, Salary, EmployeeStatus.
- Eligibility/contribution: ContributionClass mapping, Offer flags, contribution
  values (as explicit %/$).
- Plan/rate: PlanName, PlanCode, line of coverage, carrier, HSA eligibility,
  age-banded tier rates (EE/ES/EC/EF), effective dates, PlanYear.
- Elections/coverage: chosen plan, coverage tier, covered dependents, effective
  date, status, premium/employer-contribution/employee-cost.
- Payroll: CostEE/CostER/CostTotal, PrePostTax, PayCycle, effective/end dates.
- ACA: measurement/stability periods, look-back hours, SafeHarborAmount.
- COBRA: reason, offer/start/end/decline dates.
- Integration ids: ADPWorkerID/OID/UUID, BambooHrEmployeeID, QBListID (continuity).
- Documents: file reference, type, signed date + e-sign metadata (IP/agent).
- Audit: table/pk/column/old/new/action/actor/timestamp.

## 3. Legacy fields to DEPRECATE

- **Denormalized duplicates:** `payrolldeduction.CompanyName/FullName/SSN/EIN`
  (derive via joins), `employee.FullName`, `SSNFourDigit`.
- **UI/workflow scratch:** `WizardCompleted`, `InviteSent*`, `EnrollmentFormKey`,
  `Processed` flags, `memorizepreference`, `OverwriteJobTitle`, `VBJobTitle`.
- **Year-stamped tables:** `nelco1095_2025`, `w2data2024`, `edidata26mar18` →
  modeled generically with a `year` column or archived.
- **Per-tenant DB plumbing:** `usersetup.UserDb/Server`, `homecompanyinfo` sync
  scaffolding → replaced by tenant registry + Secrets Manager.
- **Redundant plan tables:** keep one model; the rest become source-only.
- **Obsolete/empty columns** discovered during profiling (e.g. unused `Custom1..15`
  on `userplan`) → drop unless data present.
- **Free-text status fields** that don't map cleanly → normalized enums.

## 4. NEW entities (not clean in legacy)

- **Agency, Broker, EmployerContact** — no legacy concept at all.
- **Role, Permission, RolePermission** — replace `SecurityLevel` integer.
- **BenefitType** — first-class line-of-coverage catalog (legacy implied by columns).
- **PlanYear** — first-class (legacy implied via dates).
- **EnrollmentEvent / EnrollmentWindow** — explicit OE / new-hire / QLE windows.
- **CoverageRecord** — active coverage as of a date (vs. election intent).
- **Waiver** — explicit waiver with reason (legacy buried in free text).
- **LifeEvent / LifeEventType / LifeEventApproval** — proper QLE workflow.
- **COBRA module** (CobraEvent, CobraQualifiedBeneficiary, CobraElection,
  CobraPayment, CobraNotice) — legacy had only employee flags.
- **ACA module** (MeasurementPeriod, StabilityPeriod, ACAEligibilityStatus,
  ALEMonthlySnapshot) — structured vs. scattered.
- **DeductionSchedule, PayrollExportBatch/Line** — explicit, diffable exports
  ("what changed since last export?").
- **Quote / QuoteLine** — quoting was code-only in legacy (Step repos).
- **Migration entities** (LegacySourceRecord, MigrationBatch, MigrationMapping,
  MigrationException) — provenance + reconciliation.

## 5. Data to make ARCHIVE-ONLY (read-only, searchable)

- Prior plan years' elections/coverage and old rates.
- Historical `form1095`/`nelco1095*`, `w2data2024` filings.
- Old payroll deduction runs and export files.
- Terminated/historical COBRA events predating cutover.
- Old signed forms / PDFs (S3 archive bucket + index).
- Legacy operational logs (`emaillog`, `b2blogs`, `qblog`, tickets).

## 6. Data to TRANSFORM into the transactional model (live)

- Current employees + employment + addresses + contacts (active and on-COBRA).
- Current dependents.
- Current plan year, plans, options, rates, contribution rules.
- Current elections → EmployeeElection + active CoverageRecord.
- Current payroll deduction setup → PayrollDeduction + DeductionSchedule.
- Current eligibility (classes, rules) → EmployeeEligibility.
- Current COBRA-relevant employees → CobraEvent (open).
- Current ACA measurement data → MeasurementPeriod/StabilityPeriod/ACAEligibilityStatus.

## 7. Migration staging tables (separate staging schema/DB)

- `stg_<table>` — **raw 1:1 mirrors** of each legacy table per tenant, loaded
  as-is (e.g. `stg_employee`, `stg_dependent`, `stg_planenrollment`,
  `stg_payrolldeduction`), with `source_db` (`hcmuser<N>`) + `loaded_at`.
- `MigrationBatch` — one row per tenant per run (status, counts, started/finished).
- `MigrationMapping` — legacy key → new id per entity (idempotent re-runs,
  traceability). Becomes `LegacySourceRecord` rows in the target DB.
- `MigrationException` — rejected/needs-review rows with reason code + payload.
- `ColumnMap` — census/payroll import column → field (was `employeecolumnmap`).
- Reconciliation views — counts migrated vs. source, orphans, dups, invalid dates.

## 8. Validation rules to enforce in the new model

**Structural (DB constraints):** real FKs on every relationship; unique keys
(e.g. one active EmployeeEmployment per employee; unique plan per line per year);
enums for status/tier/relationship; NOT NULL on required identity fields; check
constraints on dates (`hire_date <= termination_date`, rate effective ≤ end).

**Domain (app/service layer):**
- An `EmployeeElection` must reference a `BenefitPlan` available in that
  `PlanYear` and within an open `EnrollmentWindow` (or a valid LifeEvent).
- Coverage tier must be consistent with covered dependents (e.g. `family`
  requires ≥1 dependent; `ee` requires none).
- A `CoverageRecord` cannot start before the plan's effective date.
- `PayrollDeduction.cost_total = cost_ee + cost_er` (golden-master math).
- Employer contribution % within 0–100; employee cost ≥ 0.
- SSN format + uniqueness within a customer (flag dups to exceptions, don't drop).
- COBRA event requires a qualifying employment change (termination/reduction).
- ACA eligibility derived from MeasurementPeriod hours — not free-typed.
- **Tenant safety:** no cross-customer reference is representable (separate DBs);
  every resolver scopes to the caller's customer.

---

## 9. How the model answers the key questions

| Question | Answered by |
|---|---|
| Who is currently eligible? | `EmployeeEligibility` + `EmployerEligibilityRules` + active `EmployeeEmployment` |
| What plans are available for this employee? | `PlanOption`/`BenefitPlan` filtered by eligibility group + `PlanYear` |
| What did they elect this event? | `EmployeeElection` by `EnrollmentEvent` |
| Which dependents are covered under which plan? | `DependentElection` / `CoverageRecord` |
| What coverage is active today? | `CoverageRecord` where today ∈ [start,end] |
| What deductions go to payroll? | `PayrollDeduction` + `DeductionSchedule` |
| What changed since last export? | `PayrollExportBatch`/`Line` diff vs current deductions |
| Prior-year coverage? | Archived `CoverageRecord` / prior `PlanYear` |
| Who is COBRA eligible? | `CobraEvent` + `CobraQualifiedBeneficiary` |
| Who counts toward ACA/ALE? | `ACAEligibilityStatus` + `ALEMonthlySnapshot` |
| Which records came from the old system? | `LegacySourceRecord` / `legacy_source`+`legacy_id` |

---

## 10. Frontend coverage check (Lovable MVP) — gaps found & closed

Cross-checked the model against every Lovable screen + mock file
(`mock-data.ts`, `employee-mock.ts`, `cobra-mock.ts`, `life-events-mock.ts`) and
the operational routes (carrier-exports, payroll-deductions, eligibility,
compliance/ALE, documents). The UI implied fields/relationships the model lacked.
Added entities (now in §0.1):

- **Beneficiary** — the employee nav has *My Beneficiaries* and Voluntary/Basic
  Life shows "Beneficiary required". `Beneficiary(employee_id, name, relationship,
  type=primary|contingent, allocation_pct, ssn_enc, election_id|plan_id)`.
  Allocations per designation should sum to 100% (validation).
- **ElectionHsa** — HDHP plans capture HSA contribution (legacy
  `HSAAmount/HSAFrequency/HSAWaived`). `ElectionHsa(election_id, annual_amount,
  frequency, waived)`.
- **EligibilityClass** — the Eligibility screen shows *classes* with *criteria*
  (min hours, waiting period, eligible coverages) distinct from contribution.
  Split from ContributionRule: `EligibilityClass(name, class_code,
  min_hours_weekly, waiting_period_days)`; PlanOption availability keyed by class;
  `EmployeeEmployment.eligibility_class_id`.
- **CarrierExportProfile / CarrierExportBatch / CarrierExportLine** — the
  Carrier Exports screens (mapping, history, batches, validation errors like
  "SSN mismatch") were **not** modeled (only payroll export was). Profile holds
  the per-carrier field mapping + format; Batch tracks a generated file + error
  count; Line holds per-employee row + action (add/change/term) + validation status.
- **DeductionCode** — Payroll Deductions → *Codes* maps a coverage/plan to an
  external payroll deduction code + pre/post-tax. `DeductionCode(coverage_line|
  plan_id, payroll_code, pre_post_tax)`.
- **EnrollmentInvitation** — dashboards track "employees not invited" + reminders.
  `EnrollmentInvitation(employee_id, enrollment_event_id, sent_at, status,
  reminders_sent)`.

Refinements to existing entities (column-level, from the UI):

- **BenefitPlan**: add `subtype`/`network` (PPO/HDHP/EPO/DHMO; "Nationwide PPO"),
  `setup_status` + `setup_issue_count` (benefit-plans list shows setup state),
  and comparison attributes (deductible, oop, pcp_copay, specialist_copay) — in
  typed columns or `attributes_json`.
- **CobraEvent**: add `event_type` enum (Termination, Reduction in Hours,
  Divorce/Legal Separation, Dependent Aging Out, Death), `tpa`, `notice_deadline`,
  `election_window_start/end`, `payment_status`. **CobraNotice**(type, status,
  sent_at, deadline); **CobraPayment**(period, amount, status, due_date).
- **LifeEvent**: `type` enum covers all 10 UI types incl. Address Change &
  Employment Status Change; fields `event_date`, `submitted_date`, `status`
  (Draft…Completed), `documents_status`, `election_window`, `impact`,
  `payroll_impact`; **LifeEventApproval** for HR review.
- **ALEMonthlySnapshot**: `month`, `full_time_count`, `fte_count`, `pt_hours`,
  `seasonal_count`, `total_count`, `is_ale`, `source`.
- **PlanYear setup checklist** (census → classes → plans → rates → contributions
  → eligibility → documents → OE window → communications → invites → payroll
  mappings → carrier exports): **resolved — hybrid, NOT a task table.** See §10.1.

**Confirmed already covered:** dashboards/KPIs (aggregate read-model), coverage
tiers, dependents+covered-lines (DependentElection/CoverageRecord), cost
per-pay-period (DeductionSchedule), plan comparison (BenefitPlan+PlanRate),
documents + signatures (Document/SignatureRequest/SignedForm), enrollment steps
(EmployeeElection.status), payroll data import hours+ACA (staging + employee_aca).

### 10.1 PlanYear setup checklist — derived readiness (hybrid, no task table)

The checklist is a **computed readiness dashboard**, not a workflow table that can
drift from real state. Three parts:

1. **Derived status service (truth).** A resolver computes each step's status from
   the underlying domain entities — never stored as the source of truth. Status
   enum: `not_started | in_progress | complete | needs_attention | blocked |
   not_applicable`. Examples:
   - *Plans configured* = complete when the plan year has ≥1 active BenefitPlan
     with required fields.
   - *Rates configured* = complete when every active plan/option requiring rates
     has valid PlanRate rows for the plan year.
   - *Enrollment window configured* = complete when an EnrollmentEvent/Window has
     start+end dates.
   - *Carrier exports completed* = complete when required CarrierExportBatch rows
     are generated/sent/approved.
   - *Communications configured* = complete when required notices/email templates
     exist for the event.
   Each step maps to source entities: census→employee/dependent, classes→
   EligibilityClass, plans→BenefitPlan/PlanOption, rates→PlanRate, contributions→
   ContributionRule, window→EnrollmentEvent/Window, communications→notices/
   templates, enrollment→EmployeeElection/Waiver, carrier exports→
   CarrierExportBatch, payroll→PayrollDeduction/PayrollExportBatch.

2. **`PlanYearSetupStepDefinition`** (control-plane, shared catalog). Defines which
   steps exist + how they display — `step_key`, `label`, `description`,
   `display_order`, `category`, `required_by_default`, `applies_to` (module/
   feature/employer-type), `route`. Controls what appears, **not** completion.

3. **`PlanYearSetupStepOverride`** (per-customer, per plan year). Admin decisions
   only — `plan_year_id`, `step_key`, `override_status` (e.g. force
   not_applicable / acknowledge warning / unblock), `is_hidden`,
   `is_required_override`, `owner`, `target_date`, `notes`. Never the main truth
   for completion; it only adjusts/annotates the derived result.

**Effective status = derived status, adjusted by any override.** No
`PlanYearSetupTask` model in MVP. If real PM behavior is needed later (assignments,
due dates, comments, SLAs), extend into a task/workflow module then.
