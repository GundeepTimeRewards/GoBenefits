# GoBenefits V4 — Frontend Roadmap

**Updated:** 2026-06-30 · **Status:** 🟡 **UI-drafted, mock-driven, NOT backend-verified**

The frontend mirrors the backend status (Code-drafted, NOT integration-verified).
All screens use mock data; no Cognito/AppSync/API calls. Do not mark any workflow
production-complete until the MySQL integration tests pass.

App: `apps/web` (Vite + React 19 + Tailwind v4 + shadcn primitives + **TanStack
Router**, code-based). Two shells: **AppShell** (admin) and **EmployeeShell**
(self-service). **Active employer comes from the route** (`$employerId`), mirrored
into `EmployerProvider`; a top-bar **Employer switcher** (broker/agency/platform)
+ **role switcher** ("View as") drive the mock.

## Top-bar plan-year context (2026-06-30)
The top bar now carries **employer + plan-year context** with a status pill:
`[Employer ▼] [Plan Year ▼] [Status: …]`.
- **Active plan year source of truth:** the route `$planYearId` when present, else a
  remembered selection (`PlanYearProvider`), else the employer's current/upcoming
  plan year. Hooks: `useActivePlanYearId()`, `useActivePlanYear()`.
- **Who sees the Plan Year selector:** Employer Admin (always — company name shown
  as text + plan-year dropdown + status; no employer selector). Platform/Agency/
  Broker (on employer-scoped routes, alongside the Employer selector; agency-wide
  pages show "All Employers" and no plan-year selector). **Employee shell has no
  admin plan-year selector** (year shown in page headers).
- **Route behavior:** changing the dropdown on a route that embeds `$planYearId`
  (e.g. `…/plan-years/2027/setup`) swaps that segment (preserves the screen);
  otherwise it updates context and the page re-reads it.
- **Plan-year-sensitive screens:** **Employer Dashboard fully reacts** across all
  four plan-year phases — **Setup** (readiness KPIs + Continue-Setup CTA + Needs
  Attention), **Open Enrollment** (live OE dashboard: closes-in banner, OE Progress
  card with segmented bar + Submitted/In Progress/Not Started/Need Action stats,
  Reminder Schedule, Needs Attention w/ priorities, Progress by Benefit — modeled on
  the Lovable OE design), **Active** (coverage-year summary), **Archived** (read-only
  banner). Header **labels** update on Census, Plans & Rates, Payroll,
  ACA & COBRA, Enrollment Events/Progress, and Plan Year Setup (route-driven).
- **Mock-only note:** underlying data for census/plans/payroll/carrier/ACA/COBRA is
  currently **employer-level mock** (not yet per-plan-year); those screens reflect
  the selected year in their header/label but show the same data across years.
  Dashboard + Plan Years + Plan Year Setup are genuinely plan-year-aware.

## Plan Years — overview + setup drill-down (2026-06-30)
- **Plan Years overview** (`/employers/:id/plan-years`, `pages/PlanYearsPage.tsx`)
  shows **all plan years as cards** (not a plain table): status pill, coverage
  period, OE window, eligible count, plan count, enrollment %, launch-blockers,
  readiness bar, and a status-aware primary action (Continue Setup / View Active
  Year / View Archive). Plus a "Why plan years matter" educational banner and a
  Recent Plan Year Activity card.
