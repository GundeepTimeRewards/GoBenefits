/**
 * Payroll-data repository (Phase E-5). SQL against a ROUTED customer-DB pool only —
 * the service authorizes + routes via getCustomerDb. Covers the import staging
 * tables (0004) and the employee_aca lookback results.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";

export type PayrollRowInput = { employeeNumber: string; hours: number; wages?: number | null };

/**
 * Stage one pay period's rows in a transaction: rows match census by
 * employee_number (case-insensitive column collation); unmatched rows keep
 * employee_id NULL and are COUNTED, never dropped. Returns match stats.
 */
export async function importBatch(
  db: Pool,
  args: { source: string; fileName: string | null; periodStart: string; periodEnd: string; payDate: string | null; rows: PayrollRowInput[] }
): Promise<{ batchId: string; matched: number; unmatched: number }> {
  const batchId = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO payroll_import_batch (id, source, file_name, period_start, period_end, pay_date, status, row_count)
       VALUES (UUID_TO_BIN(:batchId), :source, :fileName, :periodStart, :periodEnd, :payDate, 'imported', :rowCount)`,
      { batchId, source: args.source, fileName: args.fileName, periodStart: args.periodStart, periodEnd: args.periodEnd, payDate: args.payDate, rowCount: args.rows.length }
    );
    let matched = 0;
    for (const r of args.rows) {
      const [empRows] = await conn.query(
        `SELECT BIN_TO_UUID(id) AS id FROM employee WHERE employee_number = :n LIMIT 1`,
        { n: r.employeeNumber }
      );
      const employeeId = (empRows as { id: string }[])[0]?.id ?? null;
      if (employeeId) matched += 1;
      await conn.query(
        `INSERT INTO payroll_import_row (batch_id, employee_number, employee_id, hours, wages, error)
         VALUES (UUID_TO_BIN(:batchId), :employeeNumber, ${employeeId ? "UUID_TO_BIN(:employeeId)" : "NULL"}, :hours, :wages,
                 ${employeeId ? "NULL" : "'No census match for employee number'"})`,
        { batchId, employeeNumber: r.employeeNumber, employeeId, hours: r.hours, wages: r.wages ?? null }
      );
    }
    await conn.commit();
    return { batchId, matched, unmatched: args.rows.length - matched };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type ImportedPeriodRow = {
  id: string; period: string; payDate: string | null; employees: number;
  hours: number; wages: number; status: string; issues: number; source: string;
};

export async function listBatches(db: Pool): Promise<ImportedPeriodRow[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(b.id) AS id,
            CONCAT(DATE_FORMAT(b.period_start, '%b %e'), ' – ', DATE_FORMAT(b.period_end, '%b %e, %Y')) AS period,
            DATE_FORMAT(b.pay_date, '%Y-%m-%d') AS payDate,
            b.status AS status, b.source AS source,
            COUNT(r.id) AS employees,
            COALESCE(SUM(r.hours), 0) AS hours,
            COALESCE(SUM(r.wages), 0) AS wages,
            SUM(r.employee_id IS NULL) AS issues
     FROM payroll_import_batch b
     LEFT JOIN payroll_import_row r ON r.batch_id = b.id
     GROUP BY b.id ORDER BY b.period_end DESC`
  );
  return (rows as any[]).map((r) => ({
    id: r.id, period: r.period, payDate: r.payDate ?? null, employees: Number(r.employees),
    hours: Number(r.hours), wages: Number(r.wages), status: r.status, issues: Number(r.issues ?? 0), source: r.source,
  }));
}

export type EmployeeHoursRow = {
  employeeId: string; name: string; employeeNumber: string | null;
  totalHours: number; totalWages: number; periods: number;
  acaEligible: boolean | null; lookbackHours: number | null; lastImported: string | null;
};

