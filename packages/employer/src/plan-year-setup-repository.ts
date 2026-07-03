/**
 * Plan Year Setup repository (Phase D-1). Reads the three inputs the pure
 * `deriveChecklist` needs:
 *   - step DEFINITIONS from the control-plane catalog (shared across tenants),
 *   - per-plan-year OVERRIDES from the routed customer DB,
 *   - current DOMAIN STATE (plan-year existence/status + census count) from the same
 *     routed customer DB.
 * It never resolves tenancy itself — the service authorizes + routes via
 * getCustomerDb and passes the customer pool in. The control-plane pool is read-only
 * reference data here (the seeded step catalog), not tenant data.
 */
import type { Pool } from "mysql2/promise";
import type { StepDefinition, StepOverride, DomainState } from "./plan-year-checklist.js";

/** The seeded step catalog from control-plane, ordered by display order. */
export async function listStepDefinitions(cp: Pool): Promise<StepDefinition[]> {
  const [rows] = await cp.query(`
    SELECT step_key            AS stepKey,
           label               AS label,
           description         AS description,
           category            AS category,
           display_order       AS displayOrder,
           required_by_default AS requiredByDefault,
           route               AS route
    FROM plan_year_setup_step_definition
    ORDER BY display_order ASC`);
  return (rows as any[]).map((r) => ({
    stepKey: r.stepKey,
    label: r.label,
    description: r.description ?? null,
    category: r.category ?? null,
    displayOrder: Number(r.displayOrder),
    requiredByDefault: Boolean(r.requiredByDefault),
    route: r.route ?? null,
  }));
}

/** Per-plan-year overrides from the customer DB (empty when none configured). */
export async function listStepOverrides(db: Pool, planYearId: string): Promise<StepOverride[]> {
  const [rows] = await db.query(
    `SELECT step_key             AS stepKey,
            override_status      AS overrideStatus,
            is_hidden            AS isHidden,
            is_required_override AS isRequiredOverride,
            notes                AS notes
     FROM plan_year_setup_step_override
     WHERE plan_year_id = UUID_TO_BIN(:planYearId)`,
    { planYearId }
  );
  return (rows as any[]).map((r) => ({
    stepKey: r.stepKey,
    overrideStatus: r.overrideStatus ?? null,
    isHidden: Boolean(r.isHidden),
    isRequiredOverride: r.isRequiredOverride == null ? null : Boolean(r.isRequiredOverride),
    notes: r.notes ?? null,
  }));
}

/**
 * Current domain state for v1 derivation. `planYearId` is scoped to THIS employer's
 * routed DB (the caller already authorized the employer); a planYearId that isn't in
 * this DB yields planYearExists=false and all steps derive to not_started (honest).
 * Census count is employer-wide (the `employee` table is not plan-year partitioned).
 */
export async function planYearSetupState(db: Pool, planYearId: string): Promise<DomainState> {
  const [pyRows] = await db.query(
    `SELECT status FROM plan_year WHERE id = UUID_TO_BIN(:planYearId) LIMIT 1`,
    { planYearId }
  );
  const py = (pyRows as any[])[0];
  const [empRows] = await db.query(`SELECT COUNT(*) AS n FROM employee`);
  const employeeCount = Number((empRows as any[])[0].n);

  // D-2 counts: plans/options/rates scoped to THIS plan year; contribution rules are
  // employer-level (contribution_rule has no plan_year_id).
  const [planRows] = await db.query(
    `SELECT
        COUNT(*) AS planCount,
        SUM(setup_status = 'complete') AS completePlanCount,
        (SELECT COUNT(*) FROM plan_option po JOIN benefit_plan bp2 ON bp2.id = po.benefit_plan_id
           WHERE bp2.plan_year_id = UUID_TO_BIN(:planYearId)) AS optionCount,
        (SELECT COUNT(*) FROM plan_rate pr JOIN benefit_plan bp3 ON bp3.id = pr.benefit_plan_id
           WHERE bp3.plan_year_id = UUID_TO_BIN(:planYearId)) AS rateCount
     FROM benefit_plan bp WHERE bp.plan_year_id = UUID_TO_BIN(:planYearId)`,
    { planYearId }
  );
  const p = (planRows as any[])[0] ?? {};
  const [ruleRows] = await db.query(`SELECT COUNT(*) AS n FROM contribution_rule`);

  // D-3 counts: scoped to the plan year's open-enrollment event(s).
  const [enrRows] = await db.query(
    `SELECT
        (SELECT COUNT(*) FROM enrollment_window w JOIN enrollment_event e ON e.id = w.enrollment_event_id
           WHERE e.plan_year_id = UUID_TO_BIN(:planYearId)) AS windowCount,
        (SELECT COUNT(*) FROM enrollment_invitation i JOIN enrollment_event e ON e.id = i.enrollment_event_id
           WHERE e.plan_year_id = UUID_TO_BIN(:planYearId) AND i.status IN ('sent','opened','completed')) AS invitationSentCount,
        (SELECT COUNT(*) FROM employee_election ee JOIN enrollment_event e ON e.id = ee.enrollment_event_id
           WHERE e.plan_year_id = UUID_TO_BIN(:planYearId) AND ee.status IN ('submitted','approved')) AS submittedElectionCount,
        (SELECT COUNT(*) FROM waiver wv JOIN enrollment_event e ON e.id = wv.enrollment_event_id
           WHERE e.plan_year_id = UUID_TO_BIN(:planYearId)) AS waiverCount`,
    { planYearId }
  );
  const en = (enrRows as any[])[0] ?? {};

  return {
    planYearExists: Boolean(py),
    planYearStatus: py?.status ?? null,
    employeeCount,
    planCount: Number(p.planCount ?? 0),
    completePlanCount: Number(p.completePlanCount ?? 0),
    rateCount: Number(p.rateCount ?? 0),
    contributionRuleCount: Number((ruleRows as any[])[0].n),
    optionCount: Number(p.optionCount ?? 0),
    windowCount: Number(en.windowCount ?? 0),
    invitationSentCount: Number(en.invitationSentCount ?? 0),
    submittedElectionCount: Number(en.submittedElectionCount ?? 0),
    waiverCount: Number(en.waiverCount ?? 0),
  };
}
