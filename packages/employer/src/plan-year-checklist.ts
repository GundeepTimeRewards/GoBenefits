/**
 * Plan Year Setup checklist — PURE derivation (Phase D-1).
 *
 * The checklist is a DERIVED read model (no task table): the control-plane step
 * CATALOG (`plan_year_setup_step_definition`) is combined with per-plan-year
 * customer overrides (`plan_year_setup_step_override`) and current domain state to
 * compute each step's status, plus a server-authoritative `completionPct` + `blockers`.
 *
 * V1 derivation is deliberately narrow: only the domains already wired
 * (census, plan-year status) light up. Every other step is `not_started` — which is
 * the CORRECT answer, not a stub. Later slices (Plans & Rates, Enrollment, …) extend
 * `deriveStepStatus` so their steps light up without touching this shape.
 *
 * This module is pure (no DB, no I/O) so the rules are unit-testable in isolation;
 * the repository/service feed it rows. Field names mirror the GraphQL
 * `PlanYearSetupStatus` / `ChecklistStep` types in api/schema.graphql.
 */

/** GraphQL `ChecklistStatus`. */
export type ChecklistStatus =
  | "complete"
  | "in_progress"
  | "needs_attention"
  | "not_started"
  | "blocked"
  | "not_applicable";

/** A row from control-plane `plan_year_setup_step_definition` (the catalog). */
export type StepDefinition = {
  stepKey: string;
  label: string;
  description: string | null;
  category: string | null;
  displayOrder: number;
  requiredByDefault: boolean;
  route: string | null;
};

/** A row from customer `plan_year_setup_step_override` (per plan year). */
export type StepOverride = {
  stepKey: string;
  overrideStatus: "not_applicable" | "acknowledged" | "unblocked" | null;
  isHidden: boolean;
  /** null → no override; otherwise overrides the definition's requiredByDefault. */
  isRequiredOverride: boolean | null;
  notes: string | null;
};

/** Current domain state used by derivation. Extended slice-by-slice. */
export type DomainState = {
  planYearExists: boolean;
  planYearStatus: string | null; // setup | active | archived
  employeeCount: number;
  // D-2 (Plans & Rates) — plan-year-scoped counts, except contribution rules which are
  // employer-level (the contribution_rule table has no plan_year_id).
  planCount: number; // benefit_plan rows for the PY (any status)
  completePlanCount: number; // benefit_plan rows with setup_status='complete'
  rateCount: number; // plan_rate rows across the PY's plans
  contributionRuleCount: number; // contribution_rule rows (employer-level)
  optionCount: number; // plan_option rows across the PY's plans
  // D-3 (Enrollment) — scoped to the PY's open-enrollment event.
  windowCount: number; // enrollment_window rows for the OE event
  invitationSentCount: number; // enrollment_invitation rows with status >= sent
  submittedElectionCount: number; // employee_election rows submitted/approved
  waiverCount: number; // waiver rows for the OE event
};

/** GraphQL `ChecklistStep` (field names match the SDL — note `key`, not `stepKey`). */
export type ChecklistStep = {
  key: string;
  label: string;
  description: string | null;
  category: string | null;
  requiredByDefault: boolean;
  status: ChecklistStatus;
  route: string | null;
  message: string | null;
};

/** GraphQL `PlanYearSetupStatus`. */
export type PlanYearSetupStatus = {
  employerId: string;
  planYearId: string;
  completionPct: number;
  blockers: number;
  steps: ChecklistStep[];
};

/**
 * Base status for a step, from domain state alone (before overrides).
 *   - `census_imported`  → complete once any employee exists, else not_started.
 *   - `readiness_review` → complete once the plan year is `active` (you don't reach
 *     active without passing go-live), else not_started.
 *   - D-2 Plans & Rates: `plans_configured` (complete when a plan is fully set up,
 *     in_progress while plans exist but none complete), `options_configured`,
 *     `rates_configured`, `contributions_configured` — presence-based from real rows.
 *   - D-3 Enrollment: `window_configured` (an enrollment window exists),
 *     `invitations_sent` (any invite sent), `elections_reviewed` (any submitted election),
 *     `waivers_reviewed` (any waiver) — presence-based from the OE event.
 *   - everything else    → not_started (its domain isn't wired yet; honest, not faked).
 */
