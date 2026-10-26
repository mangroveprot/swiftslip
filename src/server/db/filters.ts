/**
 * PostgREST filter helpers.
 */

/**
 * Escape a value so it can be matched verbatim with ILIKE — case-insensitive
 * equality without turning `%` / `_` in the value into wildcards.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}