/** Per-employee import aggregates + current ACA determination. */
export async function listEmployeeRecords(db: Pool): Promise<EmployeeHoursRow[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(e.id) AS employeeId,
            CONCAT(e.first_name, ' ', e.last_name) AS name,
            e.employee_number AS employeeNumber,
            COALESCE(SUM(r.hours), 0) AS totalHours,
            COALESCE(SUM(r.wages), 0) AS totalWages,
            COUNT(DISTINCT r.batch_id) AS periods,
            aca.aca_eligible AS acaEligible,
            aca.lookback_hours AS lookbackHours,
            DATE_FORMAT(MAX(b.imported_at), '%Y-%m-%d') AS lastImported
     FROM employee e
     JOIN payroll_import_row r ON r.employee_id = e.id
     JOIN payroll_import_batch b ON b.id = r.batch_id
     LEFT JOIN employee_aca aca ON aca.employee_id = e.id
     GROUP BY e.id ORDER BY name`
  );
  return (rows as any[]).map((r) => ({
    employeeId: r.employeeId, name: r.name, employeeNumber: r.employeeNumber ?? null,
    totalHours: Number(r.totalHours), totalWages: Number(r.totalWages), periods: Number(r.periods),
    acaEligible: r.acaEligible == null ? null : Boolean(Number(r.acaEligible)),
    lookbackHours: r.lookbackHours == null ? null : Number(r.lookbackHours),
    lastImported: r.lastImported ?? null,
  }));
}

export type ImportStats = { batches: number; matchedEmployees: number; unmatchedRows: number; lastStatus: string | null; firstImported: string | null; lastImported: string | null };

export async function importStats(db: Pool): Promise<ImportStats> {
  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT b.id) AS batches,
            COUNT(DISTINCT r.employee_id) AS matchedEmployees,
            SUM(r.employee_id IS NULL) AS unmatchedRows,
            DATE_FORMAT(MIN(b.period_start), '%Y-%m-%d') AS firstImported,
            DATE_FORMAT(MAX(b.period_end), '%Y-%m-%d') AS lastImported,
            (SELECT b2.status FROM payroll_import_batch b2 ORDER BY b2.imported_at DESC LIMIT 1) AS lastStatus
     FROM payroll_import_batch b
     LEFT JOIN payroll_import_row r ON r.batch_id = b.id`
  );
  const r = (rows as any[])[0];
  return {
    batches: Number(r.batches ?? 0),
    matchedEmployees: Number(r.matchedEmployees ?? 0),
    unmatchedRows: Number(r.unmatchedRows ?? 0),
    lastStatus: r.lastStatus ?? null,
    firstImported: r.firstImported ?? null,
    lastImported: r.lastImported ?? null,
  };
}

/**
 * ACA lookback (Phase E-5): standard measurement = the trailing 12 months ending at
 * the most recent imported period_end. For every employee with matched hours in the
 * window: avg monthly hours = SUM(hours) / 12 (fixed-length standard measurement —
 * months without data are zero-hour months, the conservative ACA reading);
 * full-time when avg >= 130 (26 U.S.C. §4980H). Writes employee_aca (measurement +
 * 12-month stability starting the day after) and returns per-employee results.
 */
export async function runLookback(db: Pool): Promise<{ evaluated: number; fullTime: number }> {
  const [endRows] = await db.query(`SELECT DATE_FORMAT(MAX(period_end), '%Y-%m-%d') AS d FROM payroll_import_batch`);
  const end = (endRows as any[])[0]?.d as string | null;
  if (!end) return { evaluated: 0, fullTime: 0 };

  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(r.employee_id) AS employeeId, SUM(r.hours) AS hours
     FROM payroll_import_row r
     JOIN payroll_import_batch b ON b.id = r.batch_id
     WHERE r.employee_id IS NOT NULL
       AND b.period_end > DATE_SUB(:end, INTERVAL 12 MONTH) AND b.period_end <= :end
     GROUP BY r.employee_id`,
    { end }
  );
  let fullTime = 0;
  for (const r of rows as any[]) {
    const avgMonthly = Number(r.hours) / 12;
    const eligible = avgMonthly >= 130;
    if (eligible) fullTime += 1;
    await db.query(
      `INSERT INTO employee_aca (employee_id, measurement_start, measurement_end, stability_start, stability_end, lookback_hours, aca_eligible)
       VALUES (UUID_TO_BIN(:employeeId),
               DATE_ADD(DATE_SUB(:end, INTERVAL 12 MONTH), INTERVAL 1 DAY), :end,
               DATE_ADD(:end, INTERVAL 1 DAY), DATE_ADD(:end, INTERVAL 12 MONTH),
               :avgMonthly, :eligible)
       ON DUPLICATE KEY UPDATE
         measurement_start = VALUES(measurement_start), measurement_end = VALUES(measurement_end),
         stability_start = VALUES(stability_start), stability_end = VALUES(stability_end),
         lookback_hours = VALUES(lookback_hours), aca_eligible = VALUES(aca_eligible)`,
      { employeeId: r.employeeId, end, avgMonthly: Math.round(avgMonthly * 100) / 100, eligible }
    );
  }
  return { evaluated: (rows as any[]).length, fullTime };
}

export type AcaSummary = {
  measurementStart: string | null; measurementEnd: string | null;
  stabilityStart: string | null; stabilityEnd: string | null;
  evaluated: number; fullTime: number;
};

export async function acaSummary(db: Pool): Promise<AcaSummary> {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(MIN(measurement_start), '%Y-%m-%d') AS ms, DATE_FORMAT(MAX(measurement_end), '%Y-%m-%d') AS me,
            DATE_FORMAT(MIN(stability_start), '%Y-%m-%d') AS ss, DATE_FORMAT(MAX(stability_end), '%Y-%m-%d') AS se,
            COUNT(*) AS evaluated, SUM(aca_eligible = 1) AS fullTime
     FROM employee_aca WHERE lookback_hours IS NOT NULL`
  );
  const r = (rows as any[])[0];
  return {
    measurementStart: r.ms ?? null, measurementEnd: r.me ?? null,
    stabilityStart: r.ss ?? null, stabilityEnd: r.se ?? null,
    evaluated: Number(r.evaluated ?? 0), fullTime: Number(r.fullTime ?? 0),
  };
}
