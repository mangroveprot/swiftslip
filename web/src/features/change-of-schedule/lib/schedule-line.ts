import { formatMonthDayYear } from "@swiftslip/shared/period";
import type { CosSchedule } from "@swiftslip/shared/types";

/**
 * The schedule line is picked as a date plus two times, but the sheet prints it
 * as one run of text, "10/07/2026 - 08:00am - 05:00pm", exactly the shape the
 * template uses. These helpers are the single place that composition happens,
 * so the preview and the Word export can never drift apart.
 */

/** The date half, e.g. "10/07/2026". */
export function formatScheduleDate(date: string): string {
  return date ? formatMonthDayYear(date) : "";
}

/**
 * A time as this sheet prints it: "08:00am", minutes always shown.
 *
 * Deliberately NOT `formatClock`, which OT's sheet keeps using: that one drops
 * ":00", so a 08:00 start printed as "08am" while the time picker above it
 * read "08:00 AM" — one value, read as two. The shape stays this sheet's own
 * (two-digit hour, lowercase suffix, no space), only the minutes are added.
 */
export function formatScheduleClock(hhmm: string): string {
  const [rawHour, rawMinute] = (hhmm ?? "").split(":");
  const h = Number(rawHour);
  if (!rawHour || !Number.isFinite(h)) return "";
  const parsed = Number(rawMinute);
  const minute = Number.isFinite(parsed) && parsed >= 0 && parsed <= 59 ? parsed : 0;
  const suffix = h < 12 ? "am" : "pm";
  const hour = String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0");
  return `${hour}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** The hours half, e.g. "08:00am - 05:00pm" ("" when neither end is set). */
export function formatScheduleHours(start: string, end: string): string {
  return [formatScheduleClock(start), formatScheduleClock(end)].filter(Boolean).join(" - ");
}

/** The whole printed line, e.g. "10/07/2026 - 08:00am - 05:00pm". */
export function formatScheduleLine(date: string, start: string, end: string): string {
  return [formatScheduleDate(date), formatScheduleHours(start, end)].filter(Boolean).join(" - ");
}

/** Whether a line holds nothing worth saving, drives `buildRows` and the preview. */
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
