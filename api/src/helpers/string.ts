/**
 * Escape a value so it can be matched verbatim with LIKE / ILIKE — `%` and
 * `_` in the value stop acting as wildcards.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}
