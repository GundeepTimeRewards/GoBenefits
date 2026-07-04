/**
 * Decision-support estimator (pure, no I/O) — the total-cost-of-care model behind
 * the enrollment plan comparison. Deliberately simple and TRANSPARENT (every number
 * is explainable to an employee) rather than actuarial:
 *
 *   member out-of-pocket = min( deductible + coinsurance × (billed − deductible),
 *                               out-of-pocket max )
 *   estimated annual cost = annual employee premium + member out-of-pocket
 *
 * `billed` (expected in-network care for the year) comes from a usage bucket, not a
 * claims model. Coinsurance defaults to 20% (the typical PPO share after deductible)
 * because plans don't carry a coinsurance field yet. The whole model is one place so
 * the ranking and the UI copy can never disagree, and it can be swapped for a richer
 * one later without touching callers.
 */
import { roundCents } from "./engine.js";

export type UsageLevel = "low" | "medium" | "high";

/** Expected annual IN-NETWORK billed care by usage bucket (representative, editable). */
export const BILLED_CARE_BY_USAGE: Record<UsageLevel, number> = {
  low: 1_000, // a couple of visits + a prescription
  medium: 6_000, // a chronic condition / a minor procedure
  high: 25_000, // surgery / hospitalization / a serious diagnosis
};

/** Default post-deductible coinsurance (member share) until the OOP max is reached. */
export const DEFAULT_COINSURANCE = 0.2;

/**
 * Member out-of-pocket for a year of `billed` in-network care under a plan with the
 * given deductible + OOP max. Missing deductible → treated as 0 (first dollar);
 * missing OOP max → uncapped. Never exceeds the billed amount (you can't pay more
 * out of pocket than was billed) nor the OOP max.
 */
export function estimateMemberOutOfPocket(args: {
  billed: number;
  deductible: number | null;
  outOfPocketMax: number | null;
  coinsurance?: number;
}): number {
  const billed = Math.max(0, args.billed);
  const deductible = Math.max(0, args.deductible ?? 0);
  const coins = args.coinsurance ?? DEFAULT_COINSURANCE;
  const belowDeductible = Math.min(billed, deductible);
  const afterDeductible = Math.max(0, billed - deductible);
  let oop = belowDeductible + coins * afterDeductible;
  oop = Math.min(oop, billed); // can't pay more OOP than was billed
  if (args.outOfPocketMax != null) oop = Math.min(oop, args.outOfPocketMax);
  return roundCents(oop);
}

export type PlanCostEstimate = {
  annualPremium: number; // employee share, 12 × monthly
  estimatedCareCost: number; // member out-of-pocket for the usage level
  estimatedAnnualCost: number; // premium + care
};

/**
 * Total estimated annual cost for one plan at one usage level: the employee's annual
 * premium share plus their expected out-of-pocket. `deductible`/`outOfPocketMax`
 * should already be the tier-appropriate figures (single vs family — the caller
 * picks based on coverage tier).
 */
export function estimateAnnualPlanCost(args: {
  monthlyEmployeePremium: number;
  usage: UsageLevel;
  deductible: number | null;
  outOfPocketMax: number | null;
  coinsurance?: number;
}): PlanCostEstimate {
  const annualPremium = roundCents(args.monthlyEmployeePremium * 12);
  const estimatedCareCost = estimateMemberOutOfPocket({
    billed: BILLED_CARE_BY_USAGE[args.usage],
    deductible: args.deductible,
    outOfPocketMax: args.outOfPocketMax,
    coinsurance: args.coinsurance,
  });
  return { annualPremium, estimatedCareCost, estimatedAnnualCost: roundCents(annualPremium + estimatedCareCost) };
}
