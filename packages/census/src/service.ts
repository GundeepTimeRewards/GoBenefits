/**
 * Census service. Each method:
 *   1. authorizes (permission x scope) AND routes to the right customer DB via
 *      getCustomerDb(ctx, permission, employerId)  -- the Phase 0 control,
 *   2. validates input,
 *   3. delegates to the repository.
 * The service NEVER trusts a client-supplied employerId without getCustomerDb.
 */
import { getCustomerDb, type AuthContext } from "@goben/data-access";
import * as repo from "./repository.js";
import { validateEmployeeInput, ValidationError } from "./validation.js";
import { normalizeEmployeeNumber } from "./normalize.js";
import type { CensusEmployee, CreateEmployeeInput, EmployerCensusContext, UpdateEmployeeInput } from "./types.js";

export async function listEmployees(
  ctx: AuthContext,
  employerId: string,
  args: { search?: string | null; limit?: number }
): Promise<CensusEmployee[]> {
  const { db } = await getCustomerDb(ctx, "employee.read", employerId);
  return repo.listEmployees(db, args);
}

export async function getEmployee(ctx: AuthContext, employerId: string, employeeId: string): Promise<CensusEmployee | null> {
  const { db } = await getCustomerDb(ctx, "employee.read", employerId);
  return repo.getEmployee(db, employeeId);
}

export async function employerCensusContext(
  ctx: AuthContext,
  employerId: string,
  planYearId?: string | null
): Promise<EmployerCensusContext> {
  const { db, employer } = await getCustomerDb(ctx, "employee.read", employerId);
  const counts = await repo.employerCensusCounts(db);
  // planYearId is echoed from the request (the contract is plan-year-scoped); the
  // C1 census counts are employer-level and do not yet vary by plan year (see
  // docs/API_ROADMAP.md §9 coverage note).
  return { employerId: employer.id, employerName: employer.legalName, planYearId: planYearId ?? null, ...counts };
}

export async function createEmployee(ctx: AuthContext, input: CreateEmployeeInput): Promise<CensusEmployee> {
  const { db } = await getCustomerDb(ctx, "employee.create", input.employerId);
  validateEmployeeInput(input);
  const employeeNumber = normalizeEmployeeNumber(input.employeeNumber);

  if (input.eligibilityClassId && !(await repo.eligibilityClassExists(db, input.eligibilityClassId))) {
    throw new ValidationError("Eligibility class does not exist");
  }
  if (employeeNumber && (await repo.findByEmployeeNumber(db, employeeNumber))) {
    throw new ValidationError(`Employee number ${employeeNumber} already exists`);
  }

  const id = await repo.insertEmployee(db, { ...input, employeeNumber });
  const created = await repo.getEmployee(db, id);
  if (!created) throw new Error("Created employee not found after insert");
  return created;
}

export async function updateEmployee(ctx: AuthContext, input: UpdateEmployeeInput): Promise<CensusEmployee> {
  // getCustomerDb re-authorizes scope for THIS employerId — an update can never
  // cross tenants by passing another employee/employer id.
  const { db } = await getCustomerDb(ctx, "employee.update", input.employerId);
  validateEmployeeInput(input);
  const existing = await repo.getEmployee(db, input.employeeId);
  if (!existing) throw new ValidationError("Employee not found in this employer");

  const employeeNumber = normalizeEmployeeNumber(input.employeeNumber);
  if (employeeNumber) {
    const owner = await repo.findByEmployeeNumber(db, employeeNumber);
    if (owner && owner !== input.employeeId) {
      throw new ValidationError(`Employee number ${employeeNumber} already exists`);
    }
  }

  await repo.updateEmployee(db, { ...input, employeeNumber });
  const updated = await repo.getEmployee(db, input.employeeId);
  return updated!;
}

export { ValidationError } from "./validation.js";
