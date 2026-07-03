/**
 * Employer Overview rollup — PURE composition (Phase D-4).
 *
 * `employerOverview` is a compact dashboard read model that COMPOSES the aggregates
 * D-1/D-2/D-3 already compute (checklist readiness, plan catalog, enrollment counts) —
 * it introduces no new data source. This module is pure (no DB): the service feeds it
 * the plan year, the derived checklist, the catalog plans, and the enrollment counts.
 *
 * `needsAttention` surfaces ONLY checklist blockers/warnings + plan launch blockers in
 * D-4 (documents/compliance/payroll/carrier attention items are later phases) — honest,
 * not faked. Field names mirror the GraphQL `EmployerOverview` / `AttentionItem` SDL.
 */
import type { PlanYearSetupStatus } from "./plan-year-checklist.js";
import type { CatalogRow } from "./plan-catalog.js";
import type { EnrollmentCounts } from "./enrollment.js";

/** GraphQL `AttentionItem` (Severity = high | medium | low). */
export type AttentionItem = { key: string; title: string; severity: string; route: string | null };

/** GraphQL `EmployerOverview`. */
export type EmployerOverview = {
  employerId: string;
  planYearId: string;
  planYearLabel: string;
  planYearStatus: string;
  eligibleEmployees: number;
  enrolled: number | null;
  waived: number | null;
  benefitPlans: number | null;
  setupReadinessPct: number | null;
  enrollmentPct: number | null;
  launchBlockers: number | null;
  needsAttention: AttentionItem[];
};

/** The inputs the service gathers (all from already-live aggregates). */
export type OverviewInputs = {
  employerId: string;
  planYearId: string;
  planYearLabel: string | null;
  planYearStatus: string | null;
  checklist: PlanYearSetupStatus;
  catalogPlans: CatalogRow[];
  counts: EnrollmentCounts;
};

const SEVERITY_BY_STATUS: Record<string, string> = { blocked: "high", needs_attention: "medium" };

/**
 * needsAttention: checklist blocked/needs_attention steps (severity high/medium) + any
 * plan flagged as a launch blocker (D-2). Route points at the step/plans screen.
 */
export function deriveNeedsAttention(checklist: PlanYearSetupStatus, catalogPlans: CatalogRow[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const s of checklist.steps) {
    const severity = SEVERITY_BY_STATUS[s.status];
    if (!severity) continue; // only blocked / needs_attention surface as attention
    items.push({ key: s.key, title: s.message ? `${s.label}: ${s.message}` : s.label, severity, route: s.route });
  }
  for (const p of catalogPlans) {
    if (!p.launchBlocker) continue;
    items.push({ key: `plan:${p.planId}`, title: `${p.name} — ${p.warnings[0] ?? "setup incomplete"}`, severity: "high", route: "benefit-plans" });
  }
  return items;
}

/** Assemble the overview read model from the composed inputs. */
export function buildEmployerOverview(i: OverviewInputs): EmployerOverview {
  const eligible = i.counts.eligible;
  const enrolled = i.counts.submittedEmployees;
  const enrollmentPct = eligible > 0 ? Math.round((100 * enrolled) / eligible) : 0;
  return {
    employerId: i.employerId,
    planYearId: i.planYearId,
    planYearLabel: i.planYearLabel ?? "",
    planYearStatus: i.planYearStatus ?? "setup",
    eligibleEmployees: eligible,
    enrolled,
    waived: i.counts.waivedCount,
    benefitPlans: i.catalogPlans.length,
    setupReadinessPct: i.checklist.completionPct,
    enrollmentPct,
    launchBlockers: i.checklist.blockers,
    needsAttention: deriveNeedsAttention(i.checklist, i.catalogPlans),
  };
}
