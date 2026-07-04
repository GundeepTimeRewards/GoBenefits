// Operations query hooks. Deductions workspace is live (Phase E-2c); payroll data /
// carrier export batches remain mock until their phases land.
import { useQuery } from "@tanstack/react-query";
import { getPayroll, getCarrierExports, getPayrollWorkspace } from "@/lib/mock/db";
import { resolvePlanYearScopedSource } from "./dataSource";
import { graphqlClient } from "./client";
import { operations, runOperation } from "./operations";
import { mapDeductionsWorkspace, mapPayrollDataWorkspace, type LiveDeductionsWorkspace, type DeductionsWorkspaceView } from "./liveMappers";

export function usePayrollDeductions(employerId: string) {
  return useQuery({ queryKey: ["payroll", employerId], queryFn: () => getPayroll(employerId) });
}

export function usePayrollWorkspace(employerId: string, planYearId: string) {
  return useQuery({ queryKey: ["payrollWorkspace", employerId, planYearId], queryFn: () => getPayrollWorkspace(employerId, planYearId) });
}

export function useCarrierExports(employerId: string) {
  return useQuery({ queryKey: ["carrierExports", employerId], queryFn: () => getCarrierExports(employerId) });
}

/**
 * Deductions workspace (Phase E-2c) — the §10.5 hook split: the Deductions page
 * reads ONLY the deduction slice. Live when employer + plan year are live UUIDs;
 * mock falls back to the shared getPayrollWorkspace getter's deduction fields.
 */
export function useDeductionsWorkspace(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("deductionsWorkspace", employerId, planYearId) === "live";
  return useQuery<DeductionsWorkspaceView>({
    queryKey: ["deductionsWorkspace", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.deductionsWorkspace, { employerId, planYearId })) as {
            deductionsWorkspace: LiveDeductionsWorkspace;
          };
          return mapDeductionsWorkspace(r.deductionsWorkspace);
        }
      : () => {
          const ws = getPayrollWorkspace(employerId, planYearId);
          return {
            readOnly: ws.readOnly,
            deductionSummary: ws.deductionSummary,
            deductionReview: ws.deductionReview,
            deductionChanges: ws.deductionChanges,
            exportBatches: ws.exportBatches,
          };
        },
  });
}

/**
 * Payroll Data workspace (FE-polish; §10.5 hook split). Live when employer + plan year
 * are live UUIDs; otherwise the shared getPayrollWorkspace getter's fields.
 */
export function usePayrollDataWorkspace(employerId: string, planYearId: string) {
  const live = resolvePlanYearScopedSource("payrollDataWorkspace", employerId, planYearId) === "live";
  return useQuery({
    queryKey: ["payrollDataWorkspace", live ? "live" : "mock", employerId, planYearId],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.payrollDataWorkspace, { employerId, planYearId })) as {
            payrollDataWorkspace: Parameters<typeof mapPayrollDataWorkspace>[0];
          };
          return mapPayrollDataWorkspace(r.payrollDataWorkspace);
        }
      : () => {
          const ws = getPayrollWorkspace(employerId, planYearId);
          return { readOnly: ws.readOnly, connection: ws.connection, importSummary: ws.importSummary, readiness: ws.readiness, aca: ws.aca, payPeriods: ws.payPeriods, employeeRecords: ws.employeeRecords, settings: ws.settings };
        },
  });
}

// --- Decision Support: plan comparison (enrollment) -------------------------------
import { myComparePlans } from "@/lib/employee-self-mock";

export type PlanComparisonRowView = {
  planId: string; planName: string; carrier: string | null; subtype: string | null; hsaEligible: boolean;
  monthlyPremium: number; annualPremium: number; deductible: number | null; outOfPocketMax: number | null;
  estimatedCareCost: number; estimatedAnnualCost: number; recommended: boolean;
};
export type PlanComparisonView = {
  coverageTier: string; usage: string; recommendedPlanId: string | null; annualSavings: number | null;
  note: string | null; plans: PlanComparisonRowView[];
};

const BILLED = { low: 1000, medium: 6000, high: 25000 } as const;
const money = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

/** Client-side mirror of the estimator for the mock (demo) comparison. */
function mockComparison(usage: "low" | "medium" | "high"): PlanComparisonView {
  const billed = BILLED[usage];
  const rows = myComparePlans.map((p) => {
    const annualPremium = Math.round(p.perPay * 26 * 100) / 100; // biweekly → annual
    const ded = money(p.deductible.split("/")[0]);
    const oop = money(p.oop.split("/")[0]);
    const care = Math.min(Math.min(billed, ded) + 0.2 * Math.max(0, billed - ded), billed, oop || Infinity);
    const total = Math.round((annualPremium + care) * 100) / 100;
    return {
      planId: p.id, planName: p.name, carrier: "UnitedHealthcare", subtype: p.network, hsaEligible: p.hsa,
      monthlyPremium: Math.round((p.perPay * 26 / 12) * 100) / 100, annualPremium,
      deductible: ded, outOfPocketMax: oop, estimatedCareCost: Math.round(care * 100) / 100,
      estimatedAnnualCost: total, recommended: false,
    };
  }).sort((a, b) => a.estimatedAnnualCost - b.estimatedAnnualCost);
  if (rows[0]) rows[0].recommended = true;
  const savings = rows.length > 1 ? Math.round((rows[rows.length - 1].estimatedAnnualCost - rows[0].estimatedAnnualCost) * 100) / 100 : 0;
  return {
    coverageTier: "ee", usage, recommendedPlanId: rows[0]?.planId ?? null, annualSavings: savings,
    note: rows[0] ? `Based on ${usage} expected usage, ${rows[0].planName} has the lowest estimated total annual cost.` : null,
    plans: rows,
  };
}

