/**
 * Plans & Rates mutation integration tests (Phase D-6; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves addPlan / duplicatePlan / importRates / updateContributionRule enforce the
 * SAME permission x scope x routing as every other resolver, that duplicatePlan
 * deep-copies options + rates within the plan year, that importRates REPLACES the
 * rate table (documented semantics), and that archived plan years stay read-only.
 *
 * State discipline: writes go to Employer A's DB only. Created plans are named with
 * a "D6TEST" marker and removed before AND after the run; the seed contribution
 * rule's values are restored exactly (see local/seed-cust-employer-a.sql).
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, getCustomerDb } from "@goben/data-access";
import { employerService } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const SEED_PY_2026_ACTIVE = "a2220000-0000-0000-0000-000000000002";
const SEED_PY_2025_ARCHIVED = "a2220000-0000-0000-0000-000000000001";
const SEED_MEDICAL_PLAN = "c3330000-0000-0000-0000-000000000001"; // UHC Choice Plus PPO (1 option, 1 rate)

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "benefit_plan.read", EMP_A);
  return db;
}

/** Delete every plan these tests created (D6TEST marker or "Copy of" seed names). */
async function resetTestState() {
  const db = await dbA();
  const where = `plan_name LIKE 'D6TEST%' OR plan_name LIKE 'Copy of UHC Choice Plus PPO%'`;
  await db.query(
    `DELETE pr FROM plan_rate pr JOIN benefit_plan bp ON bp.id = pr.benefit_plan_id WHERE ${where}`
  );
  await db.query(`DELETE FROM benefit_plan WHERE ${where}`);
  // Restore the seed contribution rule exactly (values from seed-cust-employer-a.sql).
  await db.query(
    `UPDATE contribution_rule SET
       pct_employee_health = 20.00, pct_employee_dental = 25.00, pct_employee_vision = 30.00,
       pct_dependent_health = 50.00, pct_dependent_dental = 50.00, pct_dependent_vision = 50.00`
  );
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("addPlan", () => {
  test("employer admin adds a draft plan that appears in the catalog", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.addPlan(ctx, EMP_A, SEED_PY_2026_ACTIVE, "vision", "D6TEST Vision Plan", "VSP");
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();

    const catalog = await employerService.planCatalog(ctx, EMP_A, SEED_PY_2026_ACTIVE);
    const row = catalog.plans.find((p) => p.planId === res.id)!;
    expect(row.name).toBe("D6TEST Vision Plan");
    expect(row.carrier).toBe("VSP");
    expect(row.line).toBe("vision");
    // Draft with no rates/documents yet — must surface as needing setup, not ready.
    expect(row.rateStatus).toBe("missing");
  });

  test("blank name, unknown line, unknown/archived plan year are ValidationErrors", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.addPlan(ctx, EMP_A, SEED_PY_2026_ACTIVE, "vision", "  ")).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.addPlan(ctx, EMP_A, SEED_PY_2026_ACTIVE, "pet_insurance", "D6TEST Pet")).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.addPlan(ctx, EMP_A, "00000000-0000-0000-0000-000000000000", "vision", "D6TEST X")).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.addPlan(ctx, EMP_A, SEED_PY_2025_ARCHIVED, "vision", "D6TEST Archived")).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("duplicatePlan", () => {
  test("deep-copies the plan with options and rates inside its plan year", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.duplicatePlan(ctx, EMP_A, SEED_MEDICAL_PLAN);
    expect(res.ok).toBe(true);
    expect(res.message).toContain("Copy of UHC Choice Plus PPO");

    const db = await dbA();
    const [copies] = await db.query(
      `SELECT BIN_TO_UUID(bp.id) AS id, bp.status AS status, bp.setup_status AS setupStatus,
              bp.legacy_id AS legacyId, bp.deductible_single AS dedSingle,
              BIN_TO_UUID(bp.plan_year_id) AS planYearId,
              (SELECT COUNT(*) FROM plan_option po WHERE po.benefit_plan_id = bp.id) AS optionCount,
              (SELECT COUNT(*) FROM plan_rate pr WHERE pr.benefit_plan_id = bp.id) AS rateCount
       FROM benefit_plan bp WHERE bp.id = UUID_TO_BIN(:id)`,
      { id: res.id }
    );
    const copy = (copies as any[])[0];
    expect(copy.planYearId).toBe(SEED_PY_2026_ACTIVE); // same year, not a new one
    expect(copy.status).toBe("draft");
    expect(copy.setupStatus).toBe("in_progress");
    expect(copy.legacyId).toBeNull();
    expect(Number(copy.dedSingle)).toBe(1500); // comparison attrs copied verbatim
    expect(Number(copy.optionCount)).toBe(1);
    expect(Number(copy.rateCount)).toBe(1);

    // Source plan untouched.
    const [src] = await db.query(
      `SELECT status, (SELECT COUNT(*) FROM plan_rate pr WHERE pr.benefit_plan_id = bp.id) AS rateCount
       FROM benefit_plan bp WHERE bp.id = UUID_TO_BIN(:id)`,
      { id: SEED_MEDICAL_PLAN }
    );
    expect((src as any[])[0].status).toBe("active");
    expect(Number((src as any[])[0].rateCount)).toBe(1);
  });

  test("unknown plan is a ValidationError", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.duplicatePlan(ctx, EMP_A, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});

describe("importRates", () => {
  test("replaces the plan's entire rate table with age-banded rows", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    // Import onto a duplicated plan so seed rates stay pristine.
    const dup = await employerService.duplicatePlan(ctx, EMP_A, SEED_MEDICAL_PLAN);
    const planId = dup.id!;

    const res = await employerService.importRates(ctx, EMP_A, planId, {
      effectiveDate: "2026-07-01",
      rows: [
        { age: 25, rateEe: 300.5, rateEeSpouse: 650, rateEeChild: 580, rateFamily: 940 },
        { age: 35, rateEe: 380.25, rateEeSpouse: 790, rateEeChild: 700, rateFamily: 1120 },
        { age: 45, rateEe: 495, rateEeSpouse: null, rateEeChild: null, rateFamily: null },
      ],
    });
    expect(res.ok).toBe(true);

    const db = await dbA();
    const [rates] = await db.query(
      `SELECT age, rate_ee AS rateEe, rate_family AS rateFamily, effective_date AS effectiveDate,
              plan_option_id AS optionId
       FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN(:planId) ORDER BY age`,
      { planId }
    );
    const r = rates as any[];
    expect(r.length).toBe(3); // REPLACED (prior copied rate is gone), not merged
    expect(r.map((x) => x.age)).toEqual([25, 35, 45]);
    expect(Number(r[0].rateEe)).toBe(300.5);
    expect(r[2].rateFamily).toBeNull();
    expect(r.every((x) => x.effectiveDate === "2026-07-01")).toBe(true);
    expect(r.every((x) => x.optionId === null)).toBe(true);
  });

  test("empty rows, negative rate, bad age, duplicate band, bad date are ValidationErrors", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const bad = (input: any) =>
      expect(employerService.importRates(ctx, EMP_A, SEED_MEDICAL_PLAN, input)).rejects.toMatchObject({
        name: "ValidationError",
      });
    await bad({ effectiveDate: "2026-07-01", rows: [] });
    await bad({ effectiveDate: "2026-07-01", rows: [{ age: 25, rateEe: -1 }] });
    await bad({ effectiveDate: "2026-07-01", rows: [{ age: 300, rateEe: 100 }] });
    await bad({ effectiveDate: "2026-07-01", rows: [{ age: 25, rateEe: 100 }, { age: 25, rateEe: 110 }] });
    await bad({ effectiveDate: "July 1", rows: [{ age: 25, rateEe: 100 }] });
    // Seed plan's rate table untouched by all the rejected imports.
    const db = await dbA();
    const [rates] = await db.query(
      `SELECT COUNT(*) AS n FROM plan_rate WHERE benefit_plan_id = UUID_TO_BIN(:id)`,
      { id: SEED_MEDICAL_PLAN }
    );
    expect(Number((rates as any[])[0].n)).toBe(1);
  });
});

