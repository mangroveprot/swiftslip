/**
 * Whether an editor query failed because the id names no row the user owns.
 *
 * Every form service says so with a "… not found." message (`records` says
 * "Record not found."), and that message is the only signal available: a
 * TanStack Start server function answers `200` with a serialized `$TSR/Error`
 * rather than a `404` status, so the status code never reaches the client.
 *
 * Anything that is not a missing row (a network blip, say) must not be
 * mislabelled as a deletion — callers leave those on the loading skeleton,
 * where React Query can still retry.
 */
export function isMissingRow(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /not found/i.test(message);
}
