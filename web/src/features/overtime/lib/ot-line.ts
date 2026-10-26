import { formatClock } from "@/lib/clock";
import { formatMonthDayYear } from "@swiftslip/shared/period";
import type { OtEntry } from "@swiftslip/shared/types";

/**
 * The OT table prints a date plus two time pairs, and the totals the employee
 * types. These helpers are the single place that composition happens, so the
 * preview and the Word export can never drift apart.
 */

/** The date half, e.g. "10/07/2026". */
export function formatOtDate(date: string): string {
  return date ? formatMonthDayYear(date) : "";
}

/**
 * The "Date & Time Filed" box as the sheet prints it. The editor holds the
 * calendar picker's `YYYY-MM-DDTHH:MM`, so it reads `10/06/2026 3:30 PM`; a
 * date-only value (a fresh draft) prints just the date, and anything else — an
 * older form's hand-typed text — is printed as-is rather than rewritten.
 */
export function formatOtDateFiled(value: string): string {
  const v = (value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v);
  if (!iso) return v;
  const [, y, m, d, hh, mm] = iso;
  const date = `${m}/${d}/${y}`;
  if (!hh) return date;
  const hour = Number(hh);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${date} ${hour12}:${mm} ${suffix}`;
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
