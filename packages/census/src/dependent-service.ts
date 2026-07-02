/**
 * Dependents + employee-detail service. Same control as census: every method
 * authorizes (permission x scope) AND routes via getCustomerDb before any DB
 * access. Writes also confirm the parent employee exists in THIS tenant DB, so
 * a dependent can never be attached across tenants.
 */
import { getCustomerDb, type AuthContext } from "@goben/data-access";
import * as repo from "./dependent-repository.js";
import { validateDependentInput } from "./dependent-validation.js";
import { ValidationError } from "./validation.js";
import type { CreateDependentInput, Dependent, EmployeeDetail, UpdateDependentInput } from "./dependent-types.js";

export async function employeeDetail(ctx: AuthContext, employerId: string, employeeId: string): Promise<EmployeeDetail | null> {
  const { db } = await getCustomerDb(ctx, "employee.read", employerId);
  return repo.getEmployeeDetail(db, employeeId);
}

export async function listDependents(ctx: AuthContext, employerId: string, employeeId: string): Promise<Dependent[]> {
  const { db } = await getCustomerDb(ctx, "dependent.read", employerId);
  return repo.listDependents(db, employeeId);
}

export async function addDependent(ctx: AuthContext, input: CreateDependentInput): Promise<Dependent> {
  const { db } = await getCustomerDb(ctx, "dependent.manage", input.employerId);
  validateDependentInput(input);
  if (!(await repo.employeeExists(db, input.employeeId))) {
    throw new ValidationError("Employee not found in this employer");
  }
  const id = await repo.insertDependent(db, input);
  const created = await repo.getDependent(db, id);
  return created!;
}

export async function updateDependent(ctx: AuthContext, input: UpdateDependentInput): Promise<Dependent> {
  const { db } = await getCustomerDb(ctx, "dependent.manage", input.employerId);
  validateDependentInput({ ...input, employeeId: input.employeeId ?? "" });
  const existing = await repo.getDependent(db, input.dependentId);
  if (!existing) throw new ValidationError("Dependent not found in this employer");
  await repo.updateDependent(db, input);
  return (await repo.getDependent(db, input.dependentId))!;
}

export async function removeDependent(ctx: AuthContext, employerId: string, dependentId: string): Promise<{ removed: boolean }> {
  const { db } = await getCustomerDb(ctx, "dependent.manage", employerId);
  const existing = await repo.getDependent(db, dependentId);
  if (!existing) throw new ValidationError("Dependent not found in this employer");
  try {
    await repo.deleteDependent(db, dependentId);
  } catch (err) {
    // FK from coverage_dependent / election_dependent -> dependent.
    throw new ValidationError("Cannot remove a dependent that is enrolled in coverage; remove coverage first");
  }
  return { removed: true };
}