- **Plan Year Setup** (`/employers/:id/plan-years/:planYearId/setup`) is a
  **drill-down from one specific year** — reached via a card's action, not a
  top-level menu item. **Setup checklist status stays derived** from domain state
  (mock now). Employer Admin sidebar now shows **Plan Years** (not "Plan Year
  Setup") under Benefits.
- **Copy From Prior Year** and **New Plan Year** are future workflows, **mock-only**
  buttons for now. Per-employer plan years differ (Acme 2027 setup/2026 active/2025
  archived; Northstar setup-incomplete; Harbor active/closed; BrightPath not started).

## Product decision — payroll is employer-level (2026-06-30)
**Agencies and brokers do not manage payroll. Payroll is employer-level only.**
Removed from Agency Admin & Broker sidebars (Operations = Carrier Files only).
Employer Admin keeps Operations = Payroll + Carrier Files. Payroll routes stay
routable but show "Not available for this role" for broker/agency. Backend seed
grants payroll.* to broker/agency today — flagged for removal (see
FRONTEND_API_CONTRACT_GAPS.md §0.2).

## Data layer — TanStack Query seam (2026-06-30)
Screens no longer call `db.ts` getters directly — they use **query hooks** in
`src/lib/api/` (`queryClient.ts` + `employerHooks/censusHooks/planYearHooks/
benefitHooks/enrollmentHooks/operationsHooks/complianceHooks`). Each hook wraps a
mock getter in `useQuery` with a stable key. `QueryClientProvider` is at the app
root (mock config: `staleTime: Infinity`, `retry: false`). **Swapping to AppSync =
change the queryFns only**; screens + keys stay. Devtools skipped (not installed).

**Hooks:** `useEmployers/useEmployer/useEmployerOverview`,
`useCensus/useCensusContext/useEmployeeDetail/useDependents`,
`usePlanYears/useCurrentPlanYear/usePlanYearSetupSteps`, `useBenefitPlans`,
`useEnrollmentEvents/useEnrollmentProgress`, `usePayrollDeductions/useCarrierExports`,
`useAcaAleSummary/useCobraSummary`.

**Loading/empty/error:** key screens (Census, Employee Detail, Plan Years/Setup,
Benefit Plans, Enrollment, Payroll, Carrier, ACA/COBRA, Employer overview/setup)
show `LoadingCard` while pending, `ErrorCard` on error (Census), and existing
empty states. **Remaining direct `db.ts` imports (chrome, intentional):**
`AppShell` + `employer-context` + `EmployerSwitcher` read the employer registry
synchronously to build nav/params.

## Per-employer mock data (2026-06-30)
Centralized **employer-keyed mock DB** at `src/lib/mock/db.ts` — one place, no
scattered `if employerId === …`. 4 sample employers: **acme, northstar, harbor,
brightpath** (distinct profiles: industry, headcount, renewal, plan year, setup
state). Access via `getEmployerProfile / getCensus / getCensusContext /
getEmployeeDetail / getPlanYears / getPlanYearChecklist / getBenefitPlans /
getEnrollment / getPayroll / getCarrierExports / getCompliance`.

**Screens that now VARY by employer:** Census + KPI strip, Employee Detail (+
**not-found/wrong-employer** state), Dependents, Plan Years, Plan Year Setup
checklist (statuses differ per employer), Benefit Plans, Enrollment Events,
Enrollment Progress, Payroll Deductions (+ "what changed since last export"),
Carrier Exports, ACA/ALE, COBRA, Employer Overview, Employer Setup header, Book
of Business / Employers directory.

**Still GENERIC (documented):** Life Events, Documents, Eligibility &
Contributions, Reports, Integrations, Settings, and the employee self-service
area (`/employee/*` uses its own fixed mock persona).

## Compliance — 4-tab MVP workspace (2026-07-01)
`pages/CompliancePage.tsx` at `/employers/:id/compliance` — a **single grouped Compliance
workspace** (one sidebar item, `acaCobra` relabeled **"Compliance"**; the orphan `acaAle`/
`cobra` NAV_ITEMS were removed — their `/aca-ale` + `/cobra` routes remain for direct URL
only, not in the sidebar). **Simplified from the earlier 8-tab build to 4 MVP tabs**
(controlled tab bar):
1. **Overview** — 5 status cards (ACA Readiness, ALE/FTE Status, 1095-C Forms, COBRA
   Pending, Notices Due) + **Compliance Tasks / Needs Attention** list + a compact
   **Upcoming Compliance Deadlines** section (calendar folded in here, NOT a separate tab).
2. **ACA / ALE** (combined — answers "are we ready for ACA/ALE/1095-C?") — readiness
   command center (issue chips) + summary cards (ALE Determination, Measurement & Stability,
   Affordability, 1095-C Readiness, Filing Status, ACA Eligibility/Offer) + an inner
   sub-switch **Monthly FTE / 1095-C Forms / Affordability** tables + a "calculated from
   Payroll Data" note.
3. **COBRA** — participant/event/overdue/payment KPI cards + inner sub-switch **Qualifying
   Events / Qualified Beneficiaries / Payments** (event queue: notice/election/payment/TPA
   status + next step).
4. **Notices** — compliance notices table (COBRA, Medicare Part D, CHIP, SBC, Employer
   Marketplace, 1095-C copies) with audience / due / delivery / status.
- **Deferred (future):** separate **1095-C** tab, separate **ALE / FTE** tab, separate
  **Compliance Calendar** tab (calendar lives in Overview for now).
- **Role behavior:** Employer Admin = full page. **Broker/Agency = limited summary**
  (Overview tab only, payroll-level detail hidden, header filing actions hidden, payroll
  Needs-Attention item filtered). Employee never routes here (nav-gated).
- **Terminology:** Payroll Data / ACA Lookback (§payroll) **supports** ACA calculations;
  **Compliance** is where results are reviewed and filed. COBRA is a compliance workflow
  that depends on employee/dependent/coverage/life-event data.
- All **mock** (representative inline constants), our semantic tokens, plain row actions
  (no Dropdown/Tooltip/Sheet primitives); every action is a stub. Old `AcaCobraHubPage`
  left in `HubPages.tsx` but no longer routed.

## Waves — status

| Wave | Screens | Status |
|---|---|---|
| **A — Admin / Employer setup** | Dashboard, Agencies, Agency overview, Book of Business, Employers list, Employer overview, Employer Setup (tabs), Locations/Divisions, Contacts, Plan Years, Plan Year Setup checklist | ✅ built (mock) |
| **B — Census & people** | Employee Census (simplified), Employee Detail (sections), Dependents, Census Health (expandable), Beneficiaries placeholder | ✅ built; Beneficiaries = placeholder; dedicated "missing data view" = derived in census (issues column). **Census filter toolbar (2026-07-01):** search + 3 native-select filters (Employment Status / Eligibility / Missing Data) + toggleable **quick-filter chips** (Missing Data / New Hires / Needs Review / COBRA) + live "N of M shown" count + Clear-all — all **functional** predicates over the mock (Lovable's are visual stubs) |
| **C — Benefits setup** | Benefit Plans, Eligibility classes, Contribution rules | ✅ built (mock). Plan options / rates = summarized, not dedicated editors yet |
| **D — Enrollment admin** | Enrollment Events, Enrollment Progress, Elections Review, Waiver Review, Life Events | ✅ built (mock). Enrollment window setup + invitation/comms = light (events screen) |
| **E — Employee self-service** | My Benefits, Enroll (stepper: Profile→Dependents→Compare→Elect→Beneficiary→Review), Compare Plans, Coverage Tier, Waive, Review & Submit, Confirmation, My Dependents, My Life Events, My Documents | ✅ built (mock), separate `/employee/*` shell |
| **F — Operations** | Payroll Deductions review, Carrier Exports (batches + errors) | ✅ built. Payroll export batches + "what changed since last export" + carrier export *profiles* = not yet dedicated screens |
| **G — Compliance** | ACA/ALE (1095-C summary + monthly FT/FTE), COBRA (events/notices/payments via columns) | ✅ built. Measurement/stability periods, dedicated 1095-C records list, COBRA QBs/notices/payments sub-screens = not yet |

## Built screens (routes)
Admin: `/dashboard`, `/agencies`, `/agencies/$agencyId(/brokers|/employers)`,
`/book-of-business`, `/employers`, `/employers/$employerId` (overview) + `/setup`
`/locations` `/contacts` `/payroll-tax` `/aca-cobra` `/plan-years`
`/plan-years/$planYearId/setup` `/census` `/employees/$employeeId` `/benefit-plans`
`/eligibility-contributions` `/documents` `/enrollment-events` `/enrollment-progress`
`/elections-review` `/waiver-review` `/life-events` `/payroll-deductions`
`/carrier-exports` `/aca-ale` `/cobra`; `/reports` `/integrations` `/settings`.
Employee: `/employee`, `/employee/benefits`, `/employee/enroll`,
`/employee/enroll/confirm`, `/employee/dependents`, `/employee/life-events`,
`/employee/documents`.

## Operations split: Deductions + Payroll Data (2026-07-01, supersedes below)
**The single "Payroll" page was split into two separate Operations nav items** because
they are two different jobs. `pages/PayrollPage.tsx` was **removed**; its content lives in:
- **Deductions** (`pages/DeductionsPage.tsx`, route `/employers/:id/deductions`, nav label
  **Deductions**) — the **recurring per-pay-period** benefit-deduction workflow. Tabs:
  **Deduction Review** (default; 7 summary cards + enriched table + Export-Ready action) ·
  **Changes Since Last Export** · **Export Batches**.
- **Payroll Data** (`pages/PayrollDataPage.tsx`, route `/employers/:id/payroll-data`, nav
  label **Payroll Data**) — supporting **setup/history/compliance** data. Tabs: **Payroll
  Connection** (Connection & Health + Import Summary) · **Imported Pay Periods** ·
  **Employee Payroll Records** (with the small "View ACA Lookback →" link) · **ACA
  Lookback** (readiness + lookback periods + affordability/1095-C) · **Payroll Settings**.
- **Nav (Employer Admin Operations):** `deductions`, `payrollData`, `carrierExports`
  (the old `payrollHub` "Payroll" item was removed — the label was too broad). **Not shown
  to Agency Admin / Broker** (their Operations = Carrier Files only) or Employee.
- **Routes:** `/deductions` + `/payroll-data` are canonical; **legacy `/payroll` maps to
  Payroll Data only** (kept as an alias to avoid churn). Both pages share
  `getPayrollWorkspace` / `usePayrollWorkspace` and enforce `PAYROLL_BLOCKED`.
- **Terminology:** Payroll = the overall employer area (now two items); **Deductions** =
  recurring benefit-deduction workflow; **Payroll Data** = imported/synced history +
  connection + matching + ACA lookback + settings; **ACA Lookback** = compliance
  measurement/affordability readiness; **Export Batches** = files sent to payroll.

--- The section below documents the earlier single-page design (now superseded) ---

## Payroll = Payroll Data + Deductions workspace (Lovable, 2026-07-01)
Replaced the thin `PayrollHubPage` (retired from `HubPages.tsx`) with the full
`pages/PayrollPage.tsx` at `/employers/:id/payroll` (router repointed). **Employer-level
only** — `PAYROLL_BLOCKED = {broker, agency_admin}` → RoleNotAvailable; employee never
routes here; platform/support may view later (not MVP workflow). Header: **Payroll** +
**Connected** / **Lookback Ready** badges + Sync Provider / Run Lookback / Import Payroll
Data / More. Subtitle: "Review benefit deductions, export payroll changes, and manage
payroll data for the selected plan year." **6 tabs** (controlled via useState).
**Deduction Review is the DEFAULT + first tab (2026-07-01)** — it's the recurring
**per-pay-period** operational workflow; Payroll Data is supporting **historical/compliance**
data (setup/sync/ACA review, less frequent). **Tab order: Deduction Review → Changes Since
Last Export → Export Batches → Payroll Data → ACA Lookback → Payroll Settings.**
- **Deduction Review** (default) — summary cards (**Ready to Export / Needs Review /
  Missing Payroll Code / Amount Changed / Effective This Pay Period / Total EE·Pay / Total
  ER·Pay**) + table (Employee / Plan / Coverage Tier / Effective / Payroll Group /
  Deduction Code / EE·Pay / ER·Pay / **Change Type** / Status / Action). Statuses: Ready /
  Needs Review / Missing Payroll Code / Amount Changed / Pending Export / **Exported**.
  Change types: New Election / Changed Election / Life Event / New Hire / Termination /
  Waiver / Rate Change / Payroll Group Change. Status-aware actions: Review / Approve / Map
  Code / View Change / Export / View. Mock adds `deductionSummary` to `PayrollWorkspace`;
  deduction rows gain `effective` / `payrollGroup` / `changeType`.

The remaining tabs (below) keep their content; only order + Deduction-Review prominence
changed. **ACA lookback readiness was split OUT of Payroll Data into its own tab
(2026-07-01):**
1. **Payroll Data** (default) — *is payroll data flowing in?* (simplified): **Payroll
   Connection & Health** as the main summary card (provider, frequency, group, first/last
   imported, last/next sync, data source + Sync/Mapping/History) · a compact **Import
   Summary** card (Imported Pay Periods / Matched / Unmatched / Last Sync Status) · an inner
   **Imported Pay Periods** ⇄ **Employee Payroll Records** switch. The Employee Records view
   shows ONLY a small **"ACA lookback readiness has N missing records. View ACA Lookback →"**
   link (switches to the ACA tab) — the readiness card is NOT here anymore.
2. **ACA Lookback** (NEW) — *ACA measurement / affordability / readiness*: the **Payroll
   Data Readiness for ACA Lookback** card (readiness % + issue chips: missing records /
   missing hours / missing W-2 wages / unmapped groups / duplicate records / unmatched
   employees + Resolve/View-Unmatched/Recalculate) · **Lookback Periods** card (measurement
   / stability / administrative period, lookback calc status, last calculated) · **ACA /
   Affordability Readiness** card (full-time determination, affordability data, 1095-C
   readiness). Mock adds `importSummary` + `aca` to `PayrollWorkspace`.
3. **Deduction Review** — benefit deductions (Employee/Plan/Tier/EE·Pay/ER·Pay/Payroll
   Code/Status/Issues/Action); statuses Ready / Needs Review / Missing payroll code /
   Amount changed / Pending export.
4. **Changes Since Last Export** — Employee/Change Type/Previous/New/Effective/Status/
   Action (new/changed elections, waivers-terms, life events, new hires, group moves).
5. **Export Batches** — Batch Date/Pay Period/Employees/Total EE/Total ER/Status/File/
   Errors (Draft/Ready/Exported/Failed/Reconciled).
6. **Payroll Settings** — provider, frequency, deduction schedule, groups, code mapping,
   sync, export format (editable = stub).
- **Terminology enforced (4 distinct areas):** *Payroll Data* = imported/synced payroll
  history · *ACA Lookback* = ACA measurement/affordability/1095-C readiness · *Deduction
  Review* = benefit deduction review · *Export Batches* = payroll export workflow — never
  conflated.
- **Plan-year aware:** Setup/Open → lookback readiness + pending/new-election deductions +
  Draft batches; Active/closed → active deductions + life-event/new-hire changes +
  Exported batches; Archived → **read-only** (actions hidden, deductions Ready, batches
  Reconciled, no changes). Mock `getPayrollWorkspace(employerId, planYearId)` →
  `PayrollWorkspace`; hook `usePayrollWorkspace`. All actions stubs (sync/import/export/
  edit). The separate `/payroll-deductions` route + old `PayrollDeductionsPage` are
  untouched (legacy).

## Enrollment Center = readiness / status / windows (2026-07-01)
**Renamed** the sidebar item + page from "Open Enrollment" / "Enrollment Events" to
**Enrollment Center** (persona `enrollmentEvents` default label; route/component export
names unchanged). It's the enrollment command center for the selected employer + plan
year — deliberately compact, one **state-aware primary card** + a compact Windows table.
**Responsibility split:** Enrollment Center = readiness/status/windows/preview/next
action · **Enrollment Progress** = live progress, submitted/in-progress/not-started,
reminders, needs-action lists, progress-by-benefit · Elections Review = elections/
waivers/EOI/corrections · Life Events = QLEs. The Center never duplicates the full
progress dashboard.
**Two layers** so the page is never "just Open Enrollment": (1) a state-specific
**hero/status card** for annual/open enrollment, then (2) an **always-visible Ongoing
Enrollment Work** section, then (3) the **Enrollment Windows** table. QLE / new-hire /
special work is surfaced high on the page, not buried in the table.
- **1. Hero/status card** (`pages/EnrollmentPages.tsx`, switches on `launchState`;
  hero label is **state-specific**):
  - **not_launched (Setup)** → `LaunchReadinessCard` = **"Launch Readiness"**: readiness
    %, checklist, **blockers vs warnings**, gated **Launch Enrollment** (disabled +
    inline reason) + Resolve Blockers.
  - **launched (OpenEnrollment)** → `ProgressSummaryCard` = **"Open Enrollment
    Progress"**: completion %, Submitted / In Progress / Not Started / Needs Action +
    reminder line. CTAs: **Send Reminders**, **View Enrollment Progress** (summary only —
    full lists live on Enrollment Progress).
  - **closed (Active)** → `ResultsSummaryCard` = **"Open Enrollment Results"**: final %,
    Enrolled / Waived / Late-Missing / Carrier-Files. CTAs: **Review Elections**, **View
    Results**. (Closed annual OE ≠ enrollment finished — see Ongoing Work.)
  - **archived** → `ArchiveSummaryCard` = **"Open Enrollment Archive"**: read-only
    summary + **View Archive**.
  - **Hero metrics are ANNUAL OPEN ENROLLMENT ONLY** — they never include new hire, QLE,
    special enrollment, mid-year corrections, or COBRA (those are the Ongoing Work
    section). Each hero carries a clarifying helper line: setup → "Launch readiness for
    the annual open enrollment window."; open → "Open enrollment progress only. Ongoing
    new hire and life event work is tracked below."; closed → "Annual open enrollment
    results only. New hire, life event, and special enrollment activity is tracked
    below."; archived → "Read-only annual open enrollment results." Data comes from a
    dedicated `getOpenEnrollmentSummary(employerId, planYearId)` → `OpenEnrollmentSummary`
    (`completionPercent, eligible, submitted, inProgress, notStarted, needsAction,
    enrolled, waived, lateMissing, carrierFilesStatus`), hook `useOpenEnrollmentSummary`
    — kept separate from `ongoingEnrollmentWork` and `enrollmentWindows` so the three
    concepts never mix.
- **2. Ongoing Enrollment Work** (`OngoingEnrollmentWork`, always visible for non-archived
  years; hidden when archived) — compact 4-card grid: **New Hire Enrollment**, **Life
  Event / QLE**, **Special Enrollment**, **Pending Documents**. Each shows count +
  count-label + status + **urgency pill** (High/Medium/Low) + a **next-action** button
  (View Progress → enrollment-progress · Review → life-events · View Issues → documents ·
  Configure → stub). Data: `getOngoingEnrollmentWork(employerId, planYearId)`
  (`OngoingWorkItem[]`; [] for archived), hook `useOngoingEnrollmentWork`.
- **Enrollment Windows table (compact)** — Event / Type / Window / Effective Date /
  Employees / Status / **Next Action** (no completion bar — that's progress-dashboard
  territory). Types: Open Enrollment / New Hire / Life Event / Special Enrollment +
  **filter pills**. Status-aware next action (Resolve Blockers / Review Launch / View
  Progress / Review / Configure Window / View Results).
- **Header actions are status-aware** (all secondary/outline; primary next action lives
  in the state card): **not_launched / launched** → Preview Employee Experience + New
  Enrollment Window. **closed (Active)** → none in the header (results context; window
  creation lives in the Windows card). **archived** → none (read-only). The Windows
  card's **+ New Enrollment Window** shows for all states except archived.
- **Role behavior:** Employer Admin full + enabled Launch. Broker/Agency: payroll/
  carrier blockers filtered, Launch disabled reading "Employer approval required" /
  "Ready for Employer Review". Employee shell never routes here.
- **Mock data (centralized in `db.ts`):** `getLaunchReadiness(employerId, planYearId)`
  (`LaunchReadiness`) + `getEnrollmentWindows(employerId, planYearId)`
  (`EnrollmentWindow`). Hooks: `useLaunchReadiness`, `useEnrollmentWindows`.
- **Route:** stays `/employers/:employerId/enrollment-events` for now (rename = churn
  across router + all links). **Preferred future route: `/employers/:employerId/
  enrollment`** — shorter and broad enough for open enrollment, new hire, QLE, and
  special enrollment windows. (Alt considered: `/enrollment-center`.) Rename only when
  low-risk; plan year comes from top-bar context.
- **Terminology (user-facing, canonical):** **Enrollment Center** (sidebar + title) ·
  **Enrollment Windows** (table/card) · **New Enrollment Window** (the only creation
  button label — "Create Enrollment Event" retired from the UI) · window types/pills:
  **Open Enrollment**, **New Hire Enrollment**, **Life Event / QLE**, **Special
  Enrollment** (internal type values stay short: `New Hire` / `Life Event`; a `TYPE_LABEL`
  map renders the friendly pill text). "Open Enrollment" remains valid ONLY as a
  plan-year **phase status** and a **window type** — never a nav/tab/page name.
  "Enrollment Event" is fine internally (`enrollmentEvents` nav key,
  `EnrollmentEventsPage` export, `EnrollmentWindowType`); no user-facing "Enrollment
  Events" / "OE Dashboard" / "Create Enrollment Event" strings remain.
- **Read-only for archived:** creation actions hidden (header + Windows-card button),
  Windows card shows a "read-only archive" caption.
- **Stubs:** Create Enrollment Event, New Window, Resolve Blockers, Send Reminders,
  per-window next actions (except "View Progress" → real route), Launch (local banner),
  Preview Employee Experience (→ `/employee/enroll`).

## Life Events — employee report flow vs HR work queue (2026-07-01)
**Two separate experiences, never merged:**
- **Employee Self-Service — Report Life Event** (`/employee/life-events/report`,
  `pages/employee/ReportLifeEventPage.tsx`): a 5-step wizard — **Event Type → Event
  Details → Affected People → Documents → Review & Submit** — with a right-side **Request
  Summary** card + **"What happens next?"** card. Step 1 = 10 event-type cards (Marriage,
  Divorce/Separation, Birth/Adoption, Loss/Gain of Other Coverage, Death of Dependent,
  Dependent Aging Out, Address Change, Employment Status Change, Other) each w/ icon +
  explanation. Step 2 collects event date + notes + conditional prior-end / new-start
  dates + 30-day deadline guidance. Step 3 selects affected people from `myDependents`
  (+ "add new dependent" placeholder for marriage/birth). Step 4 shows event-specific
  required docs w/ mock upload + privacy note. Step 5 = review + acknowledgement + Submit
  (→ "Under Review" success card). Buttons: Back / Save Draft / Continue / Submit Request.
  Copy: "Estimated effective date is subject to HR review and plan rules." and "Election
  review approves submitted intent…"-style model note ("Payroll and carriers are updated,
  **if applicable**" — self-service de-emphasizes payroll). Mock config
  `lifeEventTypes` + `reportLifeEventSteps` in `employee-self-mock.ts`. Lives under the
  **Employee** shell (My Benefits / Enroll / My Dependents / Life Events / Documents /
  Help) — never the HR admin sidebar.
- **HR/Admin — Life Events work queue** (`/employers/:id/life-events`) — **rebuilt
  2026-07-01** as `pages/LifeEventsPage.tsx` (the old simple table in `ListScreens.tsx`
  was **retired**; router import repointed). Header (Review Pending Requests / Add Life
  Event / More) → **5 summary cards** (Pending Review, Needs Documents, Election Windows
  Open, Carrier Pending, Completed This Month — clickable → filter) → **filter tabs**
  (All / Needs Review / Needs Documents / Election Window Open / Carrier Pending /
  Completed) → **work queue table** (Employee / Life Event / Status / Documents /
  Election Window / Next Step / status-aware Action) + a **Life Event Tasks** card
  (requests need docs / approved events need windows / completed elections need carrier
  update / aging-out reviews due). Plan-year aware (Archived → read-only, actions +
  tasks hidden). Role: Employer Admin sees carrier/payroll wording; **Broker/Agency have
  "& payroll" stripped** from next-step text. Mock `getLifeEventQueue(employerId,
  planYearId)` → `LifeEventQueue` (readOnly/counts/tasks/cases); hook `useLifeEventQueue`.
  All actions are stubs. Employer Admin uses THIS, not the report wizard.
- **Life-event request lifecycle:** submitted → under review → needs documents →
  approved / denied → election window open → election submitted → completed.
- **Mock only:** upload, Save Draft, Submit, add-dependent are all stubs; no backend.

## Elections Review — review queues (2026-07-01)
Redesigned `ReviewScreens.ElectionsReviewPage` around **review queues** so it doesn't
duplicate Enrollment Center (setup/readiness/windows/launch) or Enrollment Progress
(who-submitted / reminders / progress-by-benefit). Purpose: review submitted **intent**
before it becomes coverage / deductions / carrier export. Structure: header (Approve All
Ready / Export Review List / More) → **7 summary cards** (Needs Review, Ready to Approve,
EOI Required, Dependent Issues, Waivers, Cost/Deduction, Approved — clickable → set tab)
→ **filter tabs** (All + those 7) → **review table** (Employee / Election Type / Selected
Plans / Coverage Tier / Dependents / Issues / EE Cost·Pay / Submitted / Status /
status-aware Action) → model note ("Election review approves submitted intent. Active
coverage is created separately…") → **detail drawer** (right-side overlay, mock: employee
info, submitted plans, dependents, waiver/EOI/documents flags, cost summary, admin-notes
textarea, action buttons). **Status-aware actions** (Approve / Review / Request EOI /
Request Documents / Review Waiver / Send Back / View) — not all "Approve". Explicitly
**omits** participation chart, reminder schedule, not-started list, progress-by-benefit
(those live on Enrollment Progress). **Plan-year aware:** Setup → empty ("enrollment
hasn't opened"); Open/Active → pending review queues; Archived → **read-only approved
history** (actions hidden). Mock `getElectionReview(employerId, planYearId)` →
`ElectionReview` (`readOnly, counts, rows[]`); hook `useElectionReview`. All actions are
stubs (Approve/Send Back/Request… do not mutate).

## Documents & Forms — readiness + library workspace (Lovable, 2026-07-01)
Replaced the basic table (`ListScreens.DocumentsPage`) with a plan-year-aware workspace
in new `pages/DocumentsPage.tsx` (router import updated). Sections: **Header** (title +
subtitle + employer/plan-year context + status pill; actions Upload Document / Create
Form / More) → **Document Readiness** card (readiness % + missing / employee-action /
expiring-soon counts + progress + clickable issue chips: Missing SBCs, Missing carrier
brochures, EOI pending, Dependent verification pending, Employer application not signed,
Plan docs expiring soon) → **Document Tasks** card (top open tasks w/ priority) →
**Document Categories** (6 clickable cards: Plan Documents, Employee Forms, EOI Forms,
Dependent Verification, Employer Forms, Compliance Notices → filter the library) →
**Document Library** (rich table: Document / Category / Related To / Required For /
Status / Expires / Actions, with search + Type/Coverage/Carrier/Status native selects,
issue+category cross-filters, Clear filter) → **footer placeholders** (Signature
tracking / Confirmation generator / Audit history).
- **Plan-year aware:** OpenEnrollment → readiness/pending EOI/missing docs; Active
  (closed) → published + generated confirmations, readiness card hidden…no, readiness
  100% + no issues + minimal tasks; Archived → **read-only** (creation actions + tasks
  hidden, "Read-only archive" badge, statuses Archived). Documents are derived from the
  employer's **actual benefit plans** (SBC/summary/brochure per line) + standard forms
  (guide, EOI, verification, confirmation, employer app, ACA notice).
- **Role behavior:** Employer Admin sees everything. Broker/Agency: **payroll-area
  document tasks filtered out** (still see readiness + plan/carrier tasks). Employee
  never routes here — employee self-service has its own `/employee/documents` (My
  Documents), unchanged.
- **Mock/stubs:** `getDocumentWorkspace(employerId, planYearId)` → `DocumentWorkspace`
  (`readinessPercent, missingCount, employeeActionCount, expiringSoonCount, readOnly,
  issues[], tasks[], categories[], docs[]`); hook `useDocumentWorkspace`. Upload / Create
  Form / More / Export / row Upload+View / footer links are all visual stubs — no real
  file upload, e-signature, or document generation.

## Plans & Rates — config & readiness workspace (2026-07-01)
**Canonical benefit-plan setup surface (2026-07-01):** the legacy `BenefitPlansPage`
(`ListScreens.tsx`) is **retired** — `PlansRatesPage` is the SINGLE page that manages
benefit plans. Canonical route is now **`/employers/:employerId/benefit-plans`** (+
`/benefit-plans/$planId` → `PlanDetailPage`); the old `/plans-rates` routes were removed
and the nav item + Plan-Year-Setup checklist + all internal links point at
`/benefit-plans`. Nav/title label stays **Plans & Rates** (route rename to `/plans-rates`
is an OPTIONAL future move, deferred to avoid churn). Naming: "Plans & Rates" = the page;
"Benefit Plan" = an individual plan entity; "Plan Rates" = rate setup; "Employer
Contributions" = contribution rules. The duplicate "Benefit Plans" nav item was removed.

Enhanced `PlansRatesPage` into a plan-year-aware config/readiness workspace (canonical
route `/employers/:id/benefit-plans`; label **Plans & Rates**). Structure: header (Add Plan /
Copy From Prior Year / Import Rates / More — hidden when archived) → **Plan Readiness**
card (Total / Ready / Missing Rates / Missing Contributions / Missing Documents-SBCs /
Launch Blockers — visually connects to Enrollment Center readiness) → **category tabs**
(All / Medical / Dental / Vision / Life & Disability / Voluntary / Supplemental /
Spending Accounts / Retirement / Other, with counts) → **plan table** (Plan / Type /
Status / Tiers / **Rates** / **Contribution** / **Documents** status badges / Enrolled /
Action) with a **launch-blocker flag** and an **expandable row** (rate table + employer
contribution rule + eligibility classes + required docs + carrier-mapping/display status,
read-only via `useBenefitPlanDetail`). Plan name still links to the full `PlanDetailPage`.
- **Statuses:** Ready / Missing Rates / Missing Contributions / Missing Documents / Draft
  / Archived. Per-plan config badges: rate (Complete/Missing), contribution
  (Configured/Missing — warning not blocker for voluntary), document (Ready/Missing).
- **Plan-year aware:** derived from plan-year phase — Setup/Open → statuses from each
  plan's `setupIssues` (some missing → blockers); Active → mostly Ready; Archived →
  read-only. Northstar/BrightPath setup years show more blockers.
- **Feeds:** Plan Year Setup readiness, Enrollment Center launch blockers, employee
  enrollment display, payroll deductions, carrier exports, Documents & Forms.
- **Model language kept distinct:** Benefit Plan / Coverage Tier / Plan Rate / Employer
  Contribution Rule — employee **elections** + **coverage records** are NOT shown here
  (footer note). Mock `getPlanCatalog(employerId, planYearId)` → `PlanCatalog`
  (`readOnly, summary, rows[]`); hook `usePlanCatalog`. All actions stubs (no real
  add/copy/import/rate-edit).

## Plans & Rates + Plan Detail (Lovable, 2026-07-01)
`pages/PlansRatesPage.tsx` (new file; moved out of HubPages) is now the Lovable-style
**benefit plan list**: summary cards (Active / Missing Setup / Renewals / Enrolled),
Attention-needed card, **type pills** (All + lines), search + carrier/status selects,
"N of M shown", and a table (Plan → detail link, Type, Status, Effective, Enrolled,
Setup, View Details). Enriched `BenefitPlanRow` with `effective` + `setupIssues`.
**Plan Detail** (`/employers/$employerId/benefit-plans/$planId`, `PlanDetailPage`) is a
**designed** page (Lovable had none): back link, header + status + actions, 6-tile
summary strip, setup-issues banner, and tabs **Plan Benefits** (in/out-of-network
coverage), **Rates** (monthly premium by tier — total/employer/employee),
**Eligibility & Contributions**, **Documents**. Detail data comes from
`getBenefitPlanDetail` which composes the row with a **per-line template**
(Medical/Dental/Vision/Life&Voluntary) so every plan renders realistic benefits +
rates — hook `useBenefitPlanDetail`. **Stubs:** Import Plans / Add Plan / Edit Plan /
Manage Rates / Upload Documents / doc View, and the carrier/status/type filters are
functional but rate & benefit values are template-generated (not per-plan authored).

## Employee Detail page — mock/stubs to wire later (2026-07-01)
Full Lovable-style tabbed profile is built (`pages/EmployeeDetailPage.tsx`), but only
the header + Overview (Personal/Employment) + Dependents read **real** employee data.
Everything below is UI-only and needs wiring when the module ships:
- **Header actions (no-op):** Edit Employee, Start Enrollment Event, Send Reminder,
  View Employee Portal, Resolve Issues, Export Employee Record.
- **Summary cards (static counts):** "Eligibility 7 of 8", "Enrollment In Progress ·
  4 of 8", "Data Quality Complete" — not derived from data yet.
- **Overview:** 2027 Plan Year Enrollment block (event window, coverage-decisions
  progress 4/8) and Data Quality checklist are static.
- **Dependents:** real records, but **covered coverage lines** aren't modeled (only
  `coveredStatus`); Verify/Edit/Add buttons are stubs.
- **Beneficiaries / Eligibility / Elections / Life Events / Payroll Deductions /
  Documents / Audit tabs:** fully **representative mock** (each carries a "not yet
  wired" note). Row actions (View Rules, Download, Upload, election buttons) are stubs.
  "Open Life Events" links to the real employer-scoped route.

## Census page — stubs to wire later (2026-07-01)
- **Run Eligibility Preview**, **Import**, **Add Employee**, **Advanced Filters**
  buttons + per-row **View** works but no row action menu / bulk actions yet.
- Filter dropdowns + quick-filter chips ARE functional; Advanced Filters is a stub.

## Still mock-only / not built (next candidates)
- Plan **options** and **rates** dedicated editors (currently summarized).
- Enrollment **window setup wizard** + **invitation/communications composer**.
- Payroll **export batches** + **diff ("what changed since last export")** screen.
- Carrier **export profiles / field mapping** editor + line-level error drill-down.
- COBRA **qualified beneficiaries / notices / payments** sub-screens.
- ACA **measurement/stability period** detail + **1095-C records** list.
- **Beneficiaries** real screen (placeholder today).
- Multi-employer selection UX (currently a constant).

## Cross-cutting TODO (not this pass)
TanStack Router data **loaders** + `@tanstack/react-query`; **Cognito** auth +
role/scope **guards** (metadata placeholders exist via route `staticData`);
employer-setup tabs becoming route-driven; `employerId↔customerId` mapping at the
data layer. See `FRONTEND_API_CONTRACT_GAPS.md`.
