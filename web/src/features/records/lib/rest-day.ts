import { dateOfDay, isSunday } from "@swiftslip/shared/period";
import type { DtrEntry, DtrHeader } from "@swiftslip/shared/types";

/** What an empty REMARKS cell on a Sunday prints as. */
export const SUNDAY_REMARKS = "SUNDAY";

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
