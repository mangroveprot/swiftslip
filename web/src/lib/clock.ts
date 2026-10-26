/**
 * Clock formatting shared by the forms that print a time on their sheet.
 *
 * "08:00" → "08am", "17:30" → "05:30pm". Empty input stays empty. The hour is
 * always two digits (08, not 8) so printed lines line up; minutes are dropped
 * when they are :00. Midnight and noon stay 12am / 12pm.
 */
export function formatClock(hhmm: string): string {
  const [rawHour, rawMinute] = (hhmm ?? "").split(":");
  const h = Number(rawHour);
  if (!rawHour || !Number.isFinite(h)) return "";
  const m = Number(rawMinute ?? 0);
  const suffix = h < 12 ? "am" : "pm";
  const hour = String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0");
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}
