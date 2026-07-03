/**
 * Employer + plan-year service. Same control as census/dependents: every method
 * authorizes (permission x scope) AND routes to the right customer DB via
 * getCustomerDb(ctx, permission, employerId) BEFORE any DB access. Unknown/disabled
 * user, unauthorized/unknown/archived employer, or a missing permission fails closed
 * inside getCustomerDb — never in the repository.
 */
import { getCustomerDb, controlPlanePool, AuthError, type AuthContext } from "@goben/data-access";
import * as repo from "./plan-year-repository.js";
import * as setupRepo from "./plan-year-setup-repository.js";
import * as catalogRepo from "./plan-catalog-repository.js";
import * as enrollmentRepo from "./enrollment-repository.js";
import { deriveChecklist, type PlanYearSetupStatus } from "./plan-year-checklist.js";
import {
  buildPlanCatalog,
  buildPlanDetail,
  coverageLineOf,
  benefitTypeKeyOf,
  type PlanCatalog,
  type BenefitPlanDetail,
} from "./plan-catalog.js";
import * as planMutRepo from "./plan-mutation-repository.js";
import * as enrollMutRepo from "./enrollment-mutation-repository.js";
import * as reviewRepo from "./election-review-repository.js";
import * as deductionRepo from "./deduction-repository.js";
import {
  deriveDeductionRow,
  deriveChanges,
  deriveSummary,
  fmtMoney,
  type DeductionReviewRow,
  type DeductionChange,
  type DeductionReviewSummary,
} from "./deduction-workspace.js";
import { computeDeduction, splitForLine, type CoverageTier } from "@goben/rate-engine";
import { buildElectionReview, deriveReviewRow, type ElectionReview, type ElectionReviewRow } from "./election-review.js";
import { randomUUID } from "node:crypto";
import {
  buildEnrollmentProgress,
  buildEnrollmentCenter,
  type EnrollmentProgress,
  type EnrollmentCenter,
} from "./enrollment.js";
import { buildEmployerOverview, type EmployerOverview } from "./overview.js";
import { ValidationError } from "./errors.js";
import type { Employer, PlanYear } from "./types.js";

/** All plan years for an employer (top-bar plan-year selector + Plan Years overview). */
export async function listPlanYears(ctx: AuthContext, employerId: string): Promise<PlanYear[]> {
  const { db } = await getCustomerDb(ctx, "plan_year.read", employerId);
  return repo.listPlanYears(db);
}

/**
 * Plan Year Setup checklist (Phase D-1) — a DERIVED aggregate read model. Authorizes +
 * routes exactly like the other plan-year reads (`plan_year.read`, fail-closed inside
 * getCustomerDb), then combines the control-plane step catalog with per-plan-year
 * overrides + current domain state. completionPct/blockers are computed server-side
 * (see deriveChecklist). No new permission is introduced.
 */
export async function planYearSetupStatus(
  ctx: AuthContext,
  employerId: string,
  planYearId: string
): Promise<PlanYearSetupStatus> {
  const { db } = await getCustomerDb(ctx, "plan_year.read", employerId);
  const cp = await controlPlanePool();
  const [defs, overrides, domain] = await Promise.all([
    setupRepo.listStepDefinitions(cp),
    setupRepo.listStepOverrides(db, planYearId),
    setupRepo.planYearSetupState(db, planYearId),
  ]);
  return deriveChecklist(employerId, planYearId, defs, overrides, domain);
}

/** Shared input guard for the plan-year mutations. */
function validateYear(year: number): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new ValidationError(`Plan year must be a 4-digit year between 2000 and 2100 (got ${year})`);
  }
}

/**
 * Create an empty plan year in `setup` (Phase D-5). Authorizes on
 * `plan_year.manage` (employer_admin + broker hold it since 0002), fail-closed
 * inside getCustomerDb. Coverage period defaults to the calendar year — editable
 * later via employer setup; the GraphQL signature intentionally carries only
 * (year, label).
 */
export async function createPlanYear(
  ctx: AuthContext,
  employerId: string,
  year: number,
  label: string
): Promise<PlanYear> {
  const { db } = await getCustomerDb(ctx, "plan_year.manage", employerId);
  validateYear(year);
  const trimmed = label?.trim();
  if (!trimmed) throw new ValidationError("Plan year label is required");
  if (await repo.findPlanYearIdByYear(db, year)) {
    throw new ValidationError(`A plan year for ${year} already exists`);
  }
  const id = await repo.insertPlanYear(db, {
    label: trimmed,
    year,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
  });
  return (await repo.getPlanYearById(db, id))!;
}

/**
 * Renewal copy-forward (Phase D-5): create `toYear` from a prior plan year,
 * deep-copying plans, options, and rates (see copyPlanYearDeep for the renewal
 * semantics — copied plans come back as drafts needing review, rates shift their
 * effective dates by the year delta). The label is derived from the source label
 * with the year swapped (e.g. "PY 2026" → "PY 2027"), falling back to "PY <year>".
 */