export function deriveStepStatus(def: StepDefinition, domain: DomainState): ChecklistStatus {
  switch (def.stepKey) {
    case "census_imported":
      return domain.employeeCount > 0 ? "complete" : "not_started";
    case "readiness_review":
      return domain.planYearStatus === "active" ? "complete" : "not_started";
    case "plans_configured":
      if (domain.completePlanCount > 0) return "complete";
      return domain.planCount > 0 ? "in_progress" : "not_started";
    case "options_configured":
      return domain.optionCount > 0 ? "complete" : "not_started";
    case "rates_configured":
      return domain.rateCount > 0 ? "complete" : "not_started";
    case "contributions_configured":
      return domain.contributionRuleCount > 0 ? "complete" : "not_started";
    case "window_configured":
      return domain.windowCount > 0 ? "complete" : "not_started";
    case "invitations_sent":
      return domain.invitationSentCount > 0 ? "complete" : "not_started";
    case "elections_reviewed":
      return domain.submittedElectionCount > 0 ? "complete" : "not_started";
    case "waivers_reviewed":
      return domain.waiverCount > 0 ? "complete" : "not_started";
    default:
      return "not_started";
  }
}

/** Apply an override to a step's base status (override precedence documented inline). */
function applyOverrideStatus(base: ChecklistStatus, override: StepOverride | undefined): ChecklistStatus {
  if (!override || override.overrideStatus == null) return base;
  switch (override.overrideStatus) {
    case "not_applicable":
      return "not_applicable"; // admin marked the step N/A — excluded from completion/blockers
    case "acknowledged":
      return "complete"; // admin acknowledged it's handled (no distinct enum value)
    case "unblocked":
      return base === "blocked" ? "needs_attention" : base; // clears a hard block (v1 base is never blocked → no-op)
    default:
      return base;
  }
}

/** Effective "required" flag: an explicit override wins over the catalog default. */
function effectiveRequired(def: StepDefinition, override: StepOverride | undefined): boolean {
  if (override && override.isRequiredOverride != null) return override.isRequiredOverride;
  return def.requiredByDefault;
}

/**
 * Assemble the full derived checklist read model.
 *   - Hidden overrides drop the step entirely (excluded from output + all math).
 *   - `completionPct` = required, applicable steps that are `complete`, over all
 *     required, applicable steps (0 when there are none). Required-based to match the
 *     existing UI semantics ("X/Y required complete").
 *   - `blockers` = required, applicable steps whose status is a hard stop
 *     (`blocked` or `needs_attention`). In v1 no step derives to those, so live
 *     blockers are 0 until later slices add those states — honest by construction.
 * All completion/blocker math is server-side (the FE renders these values verbatim).
 */
export function deriveChecklist(
  employerId: string,
  planYearId: string,
  defs: StepDefinition[],
  overrides: StepOverride[],
  domain: DomainState
): PlanYearSetupStatus {
  const overrideByKey = new Map(overrides.map((o) => [o.stepKey, o]));

  const steps: ChecklistStep[] = [];
  let requiredApplicable = 0;
  let requiredComplete = 0;
  let blockers = 0;

  for (const def of [...defs].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const override = overrideByKey.get(def.stepKey);
    if (override?.isHidden) continue; // hidden → not shown, not counted

    const status = applyOverrideStatus(deriveStepStatus(def, domain), override);
    const required = effectiveRequired(def, override);
    const applicable = status !== "not_applicable";

    if (required && applicable) {
      requiredApplicable += 1;
      if (status === "complete") requiredComplete += 1;
      if (status === "blocked" || status === "needs_attention") blockers += 1;
    }

    steps.push({
      key: def.stepKey,
      label: def.label,
      description: def.description,
      category: def.category,
      requiredByDefault: def.requiredByDefault,
      status,
      route: def.route,
      // Surface an override note (e.g. why a step is N/A) as the step message.
      message: override?.notes ?? null,
    });
  }

  const completionPct = requiredApplicable === 0 ? 0 : Math.round((100 * requiredComplete) / requiredApplicable);
  return { employerId, planYearId, completionPct, blockers, steps };
}
