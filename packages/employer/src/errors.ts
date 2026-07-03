/**
 * Domain error for plan-year mutation input problems. Matched by NAME in the
 * resolver's toGraphqlError (bundling-robust, same rationale as @goben/census's
 * ValidationError) — keep `name` exactly "ValidationError".
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
