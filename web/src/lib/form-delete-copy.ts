/**
 * The words for deleting a form: what the confirmation names and what the
 * success toast confirms.
 *
 * A form is named by its own key date, never by the person. Every row in a
 * personal list carries the same name, so `Deleted "JUAN DELA CRUZ"` says
 * nothing about which form went; the date on the form does. Each form type is
 * named with the field a reader would look for:
 *
 *   OB     date of the OB              "OB form dated 10/03/2026"
 *   LOA    inclusive dates             "LOA form for 10/01/2026 - 10/03/2026"
 *   COS    effectivity date(s)         "COS form effective 10/03/2026"
 *   OT     date(s) of OT work          "OT form for 10/03/2026"
 *   LIQ    date prepared               "liquidation report dated 10/03/2026"
 *   DTR    the days the cut-off covers "DTR for 11/01/2026 - 11/15/2026"
 *
 * A form whose date is still blank (a draft) falls back to its bare name, so
 * the sentence stays a sentence: "Deleted OT form".
 */
import {
  daysInMonth,
  formatMonthDayYear,
  nextMonthOf,
  parseSpan,
  periodRange,
} from "@swiftslip/shared/period";
import type { Period } from "@swiftslip/shared/types";

/**
 * The two lines a delete flow needs, always in agreement: the confirmation
 * asks `title` and the toast afterwards says `toast`.
 */
export type FormDeleteCopy = {
  /** `Delete the OB form dated 10/03/2026?` */
  title: string;
  /** `Deleted OB form dated 10/03/2026` */
  toast: string;
};

/** `Delete the <subject>?` plus `Deleted <subject>`, from one phrase. */
export function formDeleteCopy(subject: string): FormDeleteCopy {
  return { title: `Delete the ${subject}?`, toast: `Deleted ${subject}` };
}

/** "10/03/2026", or "10/01/2026 - 10/03/2026" when the two ends differ. */
function dateSpan(from: string | null | undefined, to: string | null | undefined): string {
  const start = formatMonthDayYear(from);
  const end = formatMonthDayYear(to);
  if (!start) return end;
  if (!end || end === start) return start;
  return `${start} - ${end}`;
}

/**
 * The dates a form covers, listed: "10/03/2026", "10/03/2026 and 10/09/2026",
 * or "10/03/2026, 10/05/2026 and 2 more dates" past three. A range would be
 * wrong here — two OT dates a week apart do not cover the days between them.
 */
function dateList(dates: string[]): string {
  const shown = (dates.length > 3 ? dates.slice(0, 2) : dates).map(formatMonthDayYear);
  if (!shown.length) return "";
  const rest = dates.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more dates`;
  const last = shown[shown.length - 1] ?? "";
  if (shown.length === 1) return last;
  return `${shown.slice(0, -1).join(", ")} and ${last}`;
}

/** `YYYY-MM-DD`, the shape `formatMonthDayYear` reads. */
function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "OB form dated 10/03/2026", or "OB form" while `date_of_ob` is blank. */
export function obSubject(form: { date_of_ob: string }): string {
  const date = formatMonthDayYear(form.date_of_ob);
  return date ? `OB form dated ${date}` : "OB form";
}

/**
 * "LOA form for 10/01/2026 - 10/03/2026", the dates the leave covers. Only the
 * end date typed is a leave that finishes that day, not a one-day leave.
 */
export function loaSubject(form: { date_from: string | null; date_to: string | null }): string {
  const from = formatMonthDayYear(form.date_from);
  const to = formatMonthDayYear(form.date_to);
  if (from) return `LOA form for ${!to || to === from ? from : `${from} - ${to}`}`;
  return to ? `LOA form until ${to}` : "LOA form";
}

/**
 * "COS form effective 10/03/2026". A change of schedule carries one effectivity
 * date per schedule row, so several are listed (`effective on A and B`), never
 * flattened into a range that would claim the days between them.
 */
export function cosSubject(form: { effectivity_dates?: string[] }): string {
  const dates = (form.effectivity_dates ?? []).filter(Boolean).sort();
  if (!dates.length) return "COS form";
  return dates.length === 1
    ? `COS form effective ${dateList(dates)}`
    : `COS form effective on ${dateList(dates)}`;
}

/** "OT form for 10/03/2026", the date(s) the overtime was actually worked. */
export function otSubject(form: { ot_dates?: string[] }): string {
  const dates = (form.ot_dates ?? []).filter(Boolean).sort();
  return dates.length ? `OT form for ${dateList(dates)}` : "OT form";
}

/** "liquidation report dated 10/03/2026", the date it was prepared. */
export function liqSubject(form: { date_prepared: string }): string {
  const date = formatMonthDayYear(form.date_prepared);
  return date ? `liquidation report dated ${date}` : "liquidation report";
}

/**
 * "DTR for 11/01/2026 - 11/15/2026": the days the cut-off actually covers, so
 * the sentence names the sheet and not the employee. A `span:` period ends in
 * the month after the one it starts in, and keeps its day numbers when the
 * month is switched, so both ends are clamped to a day that exists.
 */
export function dtrSubject(form: { month: number; year: number; period: string }): string {
  const month = Number(form.month);
  const year = Number(form.year);
  if (!(month >= 1 && month <= 12) || !(year > 0)) return "DTR";

  const period = form.period as Period;
  const { start, end } = periodRange(period, month, year);
  const endsIn = parseSpan(period) ? nextMonthOf(month, year) : { month, year };
  const first = Math.min(start, daysInMonth(month, year));
  const last = Math.min(end, daysInMonth(endsIn.month, endsIn.year));
  const span = dateSpan(isoDate(year, month, first), isoDate(endsIn.year, endsIn.month, last));
  return span ? `DTR for ${span}` : "DTR";
}
