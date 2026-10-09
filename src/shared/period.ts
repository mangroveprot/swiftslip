import type { Period, PresetPeriod } from "./types";

export const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

export const PERIOD_LABELS: Record<PresetPeriod, string> = {
  first_half: "Days 1 - 15",
  second_half: "Days 16 - end of month",
  full: "Whole month",
};

export function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

/** The month after `month`/`year` (month is 1-indexed). */
export function nextMonthOf(month: number, year: number) {
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

export function customPeriod(
  startDay: number,
  endDay: number,
  month: number,
  year: number,
): Period {
  const last = daysInMonth(month, year);
  const start = Math.max(1, Math.min(Math.trunc(startDay), last));
  const end = Math.max(start, Math.min(Math.trunc(endDay), last));
  return `custom:${start}-${end}`;
}

/**
 * A range that starts on `startDay` of `month` and ends on `endDay` of the
 * FOLLOWING month, e.g. 09/25 to 10/08 is `span:25-8`. `endDay` is always
 * smaller than `startDay`, so a day number never repeats and rows can stay
 * keyed by day number.
 */
export function spanPeriod(startDay: number, endDay: number, month: number, year: number): Period {
  const last = daysInMonth(month, year);
  const start = Math.max(2, Math.min(Math.trunc(startDay), last));
  const next = nextMonthOf(month, year);
  const end = Math.max(
    1,
    Math.min(Math.trunc(endDay), daysInMonth(next.month, next.year), start - 1),
  );
  return `span:${start}-${end}`;
}

/** { start, end } for a `span:` period (end is a day of the next month), else null. */
export function parseSpan(period: Period) {
  const m = /^span:(\d+)-(\d+)$/.exec(period);
  return m ? { start: Number(m[1]), end: Number(m[2]) } : null;
}

/**
 * For presets and `custom:` periods. For a `span:` period `end` is a day of the
 * next month, so do not loop start..end; use `daysForPeriod` instead.
 */
export function periodRange(period: Period, month: number, year: number) {
  const last = daysInMonth(month, year);
  const span = parseSpan(period);
  if (span) return { start: span.start, end: span.end };
  const custom = /^custom:(\d+)-(\d+)$/.exec(period);
  if (custom) {
    const start = Math.max(1, Math.min(Number(custom[1]), last));
    const end = Math.max(start, Math.min(Number(custom[2]), last));
    return { start, end };
  }
  return {
    start: period === "second_half" ? 16 : 1,
    end: period === "first_half" ? Math.min(15, last) : last,
  };
}

/**
 * The real calendar date a row's day number belongs to. In a `span:` period the
 * days before the start day fall in the following month.
 */
export function dateOfDay(day: number, period: Period, month: number, year: number) {
  const span = parseSpan(period);
  if (span && day < span.start) {
    const next = nextMonthOf(month, year);
    return { day, month: next.month, year: next.year };
  }
  return { day, month, year };
}

/** Zero-padded short date, e.g. 09/10/26 */
export function formatShortDate(day: number, month: number, year: number) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const yy = String(year).slice(-2).padStart(2, "0");
  return `${mm}/${dd}/${yy}`;
}

/** Short date for a row of the sheet, e.g. 10/01/26 for day 1 of a 09/25-10/08 span. */
export function formatDayInPeriod(day: number, period: Period, month: number, year: number) {
  const d = dateOfDay(day, period, month, year);
  return formatShortDate(d.day, d.month, d.year);
}

/** Period as a date range for the MONTH header, e.g. 09/25/26 - 10/08/26 */
export function formatPeriodDateRange(period: Period, month: number, year: number) {
  const span = parseSpan(period);
  if (span) {
    return `${formatDayInPeriod(span.start, period, month, year)} - ${formatDayInPeriod(span.end, period, month, year)}`;
  }
  const { start, end } = periodRange(period, month, year);
  return `${formatShortDate(start, month, year)} - ${formatShortDate(end, month, year)}`;
}

export function periodLabel(period: Period, month: number, year: number) {
  if (period in PERIOD_LABELS) return PERIOD_LABELS[period as PresetPeriod];
  if (parseSpan(period)) return formatPeriodDateRange(period, month, year);
  const { start, end } = periodRange(period, month, year);
  return `Days ${start} - ${end}`;
}

// JS Date months are 0-indexed; `month` here is 1-indexed (1 = January).
export function isSunday(day: number, month: number, year: number): boolean {
  return new Date(year, month - 1, day).getDay() === 0;
}

/** Day numbers shown on the sheet, in order. A span gives e.g. 25..30 then 1..8. */
export function daysForPeriod(period: Period, month: number, year: number): number[] {
  const out: number[] = [];
  const span = parseSpan(period);
  if (span) {
    const last = daysInMonth(month, year);
    for (let d = span.start; d <= last; d += 1) out.push(d);
    for (let d = 1; d <= span.end; d += 1) out.push(d);
    return out;
  }
  const { start, end } = periodRange(period, month, year);
  for (let d = start; d <= end; d += 1) out.push(d);
  return out;
}

/**
 * How a stored `YYYY-MM-DD` date reads on screen: `10/03/2026` — slashes,
 * month and day always two digits. `2026-10-03` is the storage/`<input
 * type="date">` format, never what a finished form should print.
 *
 * Anything that isn't a complete ISO date ("" while unset, a hand-typed value)
 * comes back untouched, so an unusual date is displayed rather than rewritten.
 */
export function formatMonthDayYear(value: string | null | undefined): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  return iso ? `${iso[2]}/${iso[3]}/${iso[1]}` : (value ?? "");
}

export function isPeriod(value: string): value is Period {
  return Object.hasOwn(PERIOD_LABELS, value) || /^(custom|span):\d+-\d+$/.test(value);
}
