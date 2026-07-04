/**
 * Pure grounding/prompt tests (no DB, no network). Locks the anti-hallucination
 * directives and the exact facts the LLM is grounded on.
 */
import { test, expect, describe } from "bun:test";
import {
  renderSystemPrompt,
  renderContextBlock,
  renderUserMessage,
  describeTier,
  usd,
  MAX_QUESTION_CHARS,
  type AssistantContext,
} from "../src/assistant/prompt";

const CTX: AssistantContext = {
  employeeName: "Aaron Adams",
  planYearLabel: "2026 Benefits",
  coverageTier: "ee",
  usage: "medium",
  plans: [
    { planName: "UHC Value Network", carrier: "UHC", subtype: "HMO", hsaEligible: false, monthlyPremium: 300, annualPremium: 3600, deductible: 4500, outOfPocketMax: 8000, estimatedAnnualCost: 7380, recommended: true },
    { planName: "DS-TEST Aetna HDHP", carrier: "Aetna", subtype: "HDHP", hsaEligible: true, monthlyPremium: 150, annualPremium: 1800, deductible: 4000, outOfPocketMax: 7000, estimatedAnnualCost: 8426, recommended: false },
  ],
  recommendedPlanName: "UHC Value Network",
  annualSavings: 1046,
};

describe("system prompt", () => {
  test("carries the grounding + anti-hallucination directives", () => {
    const s = renderSystemPrompt();
    expect(s).toContain("ONLY");
    expect(s).toContain("CONTEXT");
    expect(s).toContain("HR team");
    expect(s.toLowerCase()).toContain("never invent");
    expect(s.toLowerCase()).toContain("not give medical, legal, or tax advice");
  });
});

describe("context block", () => {
  test("includes tier, usage, every plan with real figures, and the recommendation", () => {
    const block = renderContextBlock(CTX);
    expect(block).toContain("Coverage tier: employee only");
    expect(block).toContain("Assumed care usage for the cost estimates: medium");
    expect(block).toContain("UHC Value Network (HMO), UHC");
    expect(block).toContain("premium $300/mo ($3,600/yr)");
    expect(block).toContain("deductible $4,500");
    expect(block).toContain("estimated total cost $7,380/yr");
    expect(block).toContain("HSA-eligible");
    expect(block).toContain("lowest estimated total cost for this employee");
    expect(block).toContain("Lowest estimated total cost: UHC Value Network, about $1,046/yr less");
  });

  test("empty plan set says so plainly (nothing to hallucinate)", () => {
    const block = renderContextBlock({ ...CTX, plans: [], recommendedPlanName: null, annualSavings: null });
    expect(block).toContain("none with rates are available");
    expect(block).not.toContain("Medical plans available (");
  });

  test("null deductible/OOP render as 'not specified', never a fake number", () => {
    const block = renderContextBlock({
      ...CTX,
      plans: [{ ...CTX.plans[0], deductible: null, outOfPocketMax: null }],
      recommendedPlanName: null,
      annualSavings: null,
    });
    expect(block).toContain("deductible not specified");
    expect(block).toContain("out-of-pocket max not specified");
  });
});

describe("user message", () => {
  test("embeds the CONTEXT block and the verbatim question", () => {
    const msg = renderUserMessage(CTX, "Which plan is cheapest for me?");
    expect(msg.startsWith("CONTEXT:\n")).toBe(true);
    expect(msg).toContain("QUESTION: Which plan is cheapest for me?");
  });
});

describe("helpers", () => {
  test("describeTier maps known tiers, passes through unknown", () => {
    expect(describeTier("family")).toBe("family");
    expect(describeTier("ee_spouse")).toBe("employee + spouse");
    expect(describeTier("weird")).toBe("weird");
  });
  test("usd rounds and formats; null is explicit", () => {
    expect(usd(1234.56)).toBe("$1,235");
    expect(usd(null)).toBe("not specified");
    expect(usd(0)).toBe("$0");
  });
  test("MAX_QUESTION_CHARS is a sane guard", () => {
    expect(MAX_QUESTION_CHARS).toBeGreaterThanOrEqual(200);
  });
});
