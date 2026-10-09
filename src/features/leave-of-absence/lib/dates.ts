/**
 * Date rules for the LOA form.
 *
 * - "Number of Days Applied" counts the days from `from` to `to` INCLUSIVE,
 *   minus every Sunday (Saturdays and holidays count). A single day counts as
 *   1 — unless it is a Sunday, which counts as 0.
 * - "To report back for work on" is the day after `to`, pushed to Monday when
 *   that lands on a Sunday.
 * - Both are prefills only: the fields stay free text and editable, so a
 *   manual value like "4 hours" survives until the dates change again.
 */

import type { LoaForm } from "@/shared/types";

/** `YYYY-MM-DD` for the user's local day. Re-exported from the shared draft
 *  helpers so there is one implementation of it across the app. */
export { localToday } from "@/lib/form-draft";

/** Parse a `YYYY-MM-DD` string as a local Date (null when unusable). */
function parse(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Reject impossible dates like 2026-02-31 (the Date constructor rolls them over).
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/**
 * Inclusive day count from `from` to `to`, Sundays excluded.
 * Returns `null` when either date is missing/invalid or `from` is after `to`.
 */
export function computeLoaDays(from: string, to: string): number | null {
  const a = parse(from);
  const b = parse(to);
  if (!a || !b || a.getTime() > b.getTime()) return null;
  let days = 0;
  for (let d = new Date(a); d.getTime() <= b.getTime(); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) days += 1;
  }
  return days;
}

/** The day after `to`, moved to Monday when it lands on a Sunday ("" if unusable). */
export function computeReportBack(to: string): string {
  const b = parse(to);
  if (!b) return "";
  const d = new Date(b);
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Refresh the derived fields after a change to `date_from` / `date_to`:
 * both dates present and ordered → recompute `days_applied` and
 * `report_back_date` (overwriting whatever was there, manual edits included);
 * an inverted range keeps the previous values (the form shows a warning
 * instead of silently swapping); a half-cleared range clears both — they had
 * no anchor left. Any other change is returned untouched.
 */
export function recomputeDerived(form: LoaForm): LoaForm {
  if (form.date_from && form.date_to && form.date_from > form.date_to) return form;
  if (form.date_from && form.date_to) {
    return {
      ...form,
      days_applied: String(computeLoaDays(form.date_from, form.date_to) ?? ""),
      report_back_date: computeReportBack(form.date_to),
    };
  }
  return { ...form, days_applied: "", report_back_date: "" };
}
