/**
 * Benefits-assistant grounding — PURE (no DB, no network, fully unit-testable). This
 * is the anti-hallucination core: the service assembles the employee's real coverage
 * facts into an AssistantContext, and these functions render the exact system prompt +
 * grounded user message the LLM sees. Answers are constrained to the CONTEXT block, so
 * the assistant can only speak to plans/costs that actually exist for this employee.
 *
 * The context is structural (not imported from service.ts) to keep this module free of
 * any dependency cycle and trivially testable.
 */

/** Max question length — a guard against prompt abuse / runaway cost. */
export const MAX_QUESTION_CHARS = 500;

export const ASSISTANT_DISCLAIMER =
  "This assistant explains your options using your own plan data and cost estimates — it isn't medical, legal, or tax advice, and the estimates are a guide, not a guarantee. For a decision or anything not covered here, check with your HR team.";

/** Starter prompts surfaced in the UI to guide the employee. */
export const SUGGESTED_QUESTIONS: readonly string[] = [
  "Which plan costs me the least overall?",
  "What's the deductible on the recommended plan?",
  "Which plans are HSA-eligible?",
  "How much would I pay per paycheck?",
] as const;

export type AssistantPlan = {
  planName: string;
  carrier: string | null;
  subtype: string | null;
  hsaEligible: boolean;
  monthlyPremium: number;
  annualPremium: number;
  deductible: number | null;
  outOfPocketMax: number | null;
  estimatedAnnualCost: number;
  recommended: boolean;
};

export type AssistantContext = {
  employeeName: string;
  planYearLabel: string;
  coverageTier: string;
  usage: string;
  plans: AssistantPlan[];
  recommendedPlanName: string | null;
  annualSavings: number | null;
};

const TIER_LABEL: Record<string, string> = {
  ee: "employee only",
  ee_spouse: "employee + spouse",
  ee_child: "employee + child(ren)",
  family: "family",
  waived: "waived (no coverage)",
};

export function describeTier(tier: string): string {
  return TIER_LABEL[tier] ?? tier;
}

/** Whole-dollar formatting; em dash for unknowns so the model doesn't invent a number. */
export function usd(n: number | null | undefined): string {
  return n == null ? "not specified" : `$${Math.round(n).toLocaleString("en-US")}`;
}

/** The stable rules the assistant always follows. Grounding data is NOT here — it goes
 *  in the user message so the model treats it as the material to answer from. */
export function renderSystemPrompt(): string {
  return [
    "You are the GoBenefits benefits assistant, helping ONE employee understand their own health-benefit options during open enrollment.",
    "Answer ONLY using the facts in the CONTEXT block of the user's message. The context lists this specific employee's coverage tier and every medical plan available to them, with real premiums, deductibles, and cost estimates.",
    "If the answer is not in the context, say you don't have that detail and suggest they check with their HR team. Never guess, never invent numbers, and never rely on outside knowledge about specific plans or providers.",
    "Be concise and plain-spoken — a few sentences. Quote dollar figures from the context, and when you cite a total cost, note that it's an estimate for the assumed usage level.",
    "Do not give medical, legal, or tax advice, and never tell the employee which plan they must choose. You may explain trade-offs and note which plan the estimate ranks as lowest total cost for them.",
  ].join(" ");
}

/** The grounding facts, rendered as a compact, model-legible block. */
export function renderContextBlock(ctx: AssistantContext): string {
  const lines: string[] = [];
  lines.push(`Employee: ${ctx.employeeName}`);
  lines.push(`Plan year: ${ctx.planYearLabel}`);
  lines.push(`Coverage tier: ${describeTier(ctx.coverageTier)}`);
  lines.push(`Assumed care usage for the cost estimates: ${ctx.usage}`);

  if (ctx.plans.length === 0) {
    lines.push("Medical plans: none with rates are available to compare for this employee.");
    return lines.join("\n");
  }

  lines.push(`Medical plans available (${ctx.plans.length}):`);
  for (const p of ctx.plans) {
    const head = `- ${p.planName}${p.subtype ? ` (${p.subtype})` : ""}${p.carrier ? `, ${p.carrier}` : ""}`;
    const facts = [
      `premium ${usd(p.monthlyPremium)}/mo (${usd(p.annualPremium)}/yr)`,
      `deductible ${usd(p.deductible)}`,
      `out-of-pocket max ${usd(p.outOfPocketMax)}`,
      p.hsaEligible ? "HSA-eligible" : "not HSA-eligible",
      `estimated total cost ${usd(p.estimatedAnnualCost)}/yr`,
      p.recommended ? "lowest estimated total cost for this employee" : "",
    ].filter(Boolean);
    lines.push(`${head}: ${facts.join("; ")}`);
  }

  if (ctx.recommendedPlanName) {
    const savings =
      ctx.annualSavings && ctx.annualSavings > 0
        ? `, about ${usd(ctx.annualSavings)}/yr less than the most expensive option`
        : "";
    lines.push(`Lowest estimated total cost: ${ctx.recommendedPlanName}${savings}.`);
  }
  return lines.join("\n");
}

/** The full user turn: grounding block + the employee's question. */
export function renderUserMessage(ctx: AssistantContext, question: string): string {
  return `CONTEXT:\n${renderContextBlock(ctx)}\n\nQUESTION: ${question}`;
}