export async function copyFromPriorYear(
  ctx: AuthContext,
  employerId: string,
  fromPlanYearId: string,
  toYear: number
): Promise<PlanYear> {
  const { db } = await getCustomerDb(ctx, "plan_year.manage", employerId);
  validateYear(toYear);
  const source = await repo.getPlanYearById(db, fromPlanYearId);
  if (!source) throw new ValidationError("Source plan year not found for this employer");
  if (await repo.findPlanYearIdByYear(db, toYear)) {
    throw new ValidationError(`A plan year for ${toYear} already exists`);
  }
  const label = source.label.includes(String(source.year))
    ? source.label.replaceAll(String(source.year), String(toYear))
    : `PY ${toYear}`;
  const id = await repo.copyPlanYearDeep(db, {
    fromId: fromPlanYearId,
    toYear,
    label,
    yearDelta: toYear - source.year,
  });
  return (await repo.getPlanYearById(db, id))!;
}

/**
 * Activate a plan year (Phase D-5). Enforces the single-active invariant: any other
 * active year is archived in the same transaction.
 */
export async function activatePlanYear(ctx: AuthContext, employerId: string, planYearId: string): Promise<PlanYear> {
  const { db } = await getCustomerDb(ctx, "plan_year.manage", employerId);
  if (!(await repo.getPlanYearById(db, planYearId))) {
    throw new ValidationError("Plan year not found for this employer");
  }
  await repo.setPlanYearActive(db, planYearId);
  return (await repo.getPlanYearById(db, planYearId))!;
}

/** Archive a plan year (Phase D-5). Archived years are read-only in the UI. */
export async function archivePlanYear(ctx: AuthContext, employerId: string, planYearId: string): Promise<PlanYear> {
  const { db } = await getCustomerDb(ctx, "plan_year.manage", employerId);
  if (!(await repo.getPlanYearById(db, planYearId))) {
    throw new ValidationError("Plan year not found for this employer");
  }
  await repo.setPlanYearArchived(db, planYearId);
  return (await repo.getPlanYearById(db, planYearId))!;
}

/** The UI-default plan year for an employer (or null if none exists yet). */
export async function currentPlanYear(ctx: AuthContext, employerId: string): Promise<PlanYear | null> {
  const { db } = await getCustomerDb(ctx, "plan_year.read", employerId);
  return repo.currentPlanYear(db);
}

/**
 * Plans & Rates catalog (Phase D-2) — server-computed aggregate read model over
 * benefit_plan / plan_rate / contribution_rule. Authorizes on `benefit_plan.read`
 * (broker gained this in 0004; employer_admin already had it), fail-closed inside
 * getCustomerDb. benefit_type is control-plane reference data. No mutation, no new
 * permission beyond the approved broker read co-grant.
 */
export async function planCatalog(ctx: AuthContext, employerId: string, planYearId: string): Promise<PlanCatalog> {
  const { db } = await getCustomerDb(ctx, "benefit_plan.read", employerId);
  const cp = await controlPlanePool();
  const [plans, benefitTypes, rule, planYearStatus] = await Promise.all([
    catalogRepo.listCatalogPlans(db, planYearId),
    catalogRepo.listBenefitTypes(cp),
    catalogRepo.getContributionRule(db),
    planYearStatusOf(db, planYearId),
  ]);
  return buildPlanCatalog(employerId, planYearId, planYearStatus, plans, benefitTypes, rule);
}

/**
 * Plan detail (Phase D-2) — one plan's benefits/rates/contributions/eligibility.
 * Same authorization + routing as the catalog. Throws Unauthorized-shaped NotFound if
 * the plan isn't in this employer's plan year, or has a benefit type with no
 * CoverageLine (out of D-2 scope).
 */
export async function benefitPlanDetail(
  ctx: AuthContext,
  employerId: string,
  planYearId: string,
  planId: string
): Promise<BenefitPlanDetail> {
  const { db } = await getCustomerDb(ctx, "benefit_plan.read", employerId);
  const plan = await catalogRepo.getCatalogPlan(db, planYearId, planId);
  if (!plan) throw new AuthError("Plan not found for this employer / plan year");
  const line = coverageLineOf(plan.benefitTypeKey);
  if (line == null) throw new AuthError("Plan type is not supported by Plans & Rates");
  const [rates, rule, classes] = await Promise.all([
    catalogRepo.listPlanRates(db, planId),
    catalogRepo.getContributionRule(db),
    catalogRepo.listEligibilityClasses(db),
  ]);
  return buildPlanDetail(plan, line, rates, rule, classes);
}

/** Shared shape of the ActionResult-returning Plans & Rates mutations. */
export type ActionResult = { ok: boolean; message: string | null; id: string | null };

/**
 * Add a new draft plan to a plan year (Phase D-6). Authorizes on
 * `benefit_plan.manage` (employer_admin co-granted in 0007; broker held it since
 * 0002). Archived plan years are read-only — adding to one is a ValidationError.
 */
