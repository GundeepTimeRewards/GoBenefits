# Module 1 — Employer Setup → Census (thin vertical slice)

**Status:** Draft v1 · **Date:** 2026-06-30
**Goal:** prove the full pattern end-to-end — AppSync → Lambda resolver → tenant
authorization (permission × scope) → correct customer DB → domain repository →
response — for employee census. Not every census feature; just the spine.

> Gate: do not commit/approve until Phase 0 tenant-isolation tests pass locally.
> If this module exposes a tenant-routing weakness, fix the foundation first.

## Slice scope
- **Queries:** `employees` (list), `employee` (get one), `employerCensusContext`.
- **Mutations:** `createEmployee`, `updateEmployee` (basic census fields).
- No bulk import yet.

## Layers
- **GraphQL** (`api/schema.graphql`): `CensusEmployee`, `CensusEmployeeConnection`,
  `EmployerCensusContext`, `CreateEmployeeInput`, `UpdateEmployeeInput`.
- **Resolver** (`api/resolvers/src/handler.ts`): thin — build auth ctx, dispatch
  to the census service. No SQL here.
- **Service** (`packages/census/src/service.ts`): authorization via
  `getCustomerDb(ctx, permission, employerId)` (permission × scope × routing) +
  validation, then calls the repository.
- **Repository** (`packages/census/src/repository.ts`): SQL against the routed
  customer-DB pool only. Uses the decomposed model (no wide table).

## Decomposed tables used
`employee` (identity) · `employee_employment` (status/hire/term/class) ·
`employee_contact` (email/phone) · `employee_address` (current, summary) ·
`employee_integration_ref` (external/employee number) · `eligibility_class` (name) ·
`employee_eligibility` (status) · `dependent` (count). `legacy_source_record`
reserved for migration traceability (not written in this slice).

## Permission mapping
`employees`/`employee`/`employerCensusContext` → `employee.read`;
`createEmployee` → `employee.create`; `updateEmployee` → `employee.update`.
(Employee role lacks `employee.read`, so it cannot list census — by design.)

## Validation (service-level)
Required first/last name; at least one email (work or personal); valid date
formats; `hireDate <= terminationDate`; `employmentStatus` in allowed enum;
`eligibilityClassId` must exist if provided; duplicate `employeeNumber`
(external id) rejected with a clear error.

## Census row shape (UI-aligned, see §Lovable below)
employeeId, employeeNumber, firstName, lastName, email, phone, dateOfBirth,
gender, employmentStatus, hireDate, terminationDate, employmentClass,
eligibilityClass, payType, salary, addressSummary, dependentCount,
eligibilityStatus.

## Lovable alignment (employees/index.tsx, employees/$employeeId.tsx)
- **Already in UI (list):** name, empId, status, eligibility, benefitClass,
  location, payrollGroup, dependents count, enrollment status, issues.
- **API supports now:** all of the above except `enrollment status` (enrollment
  module, later) and computed `issues` (a later data-quality pass). `location`
  and `payrollGroup` are available via joins but returned as part of detail/
  later; the slice returns the core census row + addressSummary.
- **Wait:** per-coverage eligibility table, elections, data-quality checklist,
  beneficiaries (later modules).
- **Screen is busy** (KPIs + expandable "Census Health" + filters + wide table +
  row actions). Keep it **simplified with an expandable health panel** as
  previously discussed; the API intentionally returns a lean census row plus a
  small `employerCensusContext` for the KPI strip, not a kitchen-sink payload.

## Module 1b — Employee Detail + Dependents (added)

Extends the slice with the employee detail view and dependent CRUD, same
permission × scope × routing pattern.

- **Queries:** `employeeDetail(id, customerId)` (personal + employment + contact +
  address + dependents), `dependents(employeeId, customerId)`.
- **Mutations:** `addDependent`, `updateDependent`, `removeDependent`.
- **Permissions:** detail → `employee.read`; list dependents → `dependent.read`;
  writes → `dependent.manage`. (Employee role currently lacks `dependent.read`/
  HR `employee.read`; employee *self-service* dependent read/write with row-level
  "own records" scope is a **later, separate resolver** — not in this slice.)
- **Code:** `packages/census/src/dependent-types.ts`, `dependent-validation.ts`,
  `dependent-repository.ts`, `dependent-service.ts`; resolver dispatch added.
- **Safety:** writes confirm the parent employee exists in THIS tenant DB (a
  dependent can't be attached across tenants); `removeDependent` fails gracefully
  if the dependent is enrolled in coverage (FK guard).
- **Tests:** pure unit `test/dependent-validation.test.ts` (runs offline, PASS);
  integration `test/dependents.test.ts` (staged for MySQL).

### Verification status (Docker pending)
- Bun installed; `bun install` done.
- **Typecheck: all 4 packages clean** (`tsc --noEmit`).
- **Offline unit tests: 15/15 pass** (employee + dependent validation).
- **DB integration tests: NOT yet run** (no local MySQL — Docker being set up).

## Known schema gaps (documented, not forced)
1. **`employee_number` — RESOLVED.** Added as a first-class column on the core
   `employee` table (employer-assigned census number), unique per customer DB
   (case-insensitive via collation), nullable. **Distinct** from
   `employee_integration_ref.ext_employee_id` (external/system IDs) and from
   `legacy_source_record.legacy_id` (old-GoBenefits traceability).
   **Migration mapping:** a legacy employer-facing employee number → `employee.employee_number`;
   payroll/HRIS/carrier/legacy system IDs (ADP/Bamboo/QB/`ExtEmployeeId`) →
   `employee_integration_ref`. If no clean legacy employer number exists, leave null.
2. **Full-time/part-time** not a column — derivable from `eligibility_class`
   / hours; returned as null for now.
3. **enrollment status / issues** live in other modules; null in this slice.
4. **employmentStatus enum** is `active|terminated|cobra|retired|leave`; the UI
   also shows "New Hire" / "Pending Eligibility" (derived states, not stored).
