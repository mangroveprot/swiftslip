/**
 * The warning shown before a profile save changes the sign-in ID.
 *
 * The employee number and the login ID are the same value now, so the form has
 * to say that before the account row moves. `null` means the trimmed values
 * match and Save can proceed without asking.
 */
export function idNumberChangeNotice(previous: string, next: string): string | null {
  const from = previous.trim();
  const to = next.trim();
  if (!to || from === to) return null;
  return from
    ? `You'll sign in with ${to} from now on. Your current Employee ID, ${from}, will stop working.`
    : `You'll sign in with ${to} from now on.`;
}