/**
 * Plan comparison + recommendation (Decision Support). Live when employer + plan year
 * are live UUIDs and an employeeId is given; otherwise a representative mock comparison
 * so the enrollment card always renders (the backend is the source of truth live).
 */
export function usePlanComparison(employerId: string, planYearId: string, employeeId: string | null, usage: "low" | "medium" | "high") {
  const live = !!employeeId && resolvePlanYearScopedSource("planComparison", employerId, planYearId) === "live";
  return useQuery<PlanComparisonView>({
    queryKey: ["planComparison", live ? "live" : "mock", employerId, planYearId, employeeId, usage],
    queryFn: live
      ? async () => {
          const r = (await runOperation(graphqlClient, operations.planComparison, { employerId, planYearId, employeeId: employeeId!, usage })) as {
            planComparison: PlanComparisonView;
          };
          return r.planComparison;
        }
      : () => mockComparison(usage),
  });
}

// --- AI benefits assistant (Decision Support) --------------------------------
export type AssistantAnswerView = {
  answer: string;
  disclaimer: string;
  suggestedQuestions: string[];
  usedPlanCount: number;
  coverageTier: string;
};

const ASSISTANT_DISCLAIMER =
  "This assistant explains your options using your own plan data and cost estimates — it isn't medical, legal, or tax advice, and the estimates are a guide, not a guarantee. For a decision or anything not covered here, check with your HR team.";
const ASSISTANT_SUGGESTED = [
  "Which plan costs me the least overall?",
  "What's the deductible on the recommended plan?",
  "Which plans are HSA-eligible?",
  "How much would I pay per paycheck?",
];

const usdMock = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Grounded MOCK answerer for the demo (employee shell is mock-context). It answers off
 * the SAME mock comparison the enrollment card shows — simple keyword routing over real
 * mock numbers — so the panel is demoable without an LLM. Live mode calls the backend
 * (askBenefitsAssistant), which grounds a real model on the employee's actual data.
 */
function mockAssistantAnswer(question: string, usage: "low" | "medium" | "high"): AssistantAnswerView {
  const cmp = mockComparison(usage);
  const plans = cmp.plans;
  const rec = plans.find((p) => p.recommended) ?? plans[0];
  const q = question.toLowerCase();
  let answer: string;

  if (!plans.length) {
    answer = "I don't see any medical plans with rates to compare yet. Your HR team can confirm what's available for you.";
  } else if (/hsa/.test(q)) {
    const hsa = plans.filter((p) => p.hsaEligible).map((p) => p.planName);
    answer = hsa.length
      ? `${hsa.join(" and ")} ${hsa.length > 1 ? "are" : "is"} HSA-eligible — you can pair ${hsa.length > 1 ? "them" : "it"} with a tax-advantaged health savings account.`
      : "None of your available medical plans are HSA-eligible.";
  } else if (/deductible/.test(q)) {
    answer = `Deductibles for your options: ${plans.map((p) => `${p.planName} ${usdMock(p.deductible ?? 0)}`).join(", ")}. The recommended ${rec.planName} has a ${usdMock(rec.deductible ?? 0)} deductible (estimate).`;
  } else if (/month|paycheck|premium|per pay|pay ?check/.test(q)) {
    answer = `Estimated premiums: ${plans.map((p) => `${p.planName} ${usdMock(p.monthlyPremium)}/mo`).join(", ")}. These are your share before any out-of-pocket costs.`;
  } else if (/cheap|least|lowest|best|recommend|save|which plan/.test(q)) {
    answer = `For ${usage} expected usage, ${rec.planName} has the lowest estimated total cost at about ${usdMock(rec.estimatedAnnualCost)}/yr${cmp.annualSavings ? `, roughly ${usdMock(cmp.annualSavings)}/yr less than the most expensive option` : ""}. That's an estimate for the assumed usage level.`;
  } else {
    answer = `Here's a quick read on your ${plans.length} medical option${plans.length > 1 ? "s" : ""} at ${usage} expected usage: ${plans
      .map((p) => `${p.planName} ~${usdMock(p.estimatedAnnualCost)}/yr total`)
      .join(", ")}. ${rec ? `${rec.planName} is the lowest estimated total cost.` : ""} Ask me about deductibles, premiums, or HSA eligibility.`;
  }

  return { answer, disclaimer: ASSISTANT_DISCLAIMER, suggestedQuestions: ASSISTANT_SUGGESTED, usedPlanCount: plans.length, coverageTier: cmp.coverageTier };
}

/**
 * Ask the benefits assistant. Live (askBenefitsAssistant) when employer + plan year are
 * live UUIDs and an employeeId is present; otherwise a grounded mock answer so the panel
 * is always demoable. Returns a plain async callback — the page owns chat state.
 */
export function useBenefitsAssistant(employerId: string, planYearId: string, employeeId: string | null) {
  const live = !!employeeId && resolvePlanYearScopedSource("askBenefitsAssistant", employerId, planYearId) === "live";
  return {
    live,
    async ask(question: string, usage: "low" | "medium" | "high"): Promise<AssistantAnswerView> {
      if (live) {
        const r = (await runOperation(graphqlClient, operations.askBenefitsAssistant, {
          employerId,
          planYearId,
          employeeId,
          question,
          usage,
        })) as { askBenefitsAssistant: AssistantAnswerView };
        return r.askBenefitsAssistant;
      }
      return mockAssistantAnswer(question, usage);
    },
  };
}
