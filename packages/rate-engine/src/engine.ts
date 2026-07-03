/**
 * Golden-master rate & deduction engine (Phase E-2; IMPLEMENTATION_PLAN §4).
 *
 * Pure functions, no I/O — this module is the single place premium/contribution/
 * per-paycheck math lives, ported from the legacy C# RatesRepository rules:
 *
 *   ER share = eeBase × employeePct/100  +  (tierTotal − eeBase) × dependentPct/100
 *   EE share = tierTotal − ER share
 *   per-paycheck = monthly × 12 ÷ paysPerYear (12 / 24 / 26 / 52)
 *
 * Rounding discipline: money is rounded HALF-UP to cents at the OUTPUT boundary
 * only (the employer share), and the employee share is DERIVED as total − employer
 * so `costEe + costEr === costTotal` holds to the cent by construction — the same
 * invariant the deduction tables enforce. Golden-master fixtures from the legacy
 * `payrolldeduction` data are the launch gate for exact parity (migration phase);
 * until those land, the documented rules above are authoritative.
 */

export type CoverageTier = "ee" | "ee_spouse" | "ee_child" | "family";

export type RateBand = {
  rateEe: number;
  rateEeSpouse: number | null;
  rateEeChild: number | null;
  rateFamily: number | null;
};

export type ContributionSplit = {
  /** % of the EMPLOYEE-ONLY base premium the employer pays (0–100). */
  employeePct: number;
  /** % of the dependent premium (tier total − EE base) the employer pays (0–100). */
  dependentPct: number;
};

export type DeductionAmounts = {
  /** Monthly totals. */
  monthlyTotal: number;
  monthlyEr: number;
  monthlyEe: number;
  /** Per-paycheck at the employee's pay frequency. */
  perPayTotal: number;
  perPayEr: number;
  perPayEe: number;
};

/** Round half-up to cents (banker's rounding would drift from the legacy math). */
export function roundCents(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** The monthly premium for a tier, or null when the plan doesn't offer that tier. */
export function tierTotal(rate: RateBand, tier: CoverageTier): number | null {
  switch (tier) {
    case "ee": return rate.rateEe;
    case "ee_spouse": return rate.rateEeSpouse;
    case "ee_child": return rate.rateEeChild;
    case "family": return rate.rateFamily;
  }
}

/** Valid pays-per-year values (employee_payroll.pay_frequency enum). */
export const PAYS_PER_YEAR = [12, 24, 26, 52] as const;

/** Monthly amount → per-paycheck amount at paysPerYear (annualize, then divide). */
export function perPaycheck(monthly: number, paysPerYear: number): number {
  if (!PAYS_PER_YEAR.includes(paysPerYear as (typeof PAYS_PER_YEAR)[number])) {
    throw new RangeError(`paysPerYear must be one of ${PAYS_PER_YEAR.join("/")} (got ${paysPerYear})`);
  }
  return roundCents((monthly * 12) / paysPerYear);
}

function assertPct(name: string, v: number): void {
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new RangeError(`${name} must be 0–100 (got ${v})`);
}

/**
 * Split one election's monthly premium into employer/employee shares and derive
 * per-paycheck amounts. Throws when the plan doesn't offer the tier.
 */
export function computeDeduction(args: {
  rate: RateBand;
  tier: CoverageTier;
  split: ContributionSplit;
  paysPerYear: number;
}): DeductionAmounts {
  assertPct("employeePct", args.split.employeePct);
  assertPct("dependentPct", args.split.dependentPct);
  const total = tierTotal(args.rate, args.tier);
  if (total == null) throw new RangeError(`Plan has no rate for tier "${args.tier}"`);
  const eeBase = args.rate.rateEe;

  const erUnrounded =
    (eeBase * args.split.employeePct) / 100 + ((total - eeBase) * args.split.dependentPct) / 100;
  const monthlyTotal = roundCents(total);
  const monthlyEr = Math.min(roundCents(erUnrounded), monthlyTotal); // never exceed the premium
  const monthlyEe = roundCents(monthlyTotal - monthlyEr);

  const perPayTotal = perPaycheck(monthlyTotal, args.paysPerYear);
  const perPayEr = Math.min(perPaycheck(monthlyEr, args.paysPerYear), perPayTotal);
  const perPayEe = roundCents(perPayTotal - perPayEr); // derived: ee + er == total to the cent

  return { monthlyTotal, monthlyEr, monthlyEe, perPayTotal, perPayEr, perPayEe };
}

/**
 * Resolve the employer contribution split for a benefit line from the employer's
 * contribution rule (explicit-% model). Health % covers medical + rx; dental and
 * vision have their own; every other line (voluntary/life/disability) defaults to
 * 0% employer — voluntary lines are employee-paid unless a future rule adds them.
 */
export function splitForLine(
  benefitTypeKey: string,
  rule: {
    pctEmployeeHealth: number; pctEmployeeDental: number; pctEmployeeVision: number;
    pctDependentHealth: number; pctDependentDental: number; pctDependentVision: number;
  } | null
): ContributionSplit {
  if (!rule) return { employeePct: 0, dependentPct: 0 };
  switch (benefitTypeKey) {
    case "medical":
    case "rx":
      return { employeePct: rule.pctEmployeeHealth, dependentPct: rule.pctDependentHealth };
    case "dental":
      return { employeePct: rule.pctEmployeeDental, dependentPct: rule.pctDependentDental };
    case "vision":
      return { employeePct: rule.pctEmployeeVision, dependentPct: rule.pctDependentVision };
    default:
      return { employeePct: 0, dependentPct: 0 };
  }
}
