/**
 * Census repository. SQL against a ROUTED customer-DB pool only — it never
 * resolves tenancy itself (the service does that via getCustomerDb). Uses the
 * decomposed model (employee + employment/contact/address/integration_ref).
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { CensusEmployee, CreateEmployeeInput, EmployerCensusContext, UpdateEmployeeInput } from "./types.js";

const CENSUS_SELECT = `
  SELECT BIN_TO_UUID(e.id)            AS employeeId,
         e.employee_number            AS employeeNumber,
         e.first_name                 AS firstName,
         e.last_name                  AS lastName,
         c.email                      AS email,
         c.cell_phone                 AS phone,
         e.date_of_birth              AS dateOfBirth,
         e.gender                     AS gender,
         em.status                    AS employmentStatus,
         em.hire_date                 AS hireDate,
         em.termination_date          AS terminationDate,
         em.employee_class            AS employmentClass,
         ec.name                      AS eligibilityClass,
         em.pay_type                  AS payType,
         em.salary                    AS salary,
         NULLIF(CONCAT_WS(', ', a.city, a.state), '') AS addressSummary,
         (SELECT COUNT(*) FROM dependent d WHERE d.employee_id = e.id) AS dependentCount,
         elig.eligible                AS eligibilityStatus
  FROM employee e
  LEFT JOIN employee_employment       em   ON em.employee_id = e.id
  LEFT JOIN employee_contact          c    ON c.employee_id = e.id
  LEFT JOIN eligibility_class         ec   ON ec.id = em.eligibility_class_id
  LEFT JOIN employee_address          a    ON a.employee_id = e.id AND a.is_current = 1
  LEFT JOIN employee_eligibility      elig ON elig.employee_id = e.id`;

export async function listEmployees(
  db: Pool,
  args: { search?: string | null; limit?: number }
): Promise<CensusEmployee[]> {
  const limit = Math.min(args.limit ?? 50, 200);
  const search = args.search?.trim() || null;
  const [rows] = await db.query(
    `${CENSUS_SELECT}
     WHERE (:search IS NULL
            OR e.first_name LIKE :like
            OR e.last_name LIKE :like
            OR e.employee_number LIKE :like)
     ORDER BY e.last_name, e.first_name
     LIMIT :limit`,
    { search, like: search ? `%${search}%` : null, limit }
  );
  return rows as CensusEmployee[];
}

export async function getEmployee(db: Pool, employeeId: string): Promise<CensusEmployee | null> {
  const [rows] = await db.query(`${CENSUS_SELECT} WHERE e.id = UUID_TO_BIN(:id) LIMIT 1`, { id: employeeId });
  return (rows as CensusEmployee[])[0] ?? null;
}

export async function eligibilityClassExists(db: Pool, classId: string): Promise<boolean> {
  const [rows] = await db.query(`SELECT 1 FROM eligibility_class WHERE id = UUID_TO_BIN(:id) LIMIT 1`, { id: classId });
  return (rows as unknown[]).length > 0;
}

/**
 * Find an employee by employer-assigned number. Comparison is case-insensitive
 * (utf8mb4_0900_ai_ci collation on employee.employee_number).
 */
