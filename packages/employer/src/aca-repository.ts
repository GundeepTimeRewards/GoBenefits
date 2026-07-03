/**
 * ACA compliance repository (Phase F-2). SQL against a ROUTED customer-DB pool
 * only — the service authorizes + routes via getCustomerDb.
 *
 * Scope decisions (2026-07-03): NO e-filing (form status stops at `generated`;
 * `filed` rows only arrive via the legacy migration — the archive-retrieval path)
 * and historical 1095s are read from those migrated rows, never regenerated.
 */
import type { Pool } from "mysql2/promise";

/**
 * Monthly full-time / FTE counts for a calendar year, computed from imported
 * payroll hours (§4980H(c)(2): FT = 130+ hours of service in the month; FTE adds
 * part-time hours capped at 120 per employee, divided by 120). Upserts
 * ale_monthly_snapshot for months that have import data and returns them.
 */
export async function calculateAleMonths(db: Pool, year: number): Promise<{ months: number; avgTotal: number; isAle: boolean }> {
  // Group hours per employee per month first, THEN aggregate the month — a direct
  // join across batches sharing a month would over-count employees.
  const [monthRows] = await db.query(
    `SELECT mm AS m,
            SUM(hours >= 130) AS fullTime,
            SUM(CASE WHEN hours < 130 THEN LEAST(hours, 120) ELSE 0 END) AS ptHours
     FROM (
       SELECT r.employee_id, MONTH(b.period_end) AS mm, SUM(r.hours) AS hours
       FROM payroll_import_row r
       JOIN payroll_import_batch b ON b.id = r.batch_id
       WHERE r.employee_id IS NOT NULL AND YEAR(b.period_end) = :year
       GROUP BY r.employee_id, MONTH(b.period_end)
     ) per_employee_month
     GROUP BY mm ORDER BY mm`,
    { year }
  );
  const months = monthRows as { m: number; fullTime: number; ptHours: number }[];
  if (months.length === 0) return { months: 0, avgTotal: 0, isAle: false };

  const totals = months.map((r) => Number(r.fullTime) + Math.round((Number(r.ptHours) / 120) * 100) / 100);
  const avgTotal = Math.round((totals.reduce((s, t) => s + t, 0) / months.length) * 100) / 100;
  const isAle = avgTotal >= 50;

  for (const r of months) {
    const fte = Math.round((Number(r.ptHours) / 120) * 100) / 100;
    await db.query(
      `INSERT INTO ale_monthly_snapshot (year, month, full_time_count, fte_count, pt_hours, total_count, is_ale, source)
       VALUES (:year, :month, :fullTime, :fte, :ptHours, :total, :isAle, 'payroll_import')
       ON DUPLICATE KEY UPDATE full_time_count = VALUES(full_time_count), fte_count = VALUES(fte_count),
         pt_hours = VALUES(pt_hours), total_count = VALUES(total_count), is_ale = VALUES(is_ale), source = VALUES(source)`,
      {
        year,
        month: r.m,
        fullTime: Number(r.fullTime),
        fte,
        ptHours: Number(r.ptHours),
        total: Number(r.fullTime) + Math.round(fte),
        isAle,
      }
    );
  }
  return { months: months.length, avgTotal, isAle };
}

export type AleMonthRow = { month: number; fullTime: number; ptHours: number; fte: number; total: number; isAle: boolean | null };

export async function listAleMonths(db: Pool, year: number): Promise<AleMonthRow[]> {
  const [rows] = await db.query(
    `SELECT month, full_time_count AS fullTime, pt_hours AS ptHours, fte_count AS fte, total_count AS total, is_ale AS isAle
     FROM ale_monthly_snapshot WHERE year = :year ORDER BY month`,
    { year }
  );
  return (rows as any[]).map((r) => ({
    month: Number(r.month),
    fullTime: Number(r.fullTime),
    ptHours: Number(r.ptHours ?? 0),
    fte: Number(r.fte),
    total: Number(r.total),
    isAle: r.isAle == null ? null : Boolean(Number(r.isAle)),
  }));
}

export type AffordabilityInput = {
  employeeId: string;
  name: string;
  /** Average MONTHLY wages from imports for the year (null = no wage data). */
  monthlyWage: number | null;
  acaEligible: boolean | null;
};

