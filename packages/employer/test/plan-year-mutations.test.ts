/**
 * Plan-year lifecycle mutation integration tests (Phase D-5; requires local MySQL).
 *   docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves createPlanYear / copyFromPriorYear / activatePlanYear / archivePlanYear
 * enforce the SAME permission x scope x routing as every other resolver, that the
 * renewal copy-forward deep-copies plans/options/rates with the documented
 * semantics (drafts needing review, year-shifted effective dates, source
 * untouched), and that activation keeps a single active year.
 *
 * State discipline: these tests WRITE to Employer A's DB. They only ever create
 * years 2031/2032/2033 (never seeded), clean them up before AND after the run,
 * and restore the seed plan-year statuses (2025 archived / 2026 active) so the
 * read-model suites keep passing in the same process and on re-runs.
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
const TEST_YEARS = [2031, 2032, 2033];

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "plan_year.read", EMP_A);
  return db;
}

/** Remove every plan year these tests create and restore seed statuses. */
async function resetTestState() {
  const db = await dbA();
  // Rates first: fk_rate_option has no ON DELETE action, so the benefit_plan
  // delete's plan_option cascade would be blocked by surviving rate rows.
  await db.query(
    `DELETE pr FROM plan_rate pr
     JOIN benefit_plan bp ON bp.id = pr.benefit_plan_id
     JOIN plan_year py ON py.id = bp.plan_year_id
     WHERE py.year IN (${TEST_YEARS.join(",")})`
  );
  await db.query(
    `DELETE bp FROM benefit_plan bp
     JOIN plan_year py ON py.id = bp.plan_year_id
     WHERE py.year IN (${TEST_YEARS.join(",")})`
  );
  await db.query(`DELETE FROM plan_year WHERE year IN (${TEST_YEARS.join(",")})`);
  await db.query(`UPDATE plan_year SET status = 'archived' WHERE year = 2025`);
  await db.query(`UPDATE plan_year SET status = 'active' WHERE year = 2026`);
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("createPlanYear", () => {
  test("employer admin creates an empty setup year with calendar-year period", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const py = await employerService.createPlanYear(ctx, EMP_A, 2031, "  PY 2031  ");
    expect(py.year).toBe(2031);
    expect(py.label).toBe("PY 2031"); // trimmed
    expect(py.status).toBe("setup");
    expect(py.periodStart).toBe("2031-01-01");
    expect(py.periodEnd).toBe("2031-12-31");
    expect(py.planCount).toBe(0);

    const years = await employerService.listPlanYears(ctx, EMP_A);
    expect(years.some((y) => y.id === py.id)).toBe(true);
  });

  test("duplicate calendar year is a ValidationError", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.createPlanYear(ctx, EMP_A, 2026, "Dup")).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  test("out-of-range year and blank label are ValidationErrors", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.createPlanYear(ctx, EMP_A, 1999, "Old")).rejects.toMatchObject({
      name: "ValidationError",
    });
    expect(employerService.createPlanYear(ctx, EMP_A, 2033, "   ")).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  test("broker (holds plan_year.manage) can create; employee and cross-tenant admin cannot", async () => {
    const broker = await buildAuthContext("sub-broker-a");
    const py = await employerService.createPlanYear(broker, EMP_A, 2033, "PY 2033");
    expect(py.status).toBe("setup");

    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.createPlanYear(employee, EMP_A, 2034, "Nope")).rejects.toMatchObject({
      name: "AuthError",
    });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.createPlanYear(adminB, EMP_A, 2034, "Nope")).rejects.toMatchObject({
      name: "AuthError",
    });
  });
});

