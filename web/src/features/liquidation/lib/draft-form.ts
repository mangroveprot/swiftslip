import { EMPTY_PROFILE, formDepartment } from "@/lib/form-draft";
import { LIQ_AMOUNT_KEYS, liqToday } from "@swiftslip/shared/liq";
import type { LiqExpense, LiqForm } from "@swiftslip/shared/types";

/**
 * The most expense lines a form can hold (and the child table stores). The
 * printed sheet grows a row for every line in use, so this is also the cap.
 */
export const LIQ_LINES = 15;

/**
 * The rows the blank paper form shows. The sheet never prints fewer than this,
 * so an ordinary one- or two-line filing still looks like the paper form, and
 * a longer one simply grows more rows (up to LIQ_LINES).
 */
export const LIQ_MIN_LINES = 4;

/** An empty expense line at `idx` (1-based, like the paper form). */
export function emptyLiqEntry(idx: number): LiqExpense {
  return {
    idx,
    expense_date: "",
    description: "",
    transpo: "",
    fuel_gas: "",
    meals: "",
    office_supplies: "",
    load_accommodation: "",
    entertainment_gifts: "",
    other_expenses: "",
  };
}

/** Any typed value at all, decides whether a line is in use. */
export function liqEntryHasData(entry: LiqExpense | undefined): boolean {
  if (!entry) return false;
  return (
    entry.expense_date.trim() !== "" ||
    entry.description.trim() !== "" ||
    LIQ_AMOUNT_KEYS.some((key) => entry[key].trim() !== "")
  );
}

/** The last line in use (1-based), or 0 when every line is still blank. */
export function lastFilledLiqLine(entries: readonly LiqExpense[]): number {
  return entries
    .slice(0, LIQ_LINES)
    .reduce((last, entry, i) => (liqEntryHasData(entry) ? i + 1 : last), 0);
}

/** Exactly 15 lines, in idx order, fills in whatever the API did not return. */
export function normalizeLiqEntries(entries: readonly LiqExpense[] | undefined): LiqExpense[] {
  const byIdx = new Map((entries ?? []).map((entry) => [entry.idx, entry]));
  return Array.from({ length: LIQ_LINES }, (_, i) => byIdx.get(i + 1) ?? emptyLiqEntry(i + 1));
}

/**
 * The form a fresh draft starts from, built in the browser instead of by the
 * server. Mirrors `createFromProfile` exactly, so the starting snapshot doubles
 * as the baseline the editor compares against to spot real user input.
 */
export function buildDraftLiqForm(profile = EMPTY_PROFILE): LiqForm {
  return {
    department: formDepartment(profile),
    // The SECTION/LOCATION box: the office / branch, same source the server uses.
    section_location: profile.area || profile.designation,
    cost_center: "",
    date_prepared: liqToday(),
    trip_to: "",
    purpose: "",
    currency: "PESOS",
    prepared_by: profile.full_name,
    approved_by: profile.supervisor,
    employee_signature: profile.signature,
    attachment_approved: false,
    approved_via_viber: false,
  };
}

/** The 15 blank lines a draft starts with. */
export function buildDraftLiqEntries(): LiqExpense[] {
  return Array.from({ length: LIQ_LINES }, (_, i) => emptyLiqEntry(i + 1));
}