export async function findByEmployeeNumber(db: Pool, employeeNumber: string): Promise<string | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(id) AS id FROM employee WHERE employee_number = :n LIMIT 1`,
    { n: employeeNumber }
  );
  return (rows as { id: string }[])[0]?.id ?? null;
}

/** Insert across the decomposed tables in one transaction. Returns new id. */
export async function insertEmployee(db: Pool, input: CreateEmployeeInput): Promise<string> {
  const id = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO employee (id, employee_number, first_name, last_name, date_of_birth, gender)
       VALUES (UUID_TO_BIN(:id), :employeeNumber, :firstName, :lastName, :dob, :gender)`,
      {
        id,
        employeeNumber: input.employeeNumber ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        dob: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
      }
    );
    await conn.query(
      `INSERT INTO employee_employment (employee_id, status, hire_date, termination_date, employee_class, eligibility_class_id)
       VALUES (UUID_TO_BIN(:id), :status, :hireDate, :termDate, :empClass,
               ${input.eligibilityClassId ? "UUID_TO_BIN(:eligClassId)" : "NULL"})`,
      {
        id,
        status: input.employmentStatus ?? "active",
        hireDate: input.hireDate ?? null,
        termDate: input.terminationDate ?? null,
        empClass: input.employeeClass ?? null,
        eligClassId: input.eligibilityClassId ?? null,
      }
    );
    if (input.email || input.phone) {
      await conn.query(
        `INSERT INTO employee_contact (employee_id, email, cell_phone) VALUES (UUID_TO_BIN(:id), :email, :phone)`,
        { id, email: input.email ?? null, phone: input.phone ?? null }
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

/** Update basic census fields (upserts the satellite rows). */
export async function updateEmployee(db: Pool, input: UpdateEmployeeInput): Promise<void> {
  const id = input.employeeId;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE employee SET employee_number = :employeeNumber, first_name = :firstName,
              last_name = :lastName, date_of_birth = :dob, gender = :gender
       WHERE id = UUID_TO_BIN(:id)`,
      {
        id,
        employeeNumber: input.employeeNumber ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        dob: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
      }
    );
    await conn.query(
      `INSERT INTO employee_employment (employee_id, status, hire_date, termination_date, employee_class)
       VALUES (UUID_TO_BIN(:id), :status, :hireDate, :termDate, :empClass)
       ON DUPLICATE KEY UPDATE status = VALUES(status), hire_date = VALUES(hire_date),
              termination_date = VALUES(termination_date), employee_class = VALUES(employee_class)`,
      {
        id,
        status: input.employmentStatus ?? "active",
        hireDate: input.hireDate ?? null,
        termDate: input.terminationDate ?? null,
        empClass: input.employeeClass ?? null,
      }
    );
    if (input.email != null || input.phone != null) {
      await conn.query(
        `INSERT INTO employee_contact (employee_id, email, cell_phone) VALUES (UUID_TO_BIN(:id), :email, :phone)
         ON DUPLICATE KEY UPDATE email = VALUES(email), cell_phone = VALUES(cell_phone)`,
        { id, email: input.email ?? null, phone: input.phone ?? null }
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Census KPI counts for the Census Health context. All single-tenant aggregates
 * against the routed customer DB.
 *
 * `needsReviewCount` is a documented ZERO PLACEHOLDER for C1: the "needs review"
 * work queue is a derived data-quality concept whose real source (the census
 * import/exception + review pipeline) is not built until a later module. Returning
 * 0 keeps the GraphQL non-null field satisfied without inventing logic. The other
 * counts are real.
 */
export async function employerCensusCounts(
  db: Pool
): Promise<
  Pick<
    EmployerCensusContext,
    | "planYearLabel"
    | "totalEmployees"
    | "activeEmployees"
    | "missingRequiredCount"
    | "missingEligibilityClassCount"
    | "dependentsMissingDataCount"
    | "needsReviewCount"
  >
> {
  const [rows] = await db.query(`
    SELECT
      (SELECT label FROM plan_year WHERE status = 'active' ORDER BY year DESC LIMIT 1) AS planYearLabel,
      (SELECT COUNT(*) FROM employee) AS totalEmployees,
      (SELECT COUNT(*) FROM employee_employment WHERE status = 'active') AS activeEmployees,
      (SELECT COUNT(*) FROM employee e
         LEFT JOIN employee_contact c ON c.employee_id = e.id
       WHERE c.email IS NULL OR c.email = '') AS missingRequiredCount,
      (SELECT COUNT(*) FROM employee e
         LEFT JOIN employee_employment em ON em.employee_id = e.id
       WHERE em.eligibility_class_id IS NULL) AS missingEligibilityClassCount,
      (SELECT COUNT(*) FROM dependent WHERE date_of_birth IS NULL) AS dependentsMissingDataCount`);
  const r = (rows as any[])[0];
  return {
    planYearLabel: r.planYearLabel ?? null,
    totalEmployees: Number(r.totalEmployees),
    activeEmployees: Number(r.activeEmployees),
    missingRequiredCount: Number(r.missingRequiredCount),
    missingEligibilityClassCount: Number(r.missingEligibilityClassCount),
    dependentsMissingDataCount: Number(r.dependentsMissingDataCount),
    needsReviewCount: 0, // documented C1 placeholder — see doc comment above
  };
}