describe("copyFromPriorYear (renewal copy-forward)", () => {
  test("deep-copies plans, options, and rates from the source year", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const py = await employerService.copyFromPriorYear(ctx, EMP_A, SEED_PY_2026_ACTIVE, 2032);

    // New year: label derived from the source ("PY 2026" -> "PY 2032"), dates shifted
    // by the 6-year delta, back in setup, with both seed plans copied.
    expect(py.year).toBe(2032);
    expect(py.label).toBe("PY 2032");
    expect(py.status).toBe("setup");
    expect(py.periodStart).toBe("2032-01-01");
    expect(py.periodEnd).toBe("2032-12-31");
    expect(py.planCount).toBe(2);

    // Copied plans land as drafts needing review (renewal semantics) with the
    // eligibility-class option links preserved.
    const catalog = await employerService.planCatalog(ctx, EMP_A, py.id);
    expect(catalog.plans.length).toBe(2);
    const names = catalog.plans.map((p) => p.name).sort();
    expect(names).toEqual(["Guardian Dental PPO", "UHC Choice Plus PPO"]);

    // Raw verification: rate VALUES copied verbatim, effective dates shifted to the
    // new year, and every copied rate's option belongs to the SAME copied plan.
    const db = await dbA();
    const [rates] = await db.query(
      `SELECT bp.plan_name AS planName, pr.rate_ee AS rateEe, pr.rate_family AS rateFamily,
              pr.effective_date AS effectiveDate,
              (po.benefit_plan_id = pr.benefit_plan_id) AS optionSamePlan
       FROM plan_rate pr
       JOIN benefit_plan bp ON bp.id = pr.benefit_plan_id
       LEFT JOIN plan_option po ON po.id = pr.plan_option_id
       WHERE bp.plan_year_id = UUID_TO_BIN(:pyId)
       ORDER BY bp.plan_name`,
      { pyId: py.id }
    );
    const r = rates as any[];
    expect(r.length).toBe(2);
    expect(r.every((x) => x.effectiveDate === "2032-01-01")).toBe(true);
    expect(r.every((x) => Number(x.optionSamePlan) === 1)).toBe(true);
    expect(Number(r.find((x) => x.planName === "UHC Choice Plus PPO").rateEe)).toBe(612);
    expect(Number(r.find((x) => x.planName === "Guardian Dental PPO").rateFamily)).toBe(110);

    // Copied plans are drafts; legacy traceability is NOT copied.
    const [plans] = await db.query(
      `SELECT status, setup_status AS setupStatus, legacy_id AS legacyId
       FROM benefit_plan WHERE plan_year_id = UUID_TO_BIN(:pyId)`,
      { pyId: py.id }
    );
    for (const p of plans as any[]) {
      expect(p.status).toBe("draft");
      expect(p.setupStatus).toBe("in_progress");
      expect(p.legacyId).toBeNull();
    }
  });

  test("source year is untouched by the copy", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const years = await employerService.listPlanYears(ctx, EMP_A);
    const source = years.find((y) => y.id === SEED_PY_2026_ACTIVE)!;
    expect(source.status).toBe("active");
    expect(source.planCount).toBe(2);

    const db = await dbA();
    const [rates] = await db.query(
      `SELECT pr.effective_date AS effectiveDate FROM plan_rate pr
       JOIN benefit_plan bp ON bp.id = pr.benefit_plan_id
       WHERE bp.plan_year_id = UUID_TO_BIN(:pyId)`,
      { pyId: SEED_PY_2026_ACTIVE }
    );
    expect((rates as any[]).every((x) => x.effectiveDate === "2026-01-01")).toBe(true);
  });

  test("existing target year and unknown source are ValidationErrors", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.copyFromPriorYear(ctx, EMP_A, SEED_PY_2026_ACTIVE, 2025)).rejects.toMatchObject({
      name: "ValidationError",
    });
    expect(
      employerService.copyFromPriorYear(ctx, EMP_A, "00000000-0000-0000-0000-000000000000", 2034)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("activatePlanYear / archivePlanYear", () => {
  test("activation enforces the single-active invariant, then the seed year is restored", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const years = await employerService.listPlanYears(ctx, EMP_A);
    const py2031 = years.find((y) => y.year === 2031)!;

    const activated = await employerService.activatePlanYear(ctx, EMP_A, py2031.id);
    expect(activated.status).toBe("active");

    // The previously active seed year (2026) was archived in the same transaction,
    // and the UI-default plan year now resolves to the new active year.
    let after = await employerService.listPlanYears(ctx, EMP_A);
    expect(after.find((y) => y.id === SEED_PY_2026_ACTIVE)!.status).toBe("archived");
    expect(after.filter((y) => y.status === "active").length).toBe(1);
    expect((await employerService.currentPlanYear(ctx, EMP_A))!.id).toBe(py2031.id);

    // Restore: re-activating the seed year archives 2031 (same invariant).
    await employerService.activatePlanYear(ctx, EMP_A, SEED_PY_2026_ACTIVE);
    after = await employerService.listPlanYears(ctx, EMP_A);
    expect(after.find((y) => y.id === SEED_PY_2026_ACTIVE)!.status).toBe("active");
    expect(after.find((y) => y.year === 2031)!.status).toBe("archived");
    expect(after.filter((y) => y.status === "active").length).toBe(1);
  });

  test("archive marks a year archived; unknown ids are ValidationErrors", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const years = await employerService.listPlanYears(ctx, EMP_A);
    const py2032 = years.find((y) => y.year === 2032)!;

    const archived = await employerService.archivePlanYear(ctx, EMP_A, py2032.id);
    expect(archived.status).toBe("archived");

    expect(
      employerService.activatePlanYear(ctx, EMP_A, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(
      employerService.archivePlanYear(ctx, EMP_A, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  test("employee and cross-tenant admin cannot activate or archive", async () => {
    const employee = await buildAuthContext("sub-employee-a");
    expect(employerService.activatePlanYear(employee, EMP_A, SEED_PY_2026_ACTIVE)).rejects.toMatchObject({
      name: "AuthError",
    });
    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.archivePlanYear(adminB, EMP_A, SEED_PY_2026_ACTIVE)).rejects.toMatchObject({
      name: "AuthError",
    });
  });
});
