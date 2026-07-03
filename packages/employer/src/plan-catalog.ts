/**
 * Plans & Rates read models — PURE mapping/derivation (Phase D-2).
 *
 * `planCatalog` and `benefitPlanDetail` are server-computed read models over the
 * benefit_plan / plan_option / plan_rate / contribution_rule / eligibility_class
 * tables. This module is pure (no DB): the repository feeds it rows and it derives
 * config statuses, launch blockers, the tier×rate pivot, the employer/employee split,
 * and the summary counts. Field names/casing mirror the GraphQL SDL (lowercase enum
 * values `medical`/`complete`; the FE mapper display-cases them).
 *
 * Scope note: D-2 only surfaces plans whose benefit type maps to a `CoverageLine`
 * (medical/dental/vision/rx/life/disability/accident/CI/hospital). Spending/retirement
 * account types (hsa/fsa/dcfsa/commuter/retirement) have no CoverageLine and are out of
 * D-2 scope — the fixtures never seed them, so no rows are silently dropped.
 */

/** GraphQL `ConfigStatus`. */
export type ConfigStatus = "complete" | "partial" | "missing";

/** benefit_plan row (routed customer DB), plus its aggregate child counts. */
export type BenefitPlanRow = {
  planId: string;
  planName: string;
  carrierName: string | null;
  benefitTypeKey: string;
  subtype: string | null;
  network: string | null;
  setupStatus: string; // not_started | in_progress | complete | needs_attention
  status: string; // draft | active | inactive
  deductibleSingle: number | null;
  deductibleFamily: number | null;
  oopSingle: number | null;
  oopFamily: number | null;
  pcpCopay: string | null;
  specialistCopay: string | null;
  effective: string | null; // earliest plan_rate effective date, if any
  rateTierCount: number; // distinct tiers with a rate value
  optionCount: number;
  documentCount: number;
  enrolled: number; // employee_election count (0 in D-2 — no elections yet)
  eligibleClasses: string[]; // class names available to this plan (via plan_option)
};

/** contribution_rule row (employer-level; not plan-year partitioned). */
export type ContributionRuleRow = {
  name: string;
  displayName: string | null;
  pctEmployeeHealth: number;
  pctEmployeeDental: number;
  pctEmployeeVision: number;
};

/** plan_rate row (typed tier columns; one row per age band / effective date). */
export type PlanRateRow = {
  rateEe: number;
  rateEeSpouse: number | null;
  rateEeChild: number | null;
  rateFamily: number | null;
  effectiveDate: string;
};

/** eligibility_class row. */
export type EligibilityClassRow = {
  name: string;
  waitingPeriodDays: number | null;
  minHoursWeekly: number | null;
};

/** control-plane benefit_type reference (key → label + CoverageLine). */
export type BenefitTypeRef = { keyName: string; label: string };

// benefit_type key → GraphQL CoverageLine enum (not 1:1: voluntary_life→vol_life,
// hospital_indemnity→hospital). Types without a CoverageLine are omitted (out of D-2 scope).
const COVERAGE_LINE_BY_KEY: Record<string, string> = {
  medical: "medical",
  dental: "dental",
  vision: "vision",
  rx: "rx",
  basic_life: "basic_life",
  voluntary_life: "vol_life",
  std: "std",
  ltd: "ltd",
  accident: "accident",
  critical_illness: "critical_illness",
  hospital_indemnity: "hospital",
};

/** Map a benefit_type key to a CoverageLine, or null when it has none (out of scope). */
export function coverageLineOf(benefitTypeKey: string): string | null {
  return COVERAGE_LINE_BY_KEY[benefitTypeKey] ?? null;
}

const KEY_BY_COVERAGE_LINE: Record<string, string> = Object.fromEntries(
  Object.entries(COVERAGE_LINE_BY_KEY).map(([key, line]) => [line, key])
);

/** Reverse map: CoverageLine enum value → benefit_type key (null for unknown lines). */
export function benefitTypeKeyOf(line: string): string | null {
  return KEY_BY_COVERAGE_LINE[line] ?? null;
}

/** Health lines whose employer/employee split comes from contribution_rule health %. */
const HEALTH_LINES = new Set(["medical", "rx"]);

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

/** Employee % for a line from a contribution rule (dental/vision/health buckets). */
function employeePctFor(line: string, rule: ContributionRuleRow | null): number | null {
  if (!rule) return null;
  if (line === "dental") return rule.pctEmployeeDental;
  if (line === "vision") return rule.pctEmployeeVision;
  if (HEALTH_LINES.has(line)) return rule.pctEmployeeHealth;
  return rule.pctEmployeeHealth; // other lines fall back to the health bucket
}