/** Per-employee average monthly wages from the year's imports + their ACA flag. */
export async function affordabilityInputs(db: Pool, year: number): Promise<AffordabilityInput[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(e.id) AS employeeId,
            CONCAT(e.first_name, ' ', e.last_name) AS name,
            (SELECT SUM(r.wages) / GREATEST(COUNT(DISTINCT MONTH(b.period_end)), 1)
               FROM payroll_import_row r JOIN payroll_import_batch b ON b.id = r.batch_id
              WHERE r.employee_id = e.id AND YEAR(b.period_end) = :year AND r.wages IS NOT NULL) AS monthlyWage,
            aca.aca_eligible AS acaEligible
     FROM employee e
     LEFT JOIN employee_aca aca ON aca.employee_id = e.id
     WHERE EXISTS (SELECT 1 FROM payroll_import_row r2 WHERE r2.employee_id = e.id)
     ORDER BY name`,
    { year }
  );
  return (rows as any[]).map((r) => ({
    employeeId: r.employeeId,
    name: r.name,
    monthlyWage: r.monthlyWage == null ? null : Math.round(Number(r.monthlyWage) * 100) / 100,
    acaEligible: r.acaEligible == null ? null : Boolean(Number(r.acaEligible)),
  }));
}

/** Upsert one 1095-C record for (employee, taxYear); never touches `filed` rows. */
export async function upsert1095(
  db: Pool,
  args: { employeeId: string; taxYear: number; dataJson: string }
): Promise<"generated" | "skipped_filed"> {
  const [existing] = await db.query(
    `SELECT filing_status AS s FROM form_1095_record
      WHERE employee_id = UUID_TO_BIN(:employeeId) AND tax_year = :taxYear LIMIT 1`,
    args
  );
  const status = (existing as any[])[0]?.s as string | undefined;
  if (status === "filed" || status === "corrected") return "skipped_filed"; // migration archive is immutable here
  await db.query(
    `INSERT INTO form_1095_record (employee_id, tax_year, data_json, filing_status)
     VALUES (UUID_TO_BIN(:employeeId), :taxYear, :dataJson, 'generated')
     ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), filing_status = 'generated'`,
    args
  );
  return "generated";
}

export type Form1095Row = {
  employee: string;
  taxYear: number;
  status: string;
  line14: string | null;
  line16: string | null;
  months: string | null;
  acaStatus: string | null;
};

export async function list1095(db: Pool, taxYear: number): Promise<Form1095Row[]> {
  const [rows] = await db.query(
    `SELECT CONCAT(e.first_name, ' ', e.last_name) AS employee, f.tax_year AS taxYear,
            f.filing_status AS status, f.data_json AS dataJson,
            aca.aca_eligible AS acaEligible
     FROM form_1095_record f
     JOIN employee e ON e.id = f.employee_id
     LEFT JOIN employee_aca aca ON aca.employee_id = e.id
     WHERE f.tax_year = :taxYear ORDER BY employee`,
    { taxYear }
  );
  return (rows as any[]).map((r) => {
    const data = r.dataJson ? (typeof r.dataJson === "string" ? JSON.parse(r.dataJson) : r.dataJson) : {};
    return {
      employee: r.employee,
      taxYear: Number(r.taxYear),
      status: r.status,
      line14: data.line14 ?? null,
      line16: data.line16 ?? null,
      months: data.months ?? null,
      acaStatus: r.acaEligible == null ? null : Number(r.acaEligible) ? "Full-time" : "Not full-time",
    };
  });
}

/** Filing history grouped by year — `filed`/`corrected` rows are the legacy archive. */
export async function filingHistory(db: Pool): Promise<{ year: number; forms: number; filed: number; corrected: number }[]> {
  const [rows] = await db.query(
    `SELECT tax_year AS year, COUNT(*) AS forms,
            SUM(filing_status = 'filed') AS filed, SUM(filing_status = 'corrected') AS corrected
     FROM form_1095_record GROUP BY tax_year ORDER BY tax_year DESC`
  );
  return (rows as any[]).map((r) => ({
    year: Number(r.year),
    forms: Number(r.forms),
    filed: Number(r.filed ?? 0),
    corrected: Number(r.corrected ?? 0),
  }));
}

/** Employees with an approved election in the plan year (the offer/enrolled set). */
export async function enrolledEmployees(db: Pool, planYearId: string): Promise<Set<string>> {
  const [rows] = await db.query(
    `SELECT DISTINCT BIN_TO_UUID(el.employee_id) AS id
     FROM employee_election el JOIN enrollment_event ev ON ev.id = el.enrollment_event_id
     WHERE ev.plan_year_id = UUID_TO_BIN(:planYearId) AND el.status = 'approved'`,
    { planYearId }
  );
  return new Set((rows as { id: string }[]).map((r) => r.id));
}
