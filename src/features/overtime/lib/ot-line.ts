import { formatClock } from "@/lib/clock";
import { formatMonthDayYear } from "@/shared/period";
import type { OtEntry } from "@/shared/types";

/**
 * The OT table prints a date plus two time pairs, and the totals the employee
 * types. These helpers are the single place that composition happens, so the
 * preview and the Word export can never drift apart.
 */

/** The date half, e.g. "10/07/2026". */
export function formatOtDate(date: string): string {
  return date ? formatMonthDayYear(date) : "";
}

/** A from/to pair, e.g. "08am - 05pm" ("" when neither end is set). */
export function formatOtHours(from: string, to: string): string {
  return [formatClock(from), formatClock(to)].filter(Boolean).join(" - ");
}

/** Whether an entry holds nothing worth saving — drives `buildEntries` and the preview. */
export function isBlankOtEntry(entry: OtEntry): boolean {
  return (
    !entry.date_of_ot &&
    !entry.regular_from &&
    !entry.regular_to &&
    !entry.actual_from &&
    !entry.actual_to &&
    !entry.total_hours &&
    !entry.validation
  );
}
