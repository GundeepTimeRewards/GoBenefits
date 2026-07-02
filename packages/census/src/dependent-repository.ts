/**
 * Dependent + employee-detail repository. SQL against a ROUTED customer-DB pool
 * only (the service handles auth/routing). Decomposed model.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { CreateDependentInput, Dependent, EmployeeDetail, UpdateDependentInput } from "./dependent-types.js";

const DEPENDENT_SELECT = `
  SELECT BIN_TO_UUID(d.id) AS dependentId, d.first_name AS firstName, d.last_name AS lastName,
         d.date_of_birth AS dateOfBirth, d.gender AS gender, d.relationship AS relationship,
         d.disabled AS disabled, d.student AS student
  FROM dependent d`;

export async function listDependents(db: Pool, employeeId: string): Promise<Dependent[]> {
  const [rows] = await db.query(
    `${DEPENDENT_SELECT} WHERE d.employee_id = UUID_TO_BIN(:employeeId)
     ORDER BY d.last_name, d.first_name`,
    { employeeId }
  );
  return rows as Dependent[];
}

export async function getDependent(db: Pool, dependentId: string): Promise<Dependent | null> {
  const [rows] = await db.query(`${DEPENDENT_SELECT} WHERE d.id = UUID_TO_BIN(:id) LIMIT 1`, { id: dependentId });
  return (rows as Dependent[])[0] ?? null;
}

export async function employeeExists(db: Pool, employeeId: string): Promise<boolean> {
  const [rows] = await db.query(`SELECT 1 FROM employee WHERE id = UUID_TO_BIN(:id) LIMIT 1`, { id: employeeId });
  return (rows as unknown[]).length > 0;
}

export async function insertDependent(db: Pool, input: CreateDependentInput): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO dependent (id, employee_id, first_name, last_name, date_of_birth, gender, relationship, disabled, student)
     VALUES (UUID_TO_BIN(:id), UUID_TO_BIN(:employeeId), :firstName, :lastName, :dob, :gender, :relationship, :disabled, :student)`,
    {
      id,
      employeeId: input.employeeId,
      firstName: input.firstName,
      lastName: input.lastName,
      dob: input.dateOfBirth ?? null,
      gender: input.gender ?? null,
      relationship: input.relationship,
      disabled: input.disabled ?? null,
      student: input.student ?? null,
    }
  );
  return id;
}

export async function updateDependent(db: Pool, input: UpdateDependentInput): Promise<void> {
  await db.query(
    `UPDATE dependent SET first_name = :firstName, last_name = :lastName, date_of_birth = :dob,
            gender = :gender, relationship = :relationship, disabled = :disabled, student = :student
     WHERE id = UUID_TO_BIN(:id)`,
    {
      id: input.dependentId,
      firstName: input.firstName,
      lastName: input.lastName,
      dob: input.dateOfBirth ?? null,
      gender: input.gender ?? null,
      relationship: input.relationship,
      disabled: input.disabled ?? null,
      student: input.student ?? null,
    }
  );
}

export async function deleteDependent(db: Pool, dependentId: string): Promise<void> {
  await db.query(`DELETE FROM dependent WHERE id = UUID_TO_BIN(:id)`, { id: dependentId });
}

export async function getEmployeeDetail(db: Pool, employeeId: string): Promise<EmployeeDetail | null> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(e.id) AS employeeId, e.employee_number AS employeeNumber,
            e.first_name AS firstName, e.middle_name AS middleName, e.last_name AS lastName,
            e.date_of_birth AS dateOfBirth, e.gender AS gender,
            c.email AS email, c.alt_email AS altEmail, c.home_phone AS homePhone, c.cell_phone AS cellPhone,
            a.address1 AS addressLine1, a.city AS city, a.state AS state, a.zip AS zip,
            em.status AS employmentStatus, em.hire_date AS hireDate, em.original_hire_date AS originalHireDate,
            em.termination_date AS terminationDate, em.job_title AS jobTitle, em.employee_class AS employmentClass,
            ec.name AS eligibilityClass, em.pay_type AS payType, em.salary AS salary
     FROM employee e
     LEFT JOIN employee_contact     c    ON c.employee_id = e.id
     LEFT JOIN employee_address     a    ON a.employee_id = e.id AND a.is_current = 1
     LEFT JOIN employee_employment  em   ON em.employee_id = e.id
     LEFT JOIN eligibility_class    ec   ON ec.id = em.eligibility_class_id
     WHERE e.id = UUID_TO_BIN(:id) LIMIT 1`,
    { id: employeeId }
  );
  const row = (rows as Omit<EmployeeDetail, "dependents">[])[0];
  if (!row) return null;
  const dependents = await listDependents(db, employeeId);
  return { ...row, dependents };
}
