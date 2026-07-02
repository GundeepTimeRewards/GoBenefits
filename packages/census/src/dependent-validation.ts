import { ValidationError } from "./validation.js";
import { RELATIONSHIPS, type CreateDependentInput } from "./dependent-types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

/** Service-level validation for dependent create/update (no DB). */
export function validateDependentInput(input: CreateDependentInput): void {
  if (!input.firstName?.trim()) throw new ValidationError("Dependent first name is required");
  if (!input.lastName?.trim()) throw new ValidationError("Dependent last name is required");
  if (!input.relationship || !RELATIONSHIPS.includes(input.relationship as never)) {
    throw new ValidationError(`Invalid relationship. Allowed: ${RELATIONSHIPS.join(", ")}`);
  }
  if (input.dateOfBirth != null && input.dateOfBirth !== "" && !isValidDate(input.dateOfBirth)) {
    throw new ValidationError("Dependent date of birth must be a valid date (YYYY-MM-DD)");
  }
  if (input.dateOfBirth && isValidDate(input.dateOfBirth)) {
    if (new Date(input.dateOfBirth + "T00:00:00Z").getTime() > Date.now()) {
      throw new ValidationError("Dependent date of birth cannot be in the future");
    }
  }
}
