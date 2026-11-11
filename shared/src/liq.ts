/**
 * Statement of Liquidation maths — shared by the API (list totals) and the
 * sheet (grand total, balance, amount in words) so the two can never disagree.
 *
 * Amounts are stored as the text the user typed (the paper sheet shows
 * "150.00", not a locale-formatted number), so every read goes through
 * `liqAmount`, which tolerates commas and blanks.
 */
import type { LiqExpense } from "./types";

export const LIQ_AMOUNT_KEYS = [
  "transpo",
  "fuel_gas",
  "meals",
  "office_supplies",
  "load_accommodation",
  "entertainment_gifts",
  "other_expenses",
] as const;

export type LiqAmountKey = (typeof LIQ_AMOUNT_KEYS)[number];

/** "1,250.50" → 1250.5; "" / garbage → 0. */
export function liqAmount(value: string | null | undefined): number {
  const n = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** The sum of one expense line. */
export function liqLineTotal(entry: LiqExpense): number {
  return LIQ_AMOUNT_KEYS.reduce((sum, key) => sum + liqAmount(entry[key]), 0);
}

export type LiqTotals = {
  /** One total per expense line, in `entries` order. */
  lines: number[];
  /** One total per amount column. */
  columns: Record<LiqAmountKey, number>;
  grand: number;
};

export function liqTotals(entries: readonly LiqExpense[]): LiqTotals {
  const columns = Object.fromEntries(LIQ_AMOUNT_KEYS.map((key) => [key, 0])) as Record<
    LiqAmountKey,
    number
  >;
  const lines: number[] = [];
  let grand = 0;
  for (const entry of entries) {
    let line = 0;
    for (const key of LIQ_AMOUNT_KEYS) {
      const n = liqAmount(entry[key]);
      columns[key] += n;
      line += n;
    }
    lines.push(line);
    grand += line;
  }
  return { lines, columns, grand };
}

/** "1,250.50"; a zero renders as "-" when `dash` is set, like the paper sheet. */
export function liqMoney(n: number, dash = false): string {
  if (Math.abs(n) < 0.005) return dash ? "-" : "";
  const s = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${s})` : s;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Reads whatever a date cell may hold: an ISO date from a picker, the profile
 * default, `m/d/yy`, `m/d/yyyy`, `d-Mon-yy` or any string `Date` understands.
 * Returns null when it is not a date at all (free text is left alone).
 */
function parseLiqDate(value: string): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  let match: RegExpExecArray | null;

  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text))) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text))) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(match[1]) - 1, Number(match[2]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A date on the sheet, in the paper form's own spelling: `d-MMM-yy`
 * ("11-Nov-26") for DATE PREPARED, `mm/dd/yy` ("11/10/26") for an expense line.
 *
 * Accepts what the boxes actually hold — an ISO date from the date picker, the
 * profile default, `m/d/yy`, `m/d/yyyy` or `d-Mon-yy` — and returns the input
 * untouched when it is not a date, so free text is never mangled on its way to
 * paper.
 */
export function liqDate(value: string, long = true): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const date = parseLiqDate(text);
  if (!date) return text;
  const two = (n: number) => String(n).padStart(2, "0");
  return long
    ? `${date.getDate()}-${MONTHS[date.getMonth()]}-${two(date.getFullYear() % 100)}`
    : `${two(date.getMonth() + 1)}/${two(date.getDate())}/${two(date.getFullYear() % 100)}`;
}

/**
 * The `YYYY-MM-DD` a native `<input type="date">` needs, converted from any of
 * the spellings the sheet stores. "" when the cell does not hold a date, which
 * is what the picker shows for an empty box.
 */
export function liqIsoDate(value: string): string {
  const date = parseLiqDate(value);
  if (!date) return "";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Today, spelled the way DATE PREPARED is (`d-MMM-yy`), in the user's timezone. */
export function liqToday(now: Date = new Date()): string {
  return liqDate(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`,
  );
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n: number): string {
  let s = "";
  if (n >= 100) {
    s += `${ONES[Math.floor(n / 100)]} Hundred`;
    n %= 100;
    if (n) s += " ";
  }
  if (n >= 20) {
    s += TENS[Math.floor(n / 10)];
    if (n % 10) s += `-${ONES[n % 10]}`;
  } else if (n) {
    s += ONES[n];
  }
  return s;
}

function words(n: number): string {
  if (n === 0) return "Zero";
  const units: [number, string][] = [
    [1e12, "Trillion"],
    [1e9, "Billion"],
    [1e6, "Million"],
    [1e3, "Thousand"],
  ];
  const parts: string[] = [];
  for (const [size, label] of units) {
    if (n >= size) {
      parts.push(`${under1000(Math.floor(n / size))} ${label}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(under1000(n));
  return parts.join(" ");
}

/** The sheet's AMOUNT IN WORDS box (the old SpellNumber macro). */
export function liqAmountInWords(total: number, currency: string): string {
  const usd = currency === "DOLLARS";
  const big = usd ? "Dollars" : "Pesos";
  const one = usd ? "Dollar" : "Peso";
  const small = usd ? "Cents" : "Centavos";
  const cents = Math.round(Math.abs(total) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  if (cents === 0) return `No ${big} Only`;
  let s = whole === 0 ? "" : `${words(whole)} ${whole === 1 ? one : big}`;
  if (fraction) {
    s += `${s ? " and " : ""}${String(fraction).padStart(2, "0")}/100${
      whole === 0 ? ` ${small}` : ""
    }`;
  }
  return `${s} Only`;
}
