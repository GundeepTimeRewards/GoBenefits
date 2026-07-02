/**
 * Pure normalization helpers (no DB). Kept separate so they can be unit-tested
 * offline and reused by the service.
 */

/**
 * Normalize an employer-assigned employee number: trim whitespace; treat a blank
 * string as absent (null). Case is preserved in storage; uniqueness comparison
 * is case-insensitive at the DB layer (utf8mb4_0900_ai_ci).
 */
export function normalizeEmployeeNumber(n?: string | null): string | null {
  const t = n?.trim();
  return t ? t : null;
}
