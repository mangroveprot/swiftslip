export type PresetPeriod = "first_half" | "second_half" | "full";
export type Period = PresetPeriod | `custom:${number}-${number}`;
export type Role = "admin" | "user";

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

export function periodRange(period: Period, month: number, year: number) {
  const last = daysInMonth(month, year);
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

export function periodLabel(period: Period, month: number, year: number) {
  if (period in PERIOD_LABELS) return PERIOD_LABELS[period as PresetPeriod];
  const { start, end } = periodRange(period, month, year);
  return `Days ${start} - ${end}`;
}

// JS Date months are 0-indexed; `month` here is 1-indexed (1 = January).
export function isSunday(day: number, month: number, year: number): boolean {
  return new Date(year, month - 1, day).getDay() === 0;
}

export function daysForPeriod(period: Period, month: number, year: number): number[] {
  const { start, end } = periodRange(period, month, year);
  const out: number[] = [];
  for (let d = start; d <= end; d += 1) out.push(d);
  return out;
}

/** Zero-padded short date, e.g. 09/10/26 */
export function formatShortDate(day: number, month: number, year: number) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const yy = String(year).slice(-2).padStart(2, "0");
  return `${mm}/${dd}/${yy}`;
}

/** Period as a date range for the MONTH header, e.g. 09/10/26 - 09/25/26 */
export function formatPeriodDateRange(period: Period, month: number, year: number) {
  const { start, end } = periodRange(period, month, year);
  return `${formatShortDate(start, month, year)} - ${formatShortDate(end, month, year)}`;
}

export type DtrEntry = {
  day: number;
  time_in: string;
  time_out: string;
  schedule: string;
  remarks: string;
};

export type DtrHeader = {
  emp_no: string;
  name: string;
  designation: string;
  area: string;
  month: number;
  year: number;
  period: Period;
  certified_by: string;
  /** Data URL (PNG) of the employee signature drawing or upload. */
  employee_signature: string;
};

export type DtrTemplate = {
  title: string;
  org_name: string;
  employee_signature_label: string;
  certified_by_label: string;
  certifier_signature_label: string;
  default_schedule: string;
  default_period: Period;
  columns: { in: string; out: string; schedule: string; remarks: string };
};