// --- Catalog ----------------------------------------------------------------

export type CatalogRow = {
  planId: string;
  name: string;
  carrier: string;
  line: string; // CoverageLine
  benefitType: string;
  subtype: string | null;
  status: string;
  effective: string | null;
  enrolled: number;
  coverageTiers: number;
  rateStatus: ConfigStatus;
  contributionStatus: string; // "configured" | "missing"
  contributionRule: string | null;
  documentStatus: ConfigStatus;
  eligibleClasses: string | null;
  launchBlocker: boolean;
  warnings: string[];
};

export type CatalogSummary = {
  total: number;
  ready: number;
  missingRates: number;
  missingContributions: number;
  missingDocuments: number;
  launchBlockers: number;
};

export type PlanCatalog = {
  employerId: string;
  planYearId: string;
  readOnly: boolean;
  summary: CatalogSummary;
  plans: CatalogRow[];
};

const VOLUNTARY_LINES = new Set(["vol_life", "accident", "critical_illness", "hospital", "std", "ltd"]);

/** Derive one catalog row (config statuses, launch blocker, warnings, status label). */
export function deriveCatalogRow(
  plan: BenefitPlanRow,
  line: string,
  benefitLabel: string,
  rule: ContributionRuleRow | null
): CatalogRow {
  const voluntary = VOLUNTARY_LINES.has(line);
  const rateStatus: ConfigStatus = plan.rateTierCount > 0 ? "complete" : "missing";
  const contributionConfigured = voluntary || rule != null;
  const contributionStatus = contributionConfigured ? "configured" : "missing";
  const documentStatus: ConfigStatus = plan.documentCount > 0 ? "complete" : "missing";

  const warnings: string[] = [];
  if (rateStatus === "missing") warnings.push("Rates not loaded");
  if (contributionStatus === "missing") warnings.push("Contributions not configured");
  if (documentStatus === "missing") warnings.push("Plan documents missing");

  // A launch blocker is a REQUIRED gap: missing rates, or (non-voluntary) missing
  // contributions. Missing documents is a warning, not a hard blocker (matches mock).
  const launchBlocker = rateStatus === "missing" || (!voluntary && contributionStatus === "missing");

  let status: string;
  if (rateStatus === "missing") status = "missing_rates";
  else if (!voluntary && contributionStatus === "missing") status = "missing_contributions";
  else if (plan.setupStatus === "complete" && plan.status === "active") status = "ready";
  else if (plan.status === "draft") status = "draft";
  else status = "in_setup";

  return {
    planId: plan.planId,
    name: plan.planName,
    carrier: plan.carrierName ?? "—",
    line,
    benefitType: benefitLabel,
    subtype: plan.subtype,
    status,
    effective: plan.effective,
    enrolled: plan.enrolled,
    coverageTiers: plan.rateTierCount,
    rateStatus,
    contributionStatus,
    contributionRule: contributionConfigured
      ? voluntary
        ? "Employee-paid (100%)"
        : (rule?.displayName ?? rule?.name ?? null)
      : null,
    documentStatus,
    eligibleClasses: plan.eligibleClasses.length ? plan.eligibleClasses.join(", ") : null,
    launchBlocker,
    warnings,
  };
}

/** Assemble the full catalog read model + summary from raw rows. */
export function buildPlanCatalog(
  employerId: string,
  planYearId: string,
  planYearStatus: string | null,
  plans: BenefitPlanRow[],
  benefitTypes: BenefitTypeRef[],
  rule: ContributionRuleRow | null
): PlanCatalog {
  const labelByKey = new Map(benefitTypes.map((b) => [b.keyName, b.label]));
  const rows: CatalogRow[] = [];
  for (const plan of plans) {
    const line = coverageLineOf(plan.benefitTypeKey);
    if (line == null) continue; // no CoverageLine → out of D-2 scope (never seeded)
    rows.push(deriveCatalogRow(plan, line, labelByKey.get(plan.benefitTypeKey) ?? plan.benefitTypeKey, rule));
  }
  const summary: CatalogSummary = {
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    missingRates: rows.filter((r) => r.rateStatus === "missing").length,
    missingContributions: rows.filter((r) => r.contributionStatus === "missing").length,
    missingDocuments: rows.filter((r) => r.documentStatus === "missing").length,
    launchBlockers: rows.filter((r) => r.launchBlocker).length,
  };
  return { employerId, planYearId, readOnly: planYearStatus === "archived", summary, plans: rows };
}

// --- Detail -----------------------------------------------------------------

