/**
 * Plan-comparison repository (Decision Support). SQL against a ROUTED customer-DB
 * pool only — the service authorizes + routes via getCustomerDb. Provides the
 * medical plans + their comparison attributes and the employee's coverage
 * composition; the cost math lives in @goben/rate-engine.
 */
import type { Pool } from "mysql2/promise";
import type { CoverageTier } from "@goben/rate-engine";

export type ComparablePlan = {
  planId: string;
  planName: string;
  carrierName: string | null;
  subtype: string | null; // PPO / HDHP / …
  hsaEligible: boolean;
  deductibleSingle: number | null;
  deductibleFamily: number | null;
  oopSingle: number | null;
  oopFamily: number | null;
};

/** Active medical plans in the plan year with the fields the estimate needs. */
export async function listMedicalPlans(db: Pool, planYearId: string): Promise<ComparablePlan[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(id) AS planId, plan_name AS planName, carrier_name AS carrierName, subtype,
            hsa_eligible AS hsaEligible,
            deductible_single AS deductibleSingle, deductible_family AS deductibleFamily,
            oop_single AS oopSingle, oop_family AS oopFamily
     FROM benefit_plan
     WHERE plan_year_id = UUID_TO_BIN(:planYearId) AND benefit_type_key = 'medical' AND status = 'active'
     ORDER BY plan_name`,
    { planYearId }
  );
  return (rows as any[]).map((r) => ({
    planId: r.planId,
    planName: r.planName,
    carrierName: r.carrierName ?? null,
    subtype: r.subtype ?? null,
    hsaEligible: Boolean(Number(r.hsaEligible)),
    deductibleSingle: r.deductibleSingle == null ? null : Number(r.deductibleSingle),
    deductibleFamily: r.deductibleFamily == null ? null : Number(r.deductibleFamily),
    oopSingle: r.oopSingle == null ? null : Number(r.oopSingle),
    oopFamily: r.oopFamily == null ? null : Number(r.oopFamily),
  }));
}

export type EmployeeCoverage = { employeeId: string; name: string; age: number | null; tier: CoverageTier };

/**
 * One employee's coverage composition for the comparison: their derived tier (from
 * dependents, same rule as census/quoting) and age at the effective date. Null when
 * the employee isn't in this DB.
 */
export async function getEmployeeCoverage(db: Pool, employeeId: string, effectiveDate: string): Promise<EmployeeCoverage | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(e.id) AS employeeId,
            CONCAT(e.first_name, ' ', e.last_name) AS name,
            TIMESTAMPDIFF(YEAR, e.date_of_birth, :effectiveDate) AS age,
            SUM(d.relationship IN ('spouse','domestic_partner')) AS spouses,
            SUM(d.relationship = 'child') AS children
     FROM employee e
     LEFT JOIN dependent d ON d.employee_id = e.id
     WHERE e.id = UUID_TO_BIN(:employeeId)
     GROUP BY e.id, e.first_name, e.last_name, e.date_of_birth`,
    { employeeId, effectiveDate }
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  const spouse = Number(r.spouses) > 0;
  const child = Number(r.children) > 0;
  const tier: CoverageTier = spouse && child ? "family" : spouse ? "ee_spouse" : child ? "ee_child" : "ee";
  return { employeeId: r.employeeId, name: r.name, age: r.age == null ? null : Number(r.age), tier };
}
