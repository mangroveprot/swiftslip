import { dateOfDay, isSunday } from "@swiftslip/shared/period";
import type { DtrEntry, DtrHeader } from "@swiftslip/shared/types";

/** What an empty REMARKS cell on a Sunday prints as. */
export const SUNDAY_REMARKS = "SUNDAY";

/**
 * Which day numbers of the sheet fall on a Sunday.
 *
 * The month/year pair comes from the day's REAL date, so a period that spans two
 * months (`span:25-8`) is judged on the right calendar day.
 */
export function sundayDaysFor(header: DtrHeader, days: number[]): Set<number> {
  const out = new Set<number>();
  for (const day of days) {
    const date = dateOfDay(day, header.period, header.month, header.year);
    if (isSunday(date.day, date.month, date.year)) out.add(day);
  }
  return out;
}

/**
 * A row as it will print. A Sunday whose REMARKS cell is still blank shows the
 * rest-day note; anything the user typed always wins.
 *
 * This is applied when the sheet is rendered — nothing is written to the saved
 * record — so a typed remark is never overwritten and the note can never be
 * saved by accident as if the user had entered it.
 */
export function withRestDayRemarks(entry: DtrEntry, day: number, header: DtrHeader): DtrEntry {
  if (entry.remarks.trim()) return entry;
  const date = dateOfDay(day, header.period, header.month, header.year);
  if (!isSunday(date.day, date.month, date.year)) return entry;
  return { ...entry, remarks: SUNDAY_REMARKS };
}
