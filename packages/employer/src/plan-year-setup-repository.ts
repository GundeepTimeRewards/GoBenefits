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
  return {
    planYearExists: Boolean(py),
    planYearStatus: py?.status ?? null,
    employeeCount,
  };
}
