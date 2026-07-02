import { EMPLOYMENT_STATUSES, type CreateEmployeeInput } from "./types.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

/**
 * Service-level validation for create/update. (DB constraints catch structural
 * issues; this gives clear, early, business-friendly errors.)
 * `requireEmail` reflects whether the product requires an email for login.
 */
export function validateEmployeeInput(input: CreateEmployeeInput, opts: { requireEmail?: boolean } = {}): void {
  if (!input.firstName?.trim()) throw new ValidationError("First name is required");
  if (!input.lastName?.trim()) throw new ValidationError("Last name is required");

  if (opts.requireEmail && !input.email?.trim()) {
    throw new ValidationError("An email is required");
  }
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new ValidationError("Email format is invalid");
  }

  for (const [field, val] of [
    ["dateOfBirth", input.dateOfBirth],
    ["hireDate", input.hireDate],
    ["terminationDate", input.terminationDate],
  ] as const) {
    if (val != null && val !== "" && !isValidDate(val)) {
      throw new ValidationError(`${field} must be a valid date (YYYY-MM-DD)`);
    }
  }

  if (input.hireDate && input.terminationDate && input.hireDate > input.terminationDate) {
    throw new ValidationError("Hire date cannot be after termination date");
  }

  if (input.employmentStatus && !EMPLOYMENT_STATUSES.includes(input.employmentStatus as never)) {
    throw new ValidationError(
      `Invalid employment status. Allowed: ${EMPLOYMENT_STATUSES.join(", ")}`
    );
  }
}
