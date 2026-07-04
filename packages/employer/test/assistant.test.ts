/**
 * AI benefits assistant integration tests (requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the assistant is GROUNDED: the employee's real coverage facts (tier + every
 * priced medical plan + the decision-support recommendation) are assembled and handed
 * to the LLM as the only material it may use. The LLM is a FakeLlmClient, so these
 * tests are deterministic and never hit Bedrock — they assert on exactly what the
 * service sent (fake.lastRequest) and that auth + own-records hold.
 *
 * State discipline: a distinct AST-TEST HDHP plan (+ rate) is created and removed;
 * nothing else is mutated. Uses a different plan id than plan-comparison.test.ts so the
 * two suites never collide.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, getCustomerDb } from "@goben/data-access";
import { FakeLlmClient } from "@goben/llm";
import { employerService } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const PY_2026 = "a2220000-0000-0000-0000-000000000002";
const AARON = "a1110000-0000-0000-0000-000000000002"; // no dependents → ee tier; linked to sub-employee-a
const ALICE = "a1110000-0000-0000-0000-000000000001"; // one child → ee_child tier
const HDHP = "cddd0000-0000-0000-0000-0000000000e1";
const HDHP_RATE = "cddd0000-0000-0000-0000-0000000000e2";

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "benefit_plan.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN('${HDHP}')`);
  await db.query(`DELETE FROM benefit_plan WHERE id = UUID_TO_BIN('${HDHP}')`);
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
  const db = await dbA();
  await db.query(
    `INSERT INTO benefit_plan (id, plan_year_id, benefit_type_key, carrier_name, plan_name, plan_code, subtype,
        hsa_eligible, deductible_single, deductible_family, oop_single, oop_family, status)
     VALUES (UUID_TO_BIN('${HDHP}'), UUID_TO_BIN('${PY_2026}'), 'medical', 'Aetna', 'AST-TEST Aetna HDHP', 'AST-HDHP', 'HDHP',
        1, 4000.00, 8000.00, 7000.00, 14000.00, 'active')`
  );
  await db.query(
    `INSERT INTO plan_rate (id, benefit_plan_id, plan_option_id, age, rate_ee, rate_ee_spouse, rate_ee_child, rate_family, effective_date)
     VALUES (UUID_TO_BIN('${HDHP_RATE}'), UUID_TO_BIN('${HDHP}'), NULL, NULL, 250.00, 520.00, 470.00, 740.00, '2026-01-01')`
  );
});

afterAll(async () => {
  await resetTestState();
});

/** A fake that quotes the recommended plan back — proving the service passed it in. */
function groundedFake() {
  return new FakeLlmClient((req) => {
    const rec = /Lowest estimated total cost: ([^,\n]+)/.exec(req.messages[0]?.content ?? "")?.[1] ?? "no plan";
    return `Based on your options, ${rec} has the lowest estimated total cost for you.`;
  });
}

describe("askBenefitsAssistant — grounding", () => {
  test("grounds the LLM on the employee's real tier, every priced plan, and the recommendation", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const fake = groundedFake();
    const res = await employerService.askBenefitsAssistant(ctx, EMP_A, PY_2026, AARON, "Which plan is cheapest for me?", "medium", fake);

    // System prompt carries the anti-hallucination contract.
    const sys = fake.lastRequest!.system;
    expect(sys).toContain("ONLY");
    expect(sys).toContain("HR team");

    // User message carries the real grounding facts.
    const msg = fake.lastRequest!.messages[0].content;
    expect(msg).toContain("CONTEXT:");
    expect(msg).toContain("Coverage tier: employee only"); // Aaron = ee
    expect(msg).toContain("UHC Choice Plus PPO");
    expect(msg).toContain("AST-TEST Aetna HDHP");
    expect(msg).toMatch(/deductible \$[\d,]+/);
    expect(msg).toMatch(/estimated total cost \$[\d,]+\/yr/);
    expect(msg).toContain("QUESTION: Which plan is cheapest for me?");

    // Answer is the LLM's text; metadata reflects the grounding set.
    expect(res.usedPlanCount).toBe(2);
    expect(res.coverageTier).toBe("ee");
    expect(res.disclaimer).toContain("medical, legal, or tax advice");
    expect(res.suggestedQuestions.length).toBeGreaterThan(0);
    // The recommendation reached the model (lowest-cost plan quoted back).
    expect(res.answer).toMatch(/UHC Choice Plus PPO|AST-TEST Aetna HDHP/);
  });

  test("usage feeds the estimate context (assumed usage echoed to the model)", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const fake = groundedFake();
    await employerService.askBenefitsAssistant(ctx, EMP_A, PY_2026, AARON, "How much for a big surgery year?", "high", fake);
    expect(fake.lastRequest!.messages[0].content).toContain("Assumed care usage for the cost estimates: high");
  });
});

describe("askBenefitsAssistant — own-records + auth", () => {
  test("an employee gets THEIR OWN context regardless of the employeeId passed", async () => {
    const employee = await buildAuthContext("sub-employee-a"); // linked to Aaron (ee)
    const fake = groundedFake();
    // Pass ALICE's id — must NOT leak her ee_child/family pricing.
    const res = await employerService.askBenefitsAssistant(employee, EMP_A, PY_2026, ALICE, "What's my deductible?", "medium", fake);
    expect(res.coverageTier).toBe("ee"); // Aaron's, not Alice's ee_child
    expect(fake.lastRequest!.messages[0].content).toContain("Coverage tier: employee only");
    expect(fake.lastRequest!.messages[0].content).not.toContain("employee + child");
  });

  test("cross-tenant admin is denied before any LLM call", async () => {
    const adminB = await buildAuthContext("sub-emp-admin-b");
    const fake = groundedFake();
    await expect(
      employerService.askBenefitsAssistant(adminB, EMP_A, PY_2026, AARON, "hi", "medium", fake)
    ).rejects.toMatchObject({ name: "AuthError" });
    expect(fake.calls).toBe(0); // fail-closed: never reached the model
  });
});

describe("askBenefitsAssistant — input guards (no LLM call on bad input)", () => {
  test("empty question is a ValidationError and never calls the LLM", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const fake = new FakeLlmClient(() => {
      throw new Error("LLM must not be called on invalid input");
    });
    await expect(
      employerService.askBenefitsAssistant(ctx, EMP_A, PY_2026, AARON, "   ", "medium", fake)
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(fake.calls).toBe(0);
  });

  test("an over-long question is rejected", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const fake = groundedFake();
    const huge = "a".repeat(600);
    await expect(
      employerService.askBenefitsAssistant(ctx, EMP_A, PY_2026, AARON, huge, "medium", fake)
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(fake.calls).toBe(0);
  });
});
