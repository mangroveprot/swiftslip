import { FORM_TYPES, type FormEvent, type FormKind } from "@swiftslip/shared/forms";

export type ChartGranularity = "week" | "month";

export type FormTypeRow = {
  key: FormKind;
  label: string;
  count: number;
  previous: number;
  delta: number;
};

export type ChartPoint = {
  label: string;
  count: number;
  /** The final bucket is the current week / month, still in progress. */
  current: boolean;
};

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

/** Monday-based week start, in the viewer's local timezone. */
function startOfWeek(value: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function eventDate(event: FormEvent) {
  const date = new Date(event.created_at);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inMonth(event: FormEvent, start: Date, end: Date) {
  const date = eventDate(event);
  return date ? date >= start && date < end : false;
}

/** Current-month and previous-month counts for each form type, biggest first. */
export function formTypeBreakdown(events: FormEvent[], now = new Date()): FormTypeRow[] {
  const thisMonth = startOfMonth(now);
  const nextMonth = addMonths(thisMonth, 1);
  const lastMonth = addMonths(thisMonth, -1);

  return FORM_TYPES.map((type) => {
    const count = events.filter(
      (event) => event.type === type.key && inMonth(event, thisMonth, nextMonth),
    ).length;
    const previous = events.filter(
      (event) => event.type === type.key && inMonth(event, lastMonth, thisMonth),
    ).length;
    return {
      key: type.key,
      label: type.label,
      count,
      previous,
      delta: count - previous,
    };
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Total forms filed this month and last month, for the header stat. */
export function formsThisMonth(events: FormEvent[], now = new Date()) {
  const thisMonth = startOfMonth(now);
  const nextMonth = addMonths(thisMonth, 1);
  const lastMonth = addMonths(thisMonth, -1);
  return {
    current: events.filter((event) => inMonth(event, thisMonth, nextMonth)).length,
    previous: events.filter((event) => inMonth(event, lastMonth, thisMonth)).length,
  };
}

/**
 * The chart's buckets. Weekly shows the last eight Monday-based weeks; monthly
 * shows the last six calendar months. Both include the current, partial bucket
 * and flag it so the bar can be drawn lighter.
 */
export function chartSeries(
  events: FormEvent[],
  granularity: ChartGranularity,
  kind: FormKind | "all",
  now = new Date(),
): ChartPoint[] {
  const filtered = kind === "all" ? events : events.filter((event) => event.type === kind);

  if (granularity === "week") {
    const thisWeek = startOfWeek(now);
    const firstWeek = new Date(thisWeek);
    firstWeek.setDate(firstWeek.getDate() - 7 * 7);

    return Array.from({ length: 8 }, (_, index) => {
      const start = new Date(firstWeek);
      start.setDate(start.getDate() + index * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const count = filtered.filter((event) => {
        const date = eventDate(event);
        return date ? date >= start && date < end : false;
      }).length;
      return {
        label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count,
        current: index === 7,
      };
    });
  }

  const thisMonth = startOfMonth(now);
  const firstMonth = addMonths(thisMonth, -5);
  const currentYear = thisMonth.getFullYear();

  return Array.from({ length: 6 }, (_, index) => {
    const start = addMonths(firstMonth, index);
    const end = addMonths(start, 1);
    const count = filtered.filter((event) => {
      const date = eventDate(event);
      return date ? date >= start && date < end : false;
    }).length;
    const sameYear = start.getFullYear() === currentYear;
    return {
      label: start.toLocaleDateString("en-US", {
        month: "short",
        ...(sameYear ? {} : { year: "2-digit" as const }),
      }),
      count,
      current: index === 5,
    };
  });
}

/** "+4", "−2", or "No change" — the delta beside a form type. */
export function deltaLabel(delta: number) {
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
}

/** "12 more than last month", "3 fewer", or "Same as last month". */
export function monthComparison(current: number, previous: number) {
  const delta = current - previous;
  if (delta === 0) return "Same as last month";
  if (delta > 0) return `${delta} more than last month`;
  return `${Math.abs(delta)} fewer than last month`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
