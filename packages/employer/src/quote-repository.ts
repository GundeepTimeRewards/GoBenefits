/**
 * Quoting repository (Phase F-3). SQL against a ROUTED customer-DB pool only — the
 * service authorizes + routes via getCustomerDb. Reproduces the legacy Step1–5
 * wizard's census-composition proposal: each active employee is tiered from their
 * dependent makeup, then costed per candidate plan via @goben/rate-engine.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { CoverageTier } from "@goben/rate-engine";

export type CensusMember = { employeeId: string; age: number | null; tier: CoverageTier };

/**
 * The active-employee census with each employee's derived coverage tier (legacy
 * Step-2 composition): has spouse + child(ren) → family; spouse only → ee_spouse;
 * child(ren) only → ee_child; none → ee. Domestic partners count as spouse-side.
 * age is derived at the quote's effective date by the caller.
 */
export async function activeCensus(db: Pool, effectiveDate: string): Promise<CensusMember[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(e.id) AS employeeId,
            TIMESTAMPDIFF(YEAR, e.date_of_birth, :effectiveDate) AS age,
            SUM(d.relationship IN ('spouse','domestic_partner')) AS spouses,
            SUM(d.relationship = 'child') AS children
     FROM employee e
     JOIN employee_employment em ON em.employee_id = e.id AND em.status = 'active'
     LEFT JOIN dependent d ON d.employee_id = e.id
     GROUP BY e.id, e.date_of_birth`,
    { effectiveDate }
  );
  return (rows as any[]).map((r) => {
    const spouse = Number(r.spouses) > 0;
    const child = Number(r.children) > 0;
    const tier: CoverageTier = spouse && child ? "family" : spouse ? "ee_spouse" : child ? "ee_child" : "ee";
    return { employeeId: r.employeeId, age: r.age == null ? null : Number(r.age), tier };
  });
}

export type QuotePlanRow = { planId: string; planName: string; benefitTypeKey: string };

/** The requested plans that actually belong to this plan year (ignores stray ids). */
export async function quotablePlans(db: Pool, planYearId: string, planIds: string[]): Promise<QuotePlanRow[]> {
  if (planIds.length === 0) return [];
  const placeholders = planIds.map((_, i) => `UUID_TO_BIN(:p${i})`).join(",");
  const params: Record<string, unknown> = { planYearId };
  planIds.forEach((id, i) => (params[`p${i}`] = id));
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(id) AS planId, plan_name AS planName, benefit_type_key AS benefitTypeKey
     FROM benefit_plan
     WHERE plan_year_id = UUID_TO_BIN(:planYearId) AND id IN (${placeholders})`,
    params as Record<string, string>
  );
  return rows as QuotePlanRow[];
}

export type PersistQuoteLine = {
  planId: string;
  monthlyTotal: number;
  employerCost: number;
  employeeCost: number;
  costedEmployees: number;
};

/** Persist the quote + its lines in one transaction. Returns the new quote id. */
export async function insertQuote(
  db: Pool,
  args: { planYearId: string; createdBy: string; censusCount: number; lines: PersistQuoteLine[] }
): Promise<string> {
  const id = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO quote (id, plan_year_id, created_by, status, census_count)
       VALUES (UUID_TO_BIN(:id), UUID_TO_BIN(:planYearId), UUID_TO_BIN(:createdBy), 'draft', :censusCount)`,
      { id, planYearId: args.planYearId, createdBy: args.createdBy, censusCount: args.censusCount }
    );
    for (const l of args.lines) {
      await conn.query(
        `INSERT INTO quote_line (quote_id, benefit_plan_id, monthly_total, employer_cost, employee_cost, costed_employees)
         VALUES (UUID_TO_BIN(:id), UUID_TO_BIN(:planId), :monthlyTotal, :employerCost, :employeeCost, :costedEmployees)`,
        { id, ...l }
      );
    }
    await conn.commit();
    return id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type QuoteView = {
  id: string;
  planYearId: string;
  createdAt: string;
  lines: { planId: string; benefitTypeKey: string; monthlyTotal: number; employerCost: number; employeeCost: number }[];
};

/** Read back a quote for the GraphQL Quote shape. Null if not in this plan year. */
export async function getQuote(db: Pool, quoteId: string): Promise<QuoteView | null> {
  const [qRows] = await db.query(
    `SELECT BIN_TO_UUID(id) AS id, BIN_TO_UUID(plan_year_id) AS planYearId,
            DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
     FROM quote WHERE id = UUID_TO_BIN(:quoteId) LIMIT 1`,
    { quoteId }
  );
  const q = (qRows as any[])[0];
  if (!q) return null;
  const [lRows] = await db.query(
    `SELECT BIN_TO_UUID(ql.benefit_plan_id) AS planId, bp.benefit_type_key AS benefitTypeKey,
            ql.monthly_total AS monthlyTotal, ql.employer_cost AS employerCost, ql.employee_cost AS employeeCost
     FROM quote_line ql JOIN benefit_plan bp ON bp.id = ql.benefit_plan_id
     WHERE ql.quote_id = UUID_TO_BIN(:quoteId) ORDER BY bp.plan_name`,
    { quoteId }
  );
  return {
    id: q.id,
    planYearId: q.planYearId,
    createdAt: q.createdAt,
    lines: (lRows as any[]).map((r) => ({
      planId: r.planId,
      benefitTypeKey: r.benefitTypeKey,
      monthlyTotal: Number(r.monthlyTotal),
      employerCost: Number(r.employerCost),
      employeeCost: Number(r.employeeCost),
    })),
  };
}