export type PlanBenefitRow = { label: string; inNetwork: string; outNetwork: string };
export type DetailRateRow = { tier: string; total: string; employer: string; employee: string };
export type DetailContribRow = { tier: string; employer: string; employee: string };
export type DetailEligRow = { class: string; waiting: string; note: string };
export type DetailDocRow = { name: string; type: string; date: string };

export type BenefitPlanDetail = {
  planId: string;
  name: string;
  carrier: string;
  line: string;
  subtype: string | null;
  network: string | null;
  fundingType: string | null;
  effective: string | null;
  renewalDate: string | null;
  enrolled: number;
  status: string;
  benefits: PlanBenefitRow[];
  rates: DetailRateRow[];
  contributions: DetailContribRow[];
  eligibility: DetailEligRow[];
  documents: DetailDocRow[];
};

const TIER_LABELS = {
  ee: "Employee Only",
  eeSpouse: "Employee + Spouse",
  eeChild: "Employee + Child(ren)",
  family: "Family",
} as const;

/** Build the plan-benefit comparison rows from the plan's typed columns. */
function benefitRows(plan: BenefitPlanRow): PlanBenefitRow[] {
  const rows: PlanBenefitRow[] = [];
  const add = (label: string, v: number | string | null) => {
    if (v == null) return;
    rows.push({ label, inNetwork: typeof v === "number" ? fmtMoney(v) : v, outNetwork: "—" });
  };
  add("Deductible (Individual)", plan.deductibleSingle);
  add("Deductible (Family)", plan.deductibleFamily);
  add("Out-of-Pocket Max (Individual)", plan.oopSingle);
  add("Out-of-Pocket Max (Family)", plan.oopFamily);
  add("Primary Care Visit", plan.pcpCopay);
  add("Specialist Visit", plan.specialistCopay);
  return rows;
}

/** Pivot the typed rate columns into per-tier rows, splitting employer/employee via the rule. */
export function detailRates(line: string, rates: PlanRateRow[], rule: ContributionRuleRow | null): DetailRateRow[] {
  if (rates.length === 0) return [];
  // Use the earliest-effective (or first) rate row as the representative tier set.
  const r = [...rates].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0];
  const voluntary = VOLUNTARY_LINES.has(line);
  const eePct = voluntary ? 100 : employeePctFor(line, rule);
  const tiers: Array<{ tier: string; total: number | null }> = [
    { tier: TIER_LABELS.ee, total: r.rateEe },
    { tier: TIER_LABELS.eeSpouse, total: r.rateEeSpouse },
    { tier: TIER_LABELS.eeChild, total: r.rateEeChild },
    { tier: TIER_LABELS.family, total: r.rateFamily },
  ];
  return tiers
    .filter((t) => t.total != null)
    .map((t) => {
      const total = t.total as number;
      if (eePct == null) return { tier: t.tier, total: fmtMoney(total), employer: "—", employee: "—" };
      const employee = Math.round((eePct / 100) * total * 100) / 100;
      const employer = Math.round((total - employee) * 100) / 100;
      return { tier: t.tier, total: fmtMoney(total), employer: fmtMoney(employer), employee: fmtMoney(employee) };
    });
}

/** Contribution split rows (percentages) from the applied rule. */
export function detailContributions(line: string, rule: ContributionRuleRow | null): DetailContribRow[] {
  if (VOLUNTARY_LINES.has(line)) return [{ tier: "All Tiers", employer: "0%", employee: "100%" }];
  const eePct = employeePctFor(line, rule);
  if (eePct == null) return [];
  return [{ tier: "All Tiers", employer: fmtPct(100 - eePct), employee: fmtPct(eePct) }];
}

function waitingLabel(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "Date of hire";
  return `First of month after ${days} days`;
}

/** Build the detail read model from raw rows. */
export function buildPlanDetail(
  plan: BenefitPlanRow,
  line: string,
  rates: PlanRateRow[],
  rule: ContributionRuleRow | null,
  classes: EligibilityClassRow[]
): BenefitPlanDetail {
  return {
    planId: plan.planId,
    name: plan.planName,
    carrier: plan.carrierName ?? "—",
    line,
    subtype: plan.subtype,
    network: plan.network,
    fundingType: null, // no funding column in the schema yet
    effective: plan.effective,
    renewalDate: null,
    enrolled: plan.enrolled,
    status: plan.status,
    benefits: benefitRows(plan),
    rates: detailRates(line, rates, rule),
    contributions: detailContributions(line, rule),
    eligibility: classes.map((c) => ({
      class: c.name,
      waiting: waitingLabel(c.waitingPeriodDays),
      note: c.minHoursWeekly != null ? `${c.minHoursWeekly}+ hours/week` : "—",
    })),
    documents: [], // document library is Phase E — empty (documentStatus derives to missing)
  };
}
