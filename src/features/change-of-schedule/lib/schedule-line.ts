import { formatClock } from "@/lib/clock";
import { formatMonthDayYear } from "@/shared/period";
import type { CosSchedule } from "@/shared/types";

/**
 * The schedule line is picked as a date plus two times, but the sheet prints it
 * as one run of text — "10/07/2026 - 8am - 5pm" — exactly the shape the template
 * uses. These helpers are the single place that composition happens, so the
 * preview and the Word export can never drift apart.
 */

/** The date half, e.g. "10/07/2026". */
export function formatScheduleDate(date: string): string {
  return date ? formatMonthDayYear(date) : "";
}

/** The hours half, e.g. "08am - 05pm" ("" when neither end is set). */
export function formatScheduleHours(start: string, end: string): string {
  return [formatClock(start), formatClock(end)].filter(Boolean).join(" - ");
}

/** The whole printed line, e.g. "10/07/2026 - 08am - 05pm". */
export function formatScheduleLine(date: string, start: string, end: string): string {
  return [formatScheduleDate(date), formatScheduleHours(start, end)].filter(Boolean).join(" - ");
}

/** Whether a line holds nothing worth saving — drives `buildRows` and the preview. */
export function isBlankSchedule(row: CosSchedule): boolean {
  return (
    !row.effectivity_date &&
    !row.from_date &&
    !row.from_start &&
    !row.from_end &&
    !row.to_date &&
    !row.to_start &&
    !row.to_end
  );
}
