/**
 * What the two "TIME OF" columns on an Official Business form print.
 *
 * The employee's typed itinerary time is always the first line. DEPARTURE
 * prints a time only, never a date: the Date of OB is already in the header
 * and the exit-clearance box prints the signed departure date.
 *
 * RETURN prints a second line with HR's signed `arrival_date` only when that
 * date differs from the form's Date of OB. A return on the same day keeps a
 * bare time, because repeating the header date adds nothing.
 *
 * DEPARTURE: HR's signed "Actual Departure" time fills a blank planned cell.
 * Only the first stop with a departure time (or the first stop when they are
 * all blank) is the one HR's sign-off prefill treats as the real departure.
 *
 * RETURN: HR's signed "Actual Arrival" time fills a blank planned cell. Only
 * the last stop with a return time carries it, again matching HR's sign-off
 * prefill.
 *
 * The form's Overdue badge is a separate, unchanged rule: derived from the
 * Date of OB having passed, which is correct even before any return exists.
 *
 * One module feeds all three places that draw the sheet, the on-screen /
 * print / Save-as-PDF preview, the HR review rows and the Word download, so
 * the two columns can never disagree with each other or across outputs.
 */
import { resolveExitSignoff, stampTime } from "@/features/official-business/lib/exit-signoff";
import { formatMonthDayYear } from "@swiftslip/shared/period";
import { formatTime12h } from "@swiftslip/shared/time";
import type { ObHrFields } from "@swiftslip/shared/hr";
import type { ObEntry } from "@swiftslip/shared/types";

/** First line = time, second line = HR's signed date (empty while unsigned). */
export type ObTimeOfDisplay = { time: string; date: string };

type HrFields = Partial<ObHrFields> | null | undefined;

/**
 * Which itinerary row carries THE departure. The HR sign-off prefill already
 * treats the first stop with a departure time as the real one. If the employee
 * left every DEPARTURE blank, fall back to the first stop so a signed departure
 * still has somewhere to print. An empty itinerary has no row to carry it.
 */
export function obDepartureRowIndex(rows: readonly ObEntry[]): number {
  const found = rows.findIndex((row) => Boolean(row?.time_departure?.trim()));
  if (found >= 0) return found;
  return rows.length ? 0 : -1;
}

/**
 * Which itinerary row carries THE return. The HR sign-off prefill already
 * treats the last stop with a return time as the real one. If the employee
 * left every RETURN blank, fall back to the last stop so a signed arrival
 * still has somewhere to print, the cell is empty otherwise.
 */
export function obReturnRowIndex(rows: readonly ObEntry[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]?.time_return?.trim()) return i;
  }
  return rows.length - 1;
}

/**
 * Resolve one DEPARTURE cell. `departure.time` is the fallback time for forms
 * where the employee left DEPARTURE empty and HR typed the actual time when
 * signing them out. The date is deliberately never printed here.
 *
 * `isDepartureRow` is still accepted so both columns share one call shape, but
 * it no longer affects the output.
 */
export function obDepartureDisplay(
  row: ObEntry | null | undefined,
  {
    hr,
  }: {
    hr?: HrFields;
    isDepartureRow?: boolean;
  },
): ObTimeOfDisplay {
  const departure = resolveExitSignoff(hr).departure;
  const typed = row?.time_departure?.trim() ?? "";
  const time = typed ? formatTime12h(typed) : departure.signed ? departure.time : "";

  return { time, date: "" };
}

/**
 * Resolve one RETURN cell. `arrival.time` is the fallback time for forms where
 * the employee left RETURN empty and HR typed the actual return time when
 * signing them back in.
 *
 * The date prints only when HR has signed the arrival AND that arrival date is
 * a different day from `dateOfOb`. Comparing the formatted values means the
 * stored ISO date and the header's `MM/DD/YYYY` cannot disagree.
 */
export function obReturnDisplay(
  row: ObEntry | null | undefined,
  {
    hr,
    isReturnRow,
    dateOfOb,
  }: {
    hr?: HrFields;
    isReturnRow: boolean;
    dateOfOb?: string | null | undefined;
  },
): ObTimeOfDisplay {
  const arrival = resolveExitSignoff(hr).arrival;
  const typed = row?.time_return?.trim() ?? "";
  const time = typed ? formatTime12h(typed) : arrival.signed ? arrival.time : "";
  const sameDay = arrival.date === formatMonthDayYear(dateOfOb);

  return { time, date: isReturnRow && arrival.signed && !sameDay ? arrival.date : "" };
}

/**
 * The raw 24-hour `HH:MM` HR typed for each leg, ready for an
 * `<input type="time">`. Empty until HR signs that leg, so the employee's form
 * can show the actual time inside the input instead of only in the preview.
 */
export function obDepartureInputTime(hr?: HrFields): string {
  return resolveExitSignoff(hr).departure.signed ? (hr?.departure_time ?? "") : "";
}

export function obReturnInputTime(hr?: HrFields): string {
  const arrival = resolveExitSignoff(hr).arrival;
  return arrival.signed ? hr?.arrival_time || stampTime(hr?.arrival_signed_at) : "";
}

/**
 * One string for consumers that cannot draw two styled lines. The Word
 * template runs with docxtemplater's `linebreaks: true`, so `\n` becomes a
 * real line break inside either TIME OF cell.
 */
function joinTimeOf({ time, date }: ObTimeOfDisplay): string {
  if (!date) return time;
  return time ? `${time}\n${date}` : date;
}

export function obDepartureText(display: ObTimeOfDisplay): string {
  return joinTimeOf(display);
}

export function obReturnText(display: ObTimeOfDisplay): string {
  return joinTimeOf(display);
}