export async function addPlan(
  ctx: AuthContext,
  employerId: string,
  planYearId: string,
  line: string,
  planName: string,
  carrierName?: string | null
): Promise<ActionResult> {
  const { db } = await getCustomerDb(ctx, "benefit_plan.manage", employerId);
  const name = planName?.trim();
  if (!name) throw new ValidationError("Plan name is required");
  const benefitTypeKey = benefitTypeKeyOf(line);
  if (!benefitTypeKey) throw new ValidationError(`Unsupported coverage line: ${line}`);
  const pyStatus = await planMutRepo.planYearStatus(db, planYearId);
  if (!pyStatus) throw new ValidationError("Plan year not found for this employer");
  if (pyStatus === "archived") throw new ValidationError("Archived plan years are read-only");
  const id = await planMutRepo.insertPlan(db, {
    planYearId,
    benefitTypeKey,
    planName: name,
    carrierName: carrierName?.trim() || null,
  });
  return { ok: true, message: `Plan "${name}" created as draft`, id };
}

/**
 * Duplicate a plan within its own plan year (Phase D-6): deep copy (options + rates)
 * named "Copy of <name>", landing as a draft needing review. Same authorization as
 * addPlan; duplicating into an archived year is a ValidationError.
 */
export async function duplicatePlan(ctx: AuthContext, employerId: string, planId: string): Promise<ActionResult> {
  const { db } = await getCustomerDb(ctx, "benefit_plan.manage", employerId);
  const plan = await planMutRepo.getPlanMeta(db, planId);
  if (!plan) throw new ValidationError("Plan not found for this employer");
  if (plan.planYearStatus === "archived") throw new ValidationError("Archived plan years are read-only");
  const newName = `Copy of ${plan.planName}`.slice(0, 255);
  const id = await planMutRepo.duplicatePlanDeep(db, planId, newName);
  return { ok: true, message: `Plan duplicated as "${newName}"`, id };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RATE_ROWS = 500;

/**
 * Replace a plan's rate table (Phase D-6). Authorizes on `rate.manage`. The import
 * is the new authoritative table (documented replace semantics — not a merge), all
 * rows at one effective date, plan-level (no option link). Archived years read-only.
 */
export async function importRates(
  ctx: AuthContext,
  employerId: string,
  planId: string,
  input: { effectiveDate: string; rows: planMutRepo.RateBand[] }
): Promise<ActionResult> {
  const { db } = await getCustomerDb(ctx, "rate.manage", employerId);
  const plan = await planMutRepo.getPlanMeta(db, planId);
  if (!plan) throw new ValidationError("Plan not found for this employer");
  if (plan.planYearStatus === "archived") throw new ValidationError("Archived plan years are read-only");
  if (!ISO_DATE.test(input.effectiveDate ?? "")) throw new ValidationError("effectiveDate must be YYYY-MM-DD");
  const rows = input.rows ?? [];
  if (rows.length === 0) throw new ValidationError("At least one rate row is required");
  if (rows.length > MAX_RATE_ROWS) throw new ValidationError(`At most ${MAX_RATE_ROWS} rate rows per import`);
  const seenAges = new Set<string>();
  for (const [i, r] of rows.entries()) {
    if (r.age != null && (!Number.isInteger(r.age) || r.age < 0 || r.age > 120)) {
      throw new ValidationError(`Row ${i + 1}: age must be an integer between 0 and 120`);
    }
    const ageKey = r.age == null ? "composite" : String(r.age);
    if (seenAges.has(ageKey)) {
      throw new ValidationError(`Row ${i + 1}: duplicate ${r.age == null ? "composite row" : `age band ${r.age}`}`);
    }
    seenAges.add(ageKey);
    for (const [tier, v] of [["rateEe", r.rateEe], ["rateEeSpouse", r.rateEeSpouse], ["rateEeChild", r.rateEeChild], ["rateFamily", r.rateFamily]] as const) {
      if (tier === "rateEe" ? typeof v !== "number" || v < 0 : v != null && (typeof v !== "number" || v < 0)) {
        throw new ValidationError(`Row ${i + 1}: ${tier} must be a non-negative number`);
      }
    }
  }
  // Normalize optional tiers to explicit nulls for the named-placeholder insert.
  const bands: planMutRepo.RateBand[] = rows.map((r) => ({
    age: r.age ?? null,
    rateEe: r.rateEe,
    rateEeSpouse: r.rateEeSpouse ?? null,
    rateEeChild: r.rateEeChild ?? null,
    rateFamily: r.rateFamily ?? null,
  }));
  await planMutRepo.replacePlanRates(db, planId, input.effectiveDate, bands);
  return { ok: true, message: `${bands.length} rate row(s) imported (replaced prior table)`, id: planId };
}

/**
 * Upsert the employer-level contribution rule (Phase D-6). Authorizes on
 * `contribution.manage`. Percentages are 0–100 (the explicit-% model from the
 * golden-master rate engine); omitted fields keep their current values.
 */
export async function updateContributionRule(
  ctx: AuthContext,
  employerId: string,
  input: planMutRepo.ContributionRulePatch
): Promise<ActionResult> {
  const { db } = await getCustomerDb(ctx, "contribution.manage", employerId);
  if (input.name !== undefined && !input.name?.trim()) throw new ValidationError("Rule name cannot be blank");
  for (const field of [
    "pctEmployeeHealth", "pctEmployeeDental", "pctEmployeeVision",
    "pctDependentHealth", "pctDependentDental", "pctDependentVision",
  ] as const) {
    const v = input[field];
    if (v !== undefined && (typeof v !== "number" || v < 0 || v > 100)) {
      throw new ValidationError(`${field} must be between 0 and 100`);
    }
  }
  if (input.fixedBasicLife !== undefined && input.fixedBasicLife != null && input.fixedBasicLife < 0) {
    throw new ValidationError("fixedBasicLife must be non-negative");
  }
  const id = await planMutRepo.upsertContributionRule(db, {
    ...input,
    name: input.name?.trim(),
  });
  return { ok: true, message: "Contribution rule updated", id };
}

/**
 * Elections Review read model (Phase E-1) — the HR exception queue. Authorizes on
 * `election.read` (employer_admin, broker, agency all hold it), fail-closed inside
 * getCustomerDb. Rows are per election; issues derive server-side (see
 * election-review.ts); waiver count comes from the dedicated waiver table.
 */
export async function electionReview(ctx: AuthContext, employerId: string, planYearId: string): Promise<ElectionReview> {
  const { db } = await getCustomerDb(ctx, "election.read", employerId);
  // The queue exposes OTHER employees' elections. `election.read` alone also covers
  // employee self-service (own rows, Phase E self resolvers), so the HR queue
  // additionally requires the employee-LIST permission — the same one the seed
  // deliberately withholds from the employee role (see 0002's census note).
  if (!ctx.permissions.has("employee.read")) {
    throw new AuthError("Missing permission: employee.read (election review is an HR/broker surface)");
  }
  const [pyStatus, rows, waivers] = await Promise.all([
    planYearStatusOf(db, planYearId),
    reviewRepo.listReviewRows(db, planYearId),
    reviewRepo.waiverCount(db, planYearId),
  ]);
  return buildElectionReview(employerId, planYearId, pyStatus, rows, waivers);
}

/** Shared guard for the per-election review mutations. */
async function reviewableElection(
  db: import("mysql2/promise").Pool,
  planYearId: string | null,
  electionId: string
): Promise<{ id: string; status: string; reviewFlag: string; planYearId: string }> {
  const el = await reviewRepo.getElectionMeta(db, electionId);
  if (!el || (planYearId != null && el.planYearId !== planYearId)) {
    throw new ValidationError("Election not found for this employer / plan year");
  }
  return el;
}

/**
 * Approve one submitted election (Phase E-1). Authorizes on `election.manage`
 * (employer_admin only — brokers are read-only in the review queue). Blocks while
 * an EOI / dependent-document request is open; a missing cost does NOT block a
 * deliberate single approval (it does block approve-all).
 */
export async function approveElection(
  ctx: AuthContext,
  employerId: string,
  planYearId: string,
  electionId: string
): Promise<ElectionReviewRow> {
  const { db } = await getCustomerDb(ctx, "election.manage", employerId);
  const el = await reviewableElection(db, planYearId, electionId);
  if (el.status !== "submitted") throw new ValidationError("Only submitted elections can be approved");
  if (el.reviewFlag !== "none") {
    throw new ValidationError("Resolve the open EOI / document request before approving");
  }
  await reviewRepo.approveElection(db, electionId);
  return deriveReviewRow((await reviewRepo.getReviewRow(db, planYearId, electionId))!);
}

/** Send an election back to the employee (Phase E-1): clears any open request. */
export async function sendBackElection(
  ctx: AuthContext,
  employerId: string,
  planYearId: string,
  electionId: string,
  note?: string | null
): Promise<ElectionReviewRow> {
  const { db } = await getCustomerDb(ctx, "election.manage", employerId);
  const el = await reviewableElection(db, planYearId, electionId);
  if (el.status !== "submitted") throw new ValidationError("Only submitted elections can be sent back");
  await reviewRepo.sendBackElection(db, electionId, note?.trim() || "Sent back for changes");
  return deriveReviewRow((await reviewRepo.getReviewRow(db, planYearId, electionId))!);
}

/** Flag a submitted election as awaiting EOI (Phase E-1). */
export async function requestEoi(ctx: AuthContext, employerId: string, electionId: string): Promise<ActionResult> {
  const { db } = await getCustomerDb(ctx, "election.manage", employerId);
  const el = await reviewableElection(db, null, electionId);
  if (el.status !== "submitted") throw new ValidationError("Only submitted elections can have EOI requested");
  await reviewRepo.setReviewFlag(db, electionId, "eoi_requested");
  return { ok: true, message: "Evidence of insurability requested", id: electionId };
}

/** Flag a submitted election as awaiting dependent documents (Phase E-1). */
export async function requestDependentDocs(ctx: AuthContext, employerId: string, electionId: string): Promise<ActionResult> {
  const { db } = await getCustomerDb(ctx, "election.manage", employerId);
  const el = await reviewableElection(db, null, electionId);
  if (el.status !== "submitted") throw new ValidationError("Only submitted elections can have documents requested");
  await reviewRepo.setReviewFlag(db, electionId, "docs_requested");
  return { ok: true, message: "Dependent documents requested", id: electionId };
}

/**
 * Bulk-approve every clean submitted election (Phase E-1): no open request AND a
 * computed cost — the bulk path never approves a row a human would hesitate on.
 */
export async function approveAllReadyElections(ctx: AuthContext, employerId: string, planYearId: string): Promise<ActionResult> {
  const { db } = await getCustomerDb(ctx, "election.manage", employerId);
  const pyStatus = await planYearStatusOf(db, planYearId);
  if (!pyStatus) throw new ValidationError("Plan year not found for this employer");
  if (pyStatus === "archived") throw new ValidationError("Archived plan years are read-only");
  const n = await reviewRepo.approveAllReady(db, planYearId);
  return { ok: true, message: `${n} election(s) approved`, id: null };
}

export type ExportBatchView = {
  id: string;
  batchDate: string | null;
  payPeriod: string;
  employees: number;
  totalEe: string;
  totalEr: string;
  status: string;
  file: string | null;
  issues: string | null;
};

export type DeductionsWorkspace = {
  employerId: string;
  planYearId: string;
  readOnly: boolean;
  deductionSummary: DeductionReviewSummary;
  deductionReview: DeductionReviewRow[];
  deductionChanges: DeductionChange[];
  exportBatches: ExportBatchView[];
};

function toBatchView(b: deductionRepo.ExportBatchRow): ExportBatchView {
  return {
    id: b.id,
    batchDate: b.batchDate,
    payPeriod: b.payPeriod,
    employees: b.employees,
    totalEe: fmtMoney(b.totalEe),
    totalEr: fmtMoney(b.totalEr),
    status: b.status === "generated" ? "Generated" : b.status === "approved" ? "Reconciled" : b.status,
    file: b.file,
    issues: b.errorCount > 0 ? `${b.errorCount} error(s)` : null,
  };
}

/**
 * Deductions workspace (Phase E-2b) — the Deductions page read model. Authorizes
 * on `payroll.read`, which after 0008 is EMPLOYER-level only (brokers/agencies are
 * denied, enforcing the recorded product decision). Rows are the current
 * rate-engine deduction set; changes diff against the last export; summary counts
 * are server-computed.
 */
export async function deductionsWorkspace(ctx: AuthContext, employerId: string, planYearId: string): Promise<DeductionsWorkspace> {
  const { db } = await getCustomerDb(ctx, "payroll.read", employerId);
  const [pyStatus, rows, batches] = await Promise.all([
    planYearStatusOf(db, planYearId),
    deductionRepo.listWorkspaceDeductions(db, planYearId),
    deductionRepo.listExportBatches(db, planYearId),
  ]);
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  const monthStart = `${y}-${m}-01`;
  const monthEnd = `${y}-${m}-31`;
  return {
    employerId,
    planYearId,
    readOnly: pyStatus === "archived",
    deductionSummary: deriveSummary(rows, monthStart, monthEnd),
    deductionReview: rows.map(deriveDeductionRow),
    deductionChanges: deriveChanges(rows),
    exportBatches: batches.map(toBatchView),
  };
}

/** Assign a payroll code to one deduction (Phase E-2b). `payroll.manage`. */
export async function mapDeductionCode(
  ctx: AuthContext,
  employerId: string,
  deductionId: string,
  code: string
): Promise<DeductionReviewRow> {
  const { db } = await getCustomerDb(ctx, "payroll.manage", employerId);
  const trimmed = code?.trim();
  if (!trimmed) throw new ValidationError("Payroll code is required");
  if (trimmed.length > 64) throw new ValidationError("Payroll code must be 64 characters or fewer");
  try {
    await deductionRepo.assignDeductionCode(db, deductionId, trimmed);
  } catch (e) {
    if ((e as Error).message === "deduction not found") {
      throw new ValidationError("Deduction not found for this employer");
    }
    throw e;
  }
  // Row lookup needs the plan year; resolve it from the deduction's election event.
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(ev.plan_year_id) AS planYearId
     FROM payroll_deduction pd
     JOIN employee_election el ON el.id = pd.election_id
     JOIN enrollment_event ev ON ev.id = el.enrollment_event_id
     WHERE pd.id = UUID_TO_BIN(:deductionId) LIMIT 1`,
    { deductionId }
  );
  const planYearId = (rows as any[])[0]?.planYearId as string;
  return deriveDeductionRow((await deductionRepo.getWorkspaceDeduction(db, planYearId, deductionId))!);
}

/**
 * Export every ready deduction into a new batch (Phase E-2b). `payroll.export`.
 * Ready = generated by the rate engine, code assigned, not yet exported. The
 * exported rows flip to processed; the JobHandle status reports the batch + count
 * (a zero-line export reports itself — it is a no-op, not an error).
 */
export async function exportReadyDeductions(
  ctx: AuthContext,
  employerId: string,
  planYearId: string
): Promise<{ jobId: string; status: string }> {
  const { db } = await getCustomerDb(ctx, "payroll.export", employerId);
  const pyStatus = await planYearStatusOf(db, planYearId);
  if (!pyStatus) throw new ValidationError("Plan year not found for this employer");
  if (pyStatus === "archived") throw new ValidationError("Archived plan years are read-only");
  const { batchId, lineCount } = await deductionRepo.exportReadyDeductions(db, planYearId, "file");
  if (lineCount === 0) {
    return { jobId: randomUUID(), status: "completed: 0 line(s) exported (no batch created)" };
  }
  return { jobId: batchId, status: `completed: ${lineCount} line(s) exported` };
}

/** Reconcile an export batch (Phase E-2b). `payroll.manage`. generated/sent → approved. */
export async function reconcileBatch(ctx: AuthContext, employerId: string, batchId: string): Promise<ExportBatchView> {
  const { db } = await getCustomerDb(ctx, "payroll.manage", employerId);
  const batch = await deductionRepo.getBatchMeta(db, batchId);
  if (!batch) throw new ValidationError("Export batch not found for this employer");
  if (batch.status === "approved") throw new ValidationError("Batch is already reconciled");
  if (batch.status === "failed") throw new ValidationError("Failed batches cannot be reconciled — re-export instead");
  await deductionRepo.approveBatch(db, batchId);
  const batches = await deductionRepo.listExportBatches(db, batch.planYearId ?? "");
  return toBatchView(batches.find((b) => b.id === batchId)!);
}

/** Age in whole years at a date (nulls → null: composite rates only). */
function ageAt(dateOfBirth: string | null, asOf: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth + "T00:00:00Z");
  const ref = new Date((asOf ?? new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    ref.getUTCMonth() < dob.getUTCMonth() ||
    (ref.getUTCMonth() === dob.getUTCMonth() && ref.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * Generate payroll deductions for a plan year (Phase E-2). Authorizes on
 * `payroll.manage` (employer_admin only — payroll is employer-level per the
 * product decision in IMPLEMENTATION_STATUS). For every APPROVED, non-waived
 * election: resolve the plan's rate band (exact age band when the employee's DOB
 * is known, else composite), split employer/employee via the contribution rule
 * (@goben/rate-engine — the golden-master math), and persist ONE per-paycheck
 * deduction row per election (idempotent replace; the election's cost columns
 * update in the same transaction, which clears the review queue's "missing cost"
 * issue). Pay frequency comes from employee_payroll, defaulting to 26 (bi-weekly).
 * Elections whose plan has no usable rate are SKIPPED and counted — never guessed.
 * Synchronous locally; the JobHandle shape is kept for the prod SQS path.
 */
export async function generatePayrollDeductions(
  ctx: AuthContext,
  employerId: string,
  planYearId: string
): Promise<{ jobId: string; status: string }> {
  const { db } = await getCustomerDb(ctx, "payroll.manage", employerId);
  const pyStatus = await planYearStatusOf(db, planYearId);
  if (!pyStatus) throw new ValidationError("Plan year not found for this employer");
  if (pyStatus === "archived") throw new ValidationError("Archived plan years are read-only");

  const [elections, rule] = await Promise.all([
    deductionRepo.listApprovedElections(db, planYearId),
    deductionRepo.getFullContributionRule(db),
  ]);

  let generated = 0;
  let skipped = 0;
  for (const el of elections) {
    const rate = await deductionRepo.getRateBand(db, el.planId, ageAt(el.dateOfBirth, el.effectiveDate));
    if (!rate) { skipped += 1; continue; }
    let amounts;
    try {
      amounts = computeDeduction({
        rate,
        tier: el.tier as CoverageTier,
        split: splitForLine(el.benefitTypeKey, rule),
        paysPerYear: el.payFrequency ? Number(el.payFrequency) : 26,
      });
    } catch {
      skipped += 1; // plan doesn't offer the elected tier — surfaced via skip count
      continue;
    }
    await deductionRepo.replaceEngineDeduction(db, {
      electionId: el.electionId,
      employeeId: el.employeeId,
      perPayEe: amounts.perPayEe,
      perPayEr: amounts.perPayEr,
      perPayTotal: amounts.perPayTotal,
      effectiveDate: el.effectiveDate,
    });
    generated += 1;
  }
  return {
    jobId: randomUUID(),
    status: `completed: ${generated} deduction(s) generated${skipped ? `, ${skipped} skipped (no usable rate/tier)` : ""}`,
  };
}

const WINDOW_TYPES = new Set(["open_enrollment", "new_hire", "life_event"]);

/** GraphQL EnrollmentWindow shape returned by createEnrollmentWindow. */
export type EnrollmentWindowResult = {
  id: string;
  name: string;
  type: string;
  windowLabel: string | null;
  effectiveRule: string | null;
  employeesAffected: string | null;
  status: string;
  completion: number | null;
  nextAction: string | null;
};

/**
 * Create an enrollment window (Phase D-7). Authorizes on `enrollment.manage`
 * (broker + employer_admin both hold it since 0002). Archived plan years are
 * read-only. For open_enrollment the window attaches to the plan year's existing
 * OE event; other types get a new event.
 */
export async function createEnrollmentWindow(
  ctx: AuthContext,
  employerId: string,
  planYearId: string,
  input: { type: string; name?: string | null; windowStart: string; windowEnd: string; effectiveDate?: string | null }
): Promise<EnrollmentWindowResult> {
  const { db } = await getCustomerDb(ctx, "enrollment.manage", employerId);
  if (!WINDOW_TYPES.has(input.type)) {
    throw new ValidationError(`type must be one of: ${[...WINDOW_TYPES].join(", ")}`);
  }
  for (const [field, v] of [["windowStart", input.windowStart], ["windowEnd", input.windowEnd]] as const) {
    if (!ISO_DATE.test(v ?? "")) throw new ValidationError(`${field} must be YYYY-MM-DD`);
  }
  if (input.effectiveDate != null && !ISO_DATE.test(input.effectiveDate)) {
    throw new ValidationError("effectiveDate must be YYYY-MM-DD");
  }
  if (input.windowStart > input.windowEnd) throw new ValidationError("windowStart must be on or before windowEnd");
  const pyStatus = await planMutRepo.planYearStatus(db, planYearId);
  if (!pyStatus) throw new ValidationError("Plan year not found for this employer");
  if (pyStatus === "archived") throw new ValidationError("Archived plan years are read-only");

  const typeLabel =
    input.type === "open_enrollment" ? "Open Enrollment" : input.type === "new_hire" ? "New Hire" : "Life Event";
  const name = input.name?.trim() || typeLabel;
  const { windowId } = await enrollMutRepo.createWindow(db, {
    planYearId,
    type: input.type,
    name,
    effectiveDate: input.effectiveDate ?? input.windowStart,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });

  const today = new Date().toISOString().slice(0, 10);
  const status = input.windowEnd < today ? "Closed" : input.windowStart > today ? "Scheduled" : "Open";
  return {
    id: windowId,
    name,
    type: typeLabel,
    windowLabel: `${input.windowStart} – ${input.windowEnd}`,
    effectiveRule: null,
    employeesAffected: null,
    status,
    completion: null,
    nextAction: status === "Scheduled" ? "Opens automatically on the start date" : null,
  };
}

/**
 * Launch open enrollment (Phase D-7). Authorizes on `enrollment.manage`. Gates:
 * the plan year is not archived, the setup checklist has ZERO launch blockers
 * (server-authoritative — same derivation the readiness UI shows), and an OPEN
 * open-enrollment window exists (create one via createEnrollmentWindow first).
 * Launching invites every not-yet-invited employee (idempotent — relaunching only
 * fills gaps) and returns the refreshed Enrollment Center aggregate. Prod email
 * delivery (SES via EventBridge) hangs off the invitation rows; local scope stops
 * at the rows.
 */
export async function launchEnrollment(ctx: AuthContext, employerId: string, planYearId: string): Promise<EnrollmentCenter> {
  const { db } = await getCustomerDb(ctx, "enrollment.manage", employerId);
  const pyStatus = await planMutRepo.planYearStatus(db, planYearId);
  if (!pyStatus) throw new ValidationError("Plan year not found for this employer");
  if (pyStatus === "archived") throw new ValidationError("Archived plan years are read-only");

  const cp = await controlPlanePool();
  const [defs, overrides, domain] = await Promise.all([
    setupRepo.listStepDefinitions(cp),
    setupRepo.listStepOverrides(db, planYearId),
    setupRepo.planYearSetupState(db, planYearId),
  ]);
  const checklist = deriveChecklist(employerId, planYearId, defs, overrides, domain);
  if (checklist.blockers > 0) {
    throw new ValidationError(
      `Cannot launch: ${checklist.blockers} launch blocker(s) in the setup checklist — resolve them first`
    );
  }

  const event = await enrollmentRepo.getOeEvent(db, planYearId);
  if (!event) throw new ValidationError("Create an open-enrollment window first");
  if (!(await enrollMutRepo.hasOpenWindow(db, event.eventId))) {
    throw new ValidationError("The open-enrollment window has closed — create a new window first");
  }

  await enrollMutRepo.inviteAllEmployees(db, event.eventId);
  return enrollmentCenter(ctx, employerId, planYearId);
}

/**
 * Send enrollment reminders (Phase D-7). Authorizes on `enrollment.manage`.
 * audience: all (default) | not_started | in_progress; submitted employees are
 * never reminded. Synchronous locally (bumps invitation reminder counts + marks
 * sent); the prod path fans out to SES via SQS — hence the JobHandle shape, kept
 * so the contract doesn't change when delivery goes async.
 */
export async function sendEnrollmentReminders(
  ctx: AuthContext,
  employerId: string,
  planYearId: string,
  audience?: string | null
): Promise<{ jobId: string; status: string }> {
  const { db } = await getCustomerDb(ctx, "enrollment.manage", employerId);
  const aud = audience ?? "all";
  if (!["all", "not_started", "in_progress"].includes(aud)) {
    throw new ValidationError("audience must be all, not_started, or in_progress");
  }
  const event = await enrollmentRepo.getOeEvent(db, planYearId);
  if (!event) throw new ValidationError("No open-enrollment event for this plan year");
  const count = await enrollMutRepo.sendReminders(db, event.eventId, aud as enrollMutRepo.ReminderAudience);
  return { jobId: randomUUID(), status: `completed: ${count} reminder(s) sent` };
}

/** Plan-year status for the routed customer DB (small helper; null if not found). */
async function planYearStatusOf(db: import("mysql2/promise").Pool, planYearId: string): Promise<string | null> {
  const [rows] = await db.query(`SELECT status FROM plan_year WHERE id = UUID_TO_BIN(:planYearId) LIMIT 1`, { planYearId });
  return (rows as any[])[0]?.status ?? null;
}

async function planYearLabelStatus(db: import("mysql2/promise").Pool, planYearId: string): Promise<{ label: string | null; status: string | null }> {
  const [rows] = await db.query(`SELECT label, status FROM plan_year WHERE id = UUID_TO_BIN(:planYearId) LIMIT 1`, { planYearId });
  const r = (rows as any[])[0];
  return { label: r?.label ?? null, status: r?.status ?? null };
}

/**
 * Employer Overview rollup (Phase D-4) — a compact dashboard read model that COMPOSES the
 * D-1 checklist, D-2 catalog, and D-3 enrollment counts. Authorizes on `employer.read`
 * (both broker and employer_admin already hold it — no new grant), fail-closed inside
 * getCustomerDb. Read-only; aggregate counts only (no row-level data). Reuses the existing
 * repositories rather than re-deriving.
 */
export async function employerOverview(ctx: AuthContext, employerId: string, planYearId: string): Promise<EmployerOverview> {
  const { db } = await getCustomerDb(ctx, "employer.read", employerId);
  const cp = await controlPlanePool();
  const event = await enrollmentRepo.getOeEvent(db, planYearId);
  const [py, defs, overrides, domain, catalogPlans, benefitTypes, rule, { counts }] = await Promise.all([
    planYearLabelStatus(db, planYearId),
    setupRepo.listStepDefinitions(cp),
    setupRepo.listStepOverrides(db, planYearId),
    setupRepo.planYearSetupState(db, planYearId),
    catalogRepo.listCatalogPlans(db, planYearId),
    catalogRepo.listBenefitTypes(cp),
    catalogRepo.getContributionRule(db),
    enrollmentRepo.getEnrollmentCounts(db, cp, planYearId, event),
  ]);
  const checklist = deriveChecklist(employerId, planYearId, defs, overrides, domain);
  const catalog = buildPlanCatalog(employerId, planYearId, py.status, catalogPlans, benefitTypes, rule);
  return buildEmployerOverview({
    employerId, planYearId,
    planYearLabel: py.label, planYearStatus: py.status,
    checklist, catalogPlans: catalog.plans, counts,
  });
}

/**
 * Enrollment Progress (Phase D-3) — server-computed live progress for the plan year's
 * open-enrollment event. Authorizes on `enrollment.read` (broker gained this in 0005;
 * employer_admin already had it), fail-closed inside getCustomerDb. Read-only.
 */
export async function enrollmentProgress(ctx: AuthContext, employerId: string, planYearId: string): Promise<EnrollmentProgress> {
  const { db } = await getCustomerDb(ctx, "enrollment.read", employerId);
  const cp = await controlPlanePool();
  const event = await enrollmentRepo.getOeEvent(db, planYearId);
  const { counts } = await enrollmentRepo.getEnrollmentCounts(db, cp, planYearId, event);
  return buildEnrollmentProgress(employerId, planYearId, counts);
}

/**
 * Enrollment Center (Phase D-3) — the aggregate: launchState + launchReadiness (reuses
 * the D-1 checklist) + openEnrollmentSummary + windows + ongoingWork. Same authorization
 * (`enrollment.read`) and routing. Backend-ready in D-3; its FE consolidation is D-3b.
 */
export async function enrollmentCenter(ctx: AuthContext, employerId: string, planYearId: string): Promise<EnrollmentCenter> {
  const { db } = await getCustomerDb(ctx, "enrollment.read", employerId);
  const cp = await controlPlanePool();
  const event = await enrollmentRepo.getOeEvent(db, planYearId);
  const [{ counts }, defs, overrides, domain] = await Promise.all([
    enrollmentRepo.getEnrollmentCounts(db, cp, planYearId, event),
    setupRepo.listStepDefinitions(cp),
    setupRepo.listStepOverrides(db, planYearId),
    setupRepo.planYearSetupState(db, planYearId),
  ]);
  const checklist = deriveChecklist(employerId, planYearId, defs, overrides, domain);
  return buildEnrollmentCenter(employerId, planYearId, event?.eventId ?? null, counts, checklist);
}

/**
 * Employer detail read model. Registry fields come from the control-plane row that
 * getCustomerDb already resolved+authorized; per-tenant fields (counts, current plan
 * year, ein) come from the employer's OWN DB — a single routed read, not a fan-out.
 */
export async function getEmployer(ctx: AuthContext, employerId: string): Promise<Employer> {
  const { db, employer } = await getCustomerDb(ctx, "employer.read", employerId);
  const stats = await repo.employerTenantStats(db);
  const current = await repo.currentPlanYear(db);
  return {
    employerId: employer.id,
    name: employer.legalName,
    legalName: employer.legalName,
    ein: stats.ein,
    // industry / renewalMonth / agency+broker display names are not sourced in C1
    // (nullable in the contract); populated when the org read model lands.
    industry: null,
    employeeCount: stats.employeeCount,
    activeCount: stats.activeCount,
    locations: stats.locations,
    renewalMonth: null,
    agency: null,
    broker: null,
    currentPlanYearId: current?.id ?? null,
    currentPlanYearLabel: current?.label ?? null,
    status: employer.status,
  };
}
