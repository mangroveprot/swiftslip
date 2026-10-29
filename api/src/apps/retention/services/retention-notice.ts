import type { RetentionFormType } from '@swiftslip/shared/schemas';
import { RetentionSettingsRepository } from '../repositories';
import { isFinished, readFormTypes, type RuleFields } from './retention.rules';

const DAY_MS = 86_400_000;

/**
 * How long before a form becomes eligible the list starts warning about it.
 * The reminder is a courtesy, not a rule: nothing here changes what a cleanup
 * deletes — it only mirrors the decision so the owner is never surprised.
 */
export const REMINDER_DAYS = 7;

export type RetentionNotice = {
  days: number;
  formTypes: RetentionFormType[];
};

/** The active rule, or null when cleanup is off or no type is ticked. */
export async function readRetentionNotice(): Promise<RetentionNotice | null> {
  const row = await new RetentionSettingsRepository().findSingle();
  if (!row || !row.enabled) return null;
  const formTypes = readFormTypes(row.form_types);
  if (!formTypes.length) return null;
  return { days: row.days, formTypes };
}

/**
 * Whole days until this form's age crosses the rule. `0` or less means the
 * next cleanup would take it. Ceil, so a form that reaches the age in two
 * hours reads "in 1 day", never "in 0 days".
 */
export function daysUntilDeletion(
  createdAt: string,
  days: number,
  now: number = Date.now(),
): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return Number.POSITIVE_INFINITY;
  return Math.ceil((created + days * DAY_MS - now) / DAY_MS);
}

/**
 * Days left for the badge on a form row — or null when this row is not one a
 * cleanup would take: the type is unticked, the form is still a draft, it is
 * waiting for an approval slip, or it is further out than the warning window.
 */
export function reminderDays(
  type: RetentionFormType,
  row: RuleFields & { created_at?: string | null },
  notice: RetentionNotice | null,
  now: number = Date.now(),
): number | null {
  if (!notice || !notice.formTypes.includes(type)) return null;
  if (!row.created_at || !isFinished(type, row)) return null;
  const left = daysUntilDeletion(row.created_at, notice.days, now);
  return left <= REMINDER_DAYS ? left : null;
}

/**
 * Add `deletes_in_days` to the rows a cleanup would take within the warning
 * window. Best effort on purpose: a reminder is a nicety, so a settings read
 * that fails returns the list untouched instead of breaking the screen.
 */
export async function withDeletionReminder<
  T extends RuleFields & { created_at?: string | null },
>(
  type: RetentionFormType,
  rows: T[],
): Promise<Array<T & { deletes_in_days?: number }>> {
  if (rows.length === 0) return rows;

  let notice: RetentionNotice | null = null;
  try {
    notice = await readRetentionNotice();
  } catch {
    return rows;
  }
  if (!notice) return rows;

  const now = Date.now();
  return rows.map((row) => {
    const days = reminderDays(type, row, notice, now);
    return days === null ? row : { ...row, deletes_in_days: days };
  });
}