describe("updateContributionRule", () => {
  test("patches only the provided fields on the employer-level rule", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const res = await employerService.updateContributionRule(ctx, EMP_A, {
      pctEmployeeHealth: 75,
      pctDependentHealth: 40,
    });
    expect(res.ok).toBe(true);

    const db = await dbA();
    const [rows] = await db.query(
      `SELECT pct_employee_health AS h, pct_employee_dental AS d, pct_dependent_health AS dh
       FROM contribution_rule ORDER BY name LIMIT 1`
    );
    const r = (rows as any[])[0];
    expect(Number(r.h)).toBe(75); // changed
    expect(Number(r.dh)).toBe(40); // changed
    expect(Number(r.d)).toBe(25); // untouched (seed value)
  });

  test("out-of-range percentage and blank name are ValidationErrors", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.updateContributionRule(ctx, EMP_A, { pctEmployeeHealth: 101 })).rejects.toMatchObject({
      name: "ValidationError",
    });
    expect(employerService.updateContributionRule(ctx, EMP_A, { pctEmployeeVision: -5 })).rejects.toMatchObject({
      name: "ValidationError",
    });
    expect(employerService.updateContributionRule(ctx, EMP_A, { name: "  " })).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});

describe("authorization", () => {
  test("broker (manage grants since 0002) can add; employee and cross-tenant admin cannot", async () => {
    const broker = await buildAuthContext("sub-broker-a");
    const res = await employerService.addPlan(broker, EMP_A, SEED_PY_2026_ACTIVE, "dental", "D6TEST Broker Dental");
    expect(res.ok).toBe(true);

    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.addPlan(employee, EMP_A, SEED_PY_2026_ACTIVE, "dental", "D6TEST Nope")).rejects.toMatchObject({ name: "AuthError" });
    expect(employerService.importRates(employee, EMP_A, SEED_MEDICAL_PLAN, { effectiveDate: "2026-07-01", rows: [{ age: null, rateEe: 1 }] })).rejects.toMatchObject({ name: "AuthError" });
    expect(employerService.updateContributionRule(employee, EMP_A, { pctEmployeeHealth: 1 })).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.addPlan(adminB, EMP_A, SEED_PY_2026_ACTIVE, "dental", "D6TEST Nope")).rejects.toMatchObject({ name: "AuthError" });
    expect(employerService.duplicatePlan(adminB, EMP_A, SEED_MEDICAL_PLAN)).rejects.toMatchObject({ name: "AuthError" });
  });
});
