import { liqAmountInWords, liqDate, liqMoney, liqTotals } from "@swiftslip/shared/liq";
import type { LiqExpense, LiqForm } from "@swiftslip/shared/types";

import { lastFilledLiqLine, LIQ_LINES, LIQ_MIN_LINES } from "../lib/draft-form";

/** The sheet's authored width — a 23-column table, like the paper form. */
export const LIQ_SHEET_WIDTH = 1204;

/** The white gutter the preview/print wrapper keeps around the 1204px sheet. */
export const LIQ_SHEET_GUTTER = 18;

/** The amount columns, in sheet order. */
const EXPENSE_KEYS = [
  "transpo",
  "fuel_gas",
  "meals",
  "office_supplies",
  "load_accommodation",
  "entertainment_gifts",
  "other_expenses",
] as const satisfies readonly (keyof LiqExpense)[];

/** TRIP TO is stored as a comma list; an older row may use ";" or line breaks. */
function tripText(value: string) {
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * The TRIP TO cell is only five columns wide (~227px). The paper shrinks a long
 * destination list to keep it inside the box, so the size follows the length:
 * legible for "Dipolog", small for a whole-day run of showrooms.
 */
function tripFontSize(text: string) {
  if (text.length > 120) return "5.5px";
  if (text.length > 90) return "6.2px";
  if (text.length > 65) return "6.9px";
  if (text.length > 40) return "7.5px";
  return "8.5px";
}

/**
 * The GN 238 (REV 03/00) Statement of Liquidation, reproduced cell-for-cell.
 *
 * The sheet is print/read-only: the editor's card is where values are typed, so
 * the same inputs never exist twice. Every computed box (line totals, column
 * totals, grand total, amount in words, balance) runs through `@swiftslip/shared/liq`
 * — the API's list totals use the same maths.
 *
 * The blank paper form has four expense rows. The sheet prints at least those
 * four and grows a row for every line in use, up to the 15 the child table
 * stores (the header and the two names are live as well).
 */
export function LiqSheet({
  sheetId,
  form,
  entries,
  className,
}: {
  sheetId?: string | undefined;
  form: LiqForm;
  entries: LiqExpense[];
  className?: string;
}) {
  const totals = liqTotals(entries);
  const lineTotal = (idx: number) => liqMoney(totals.lines[idx - 1] ?? 0, idx === LIQ_LINES);
  const columnTotal = (key: keyof typeof totals.columns) => liqMoney(totals.columns[key], true);
  // GN 238 prints BALANCE DUE EMPLOYEE as a negative when the company still
  // owes the employee: with no advances recorded the reference sheet shows
  // "(150.00)". The TOTAL row above it stays blank — it is the total of the
  // advances listed in the DATE / OFFICE rows, not the expense total.
  const balanceDueEmployee = liqMoney(-totals.grand, true);
  // The paper's four rows are the floor — a longer filing grows a row per line
  // in use, and the blank rows at the end are dropped.
  const printedRows = Math.max(LIQ_MIN_LINES, lastFilledLiqLine(entries));
  const printed = entries.slice(0, printedRows);

  return (
    <div id={sheetId} className={`liq-sheet liq-print-sheet${className ? ` ${className}` : ""}`}>
      <table>
        <colgroup>
          <col style={{ width: 79 }} />
          <col style={{ width: 37 }} />
          <col style={{ width: 37 }} />
          <col style={{ width: 37 }} />
          <col style={{ width: 37 }} />
          <col style={{ width: 65 }} />
          <col style={{ width: 105 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 68 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 42 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: 37 }} />
          <col style={{ width: 61 }} />
          <col style={{ width: 23 }} />
          <col style={{ width: 82 }} />
          <col style={{ width: 41 }} />
          <col style={{ width: 65 }} />
        </colgroup>
        <tbody>
          {/* Title + form number ------------------------------------------- */}
          <tr style={{ height: 20 }}>
            <td className="c1" colSpan={4}>
              STATEMENT OF LIQUIDATION
            </td>
            <td className="c2" />
            <td className="c3" colSpan={17} />
            <td className="c4" />
          </tr>
          <tr style={{ height: 13.3 }}>
            <td className="c5" colSpan={3}>
              GN 238 (REV 03/00)
            </td>
            <td className="c3" colSpan={19} />
            <td className="c4" />
          </tr>

          {/* Header labels ------------------------------------------------- */}
          <tr style={{ height: 13 }}>
            <td className="c6">DEPARTMENT</td>
            <td className="c7" />
            <td className="c7" />
            <td className="c8" />
            <td className="c9" />
            <td className="c8">SECTION/LOCATION</td>
            <td className="c8" />
            <td className="c8" />
            <td className="c7" />
            <td className="c7" />
            <td className="c7" />
            <td className="c8" />
            <td className="c10" />
            <td className="c8">COST CENTER TO BE CHARGED</td>
            <td className="c8" />
            <td className="c8" />
            <td className="c8" />
            <td className="c8" />
            <td className="c10" />
            <td className="c8">DATE PREPARED</td>
            <td className="c8" />
            <td className="c8" />
            <td className="c10" />
          </tr>
          <tr style={{ height: 20 }}>
            <td className="c12" colSpan={5}>
              {form.department}
            </td>
            <td className="c12" colSpan={8}>
              {form.section_location}
            </td>
            <td className="c12" colSpan={6}>
              {form.cost_center}
            </td>
            <td className="c12" colSpan={4}>
              {liqDate(form.date_prepared)}
            </td>
          </tr>

          {/* Trip to / purpose / currency ---------------------------------- */}
          <tr style={{ height: 13.3 }}>
            <td className="c13">TRIP TO:</td>
            <td className="c3" />
            <td className="c3" />
            <td className="c3" />
            <td className="c14" />
            <td className="c6">PURPOSE:</td>
            <td className="c15" colSpan={13} rowSpan={2}>
              {form.purpose}
            </td>
            <td className="c10" colSpan={4}>
              REPORT IN
            </td>
          </tr>
          <tr style={{ height: 28 }}>
            <td className="c16" colSpan={5}>
              <span className="liq-trip" style={{ fontSize: tripFontSize(tripText(form.trip_to)) }}>
                {tripText(form.trip_to)}
              </span>
            </td>
            <td className="c17" />
            <td className="c78" colSpan={4}>
              <span className="liq-report">
                <span className={`liq-ck${form.currency === "PESOS" ? " on" : ""}`} />
                {" PESOS "}
                <span className={`liq-ck liq-ck-gap${form.currency === "DOLLARS" ? " on" : ""}`} />
                {" DOLLARS"}
              </span>
            </td>
          </tr>

          {/* Expense column headings -------------------------------------- */}
          <tr style={{ height: 13.3 }}>
            <td className="c21" rowSpan={4}>
              DATE
            </td>
            <td className="c21" colSpan={6} rowSpan={4}>
              EXPENSES
            </td>
            <td className="c22" colSpan={2} rowSpan={4}>
              TRANSPO
            </td>
            <td className="c22" colSpan={2} rowSpan={4}>
              FUELS/GAS
            </td>
            <td className="c23" colSpan={2} rowSpan={4}>
              MEALS
            </td>
            <td className="c22" colSpan={2} rowSpan={4}>
              OFFICE SUPPLIES
            </td>
            <td className="c23" colSpan={2} rowSpan={4}>
              LOAD / ACCOMODATION
            </td>
            <td className="c23" colSpan={2} rowSpan={4}>
              ENTERTAINMENT &amp; GIFTS
            </td>
            <td className="c22" colSpan={2} rowSpan={4}>
              OTHER BUSINESS EXPENSES
            </td>
            <td className="c24" colSpan={2} rowSpan={4}>
              GRAND TOTAL
            </td>
          </tr>
          <tr style={{ height: 13.3 }} />
          <tr style={{ height: 13.3 }} />
          <tr style={{ height: 12 }} />

          {/* One row per expense line. The first prints taller (34px) like the
              paper form, the rest 26.8px; the blank form's four rows are always
              there and a longer filing grows a row for each line in use. */}
          {printed.map((entry, index) => (
            <tr key={entry.idx} style={{ height: index === 0 ? 34 : 29 }}>
              <td className="c25">{liqDate(entry.expense_date, false)}</td>
              <td className="c26" colSpan={6}>
                {entry.description}
              </td>
              {EXPENSE_KEYS.map((key) => (
                <td key={key} className="c25" colSpan={2}>
                  {entry[key]}
                </td>
              ))}
              <td className="c27" colSpan={2}>
                {lineTotal(entry.idx)}
              </td>
            </tr>
          ))}

          {/* Column totals ------------------------------------------------- */}
          <tr style={{ height: 24 }}>
            <td className="c30" colSpan={6}>
              TOTAL
            </td>
            <td className="c31">
              <svg
                className="arrow"
                style={{ left: 28, top: 9 }}
                width={24}
                height={8}
                viewBox="0 0 24 8"
              >
                <line x1="0" y1="4" x2="21" y2="4" />
                <path d="M24 4L17 .5V7.5Z" />
              </svg>
            </td>
            <td className="c32" colSpan={2}>
              {columnTotal("transpo")}
            </td>
            <td className="c32" colSpan={2}>
              {columnTotal("fuel_gas")}
            </td>
            <td className="c32" colSpan={2}>
              {columnTotal("meals")}
            </td>
            <td className="c32" colSpan={2}>
              {columnTotal("office_supplies")}
            </td>
            <td className="c32" colSpan={2}>
              {columnTotal("load_accommodation")}
            </td>
            <td className="c32" colSpan={2}>
              {columnTotal("entertainment_gifts")}
            </td>
            <td className="c32" colSpan={2}>
              {columnTotal("other_expenses")}
            </td>
            <td className="c32" colSpan={2}>
              {liqMoney(totals.grand, true)}
            </td>
          </tr>

          {/* ADVANCES / APPROVALS / ACCOUNTING DISTRIBUTION ----------------
              One shared grid for the three lower boxes, so every horizontal
              rule runs edge to edge and the section bands are cells of the same
              row. The columns are: advances date/place/label/value, approvals
              label/value, then accounting element/center/emp no/amount. */}
        </tbody>
      </table>

      <table className="liq-bottom">
        <colgroup>
          <col style={{ width: 79 }} />
          <col style={{ width: 351 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 115 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 163 }} />
          <col style={{ width: 92 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 45 }} />
          <col style={{ width: 57 }} />
        </colgroup>
        <tbody>
          {/* Section bands ----------------------------------------------- */}
          <tr style={{ height: 18 }}>
            <td className="lb-band" colSpan={4}>
              ADVANCES AND BALANCES DUE
            </td>
            <td className="lb-band" colSpan={2}>
              APPROVALS AND PAYMENT
            </td>
            <td className="lb-band" colSpan={4}>
              ACCOUNTING DISTRIBUTION
            </td>
          </tr>

          {/* Column headings --------------------------------------------- */}
          <tr style={{ height: 17 }}>
            <td className="lb-label lb-center">DATE</td>
            <td className="lb-label">OFFICE AND LOCATION</td>
            <td className="lb-label lb-center" colSpan={2}>
              AMOUNT
            </td>
            <td className="lb-label lb-center" colSpan={2}>
              PLEASE PRINT NAME &amp; SIGN
            </td>
            <td className="lb-label lb-center" rowSpan={2}>
              COST ELEMENT
            </td>
            <td className="lb-label lb-center" rowSpan={2}>
              COST CENTER
            </td>
            <td className="lb-label lb-center">EMP NO</td>
            <td className="lb-label lb-center" rowSpan={2}>
              AMOUNT
            </td>
          </tr>

          {/* Blank advances, the signature box, and the EMP NO stamp ------ */}
          <tr style={{ height: 16 }}>
            <td />
            <td />
            <td colSpan={2} />
            <td className="lb-name" colSpan={2} rowSpan={4}>
              {form.employee_signature ? (
                <img src={form.employee_signature} alt="" className="lb-sign" />
              ) : null}
              <span className="lb-name-line">{form.prepared_by}</span>
            </td>
            <td className="lb-empno">XXXXXXX</td>
          </tr>
          <tr style={{ height: 16 }}>
            <td />
            <td />
            <td colSpan={2} />
            <td className="lb-acct">FUEL</td>
            <td />
            <td />
            <td />
          </tr>

          {/* AMOUNT IN WORDS / totals, then the approval rows ------------ */}
          <tr style={{ height: 16 }}>
            <td className="lb-words" colSpan={2} rowSpan={5}>
              <span className="lb-words-label">AMOUNT IN WORDS</span>
              <span className="lb-words-value">
                {liqAmountInWords(totals.grand, form.currency)}
              </span>
            </td>
            <td className="lb-total-label">TOTAL</td>
            <td className="lb-amount" />
            <td className="lb-acct">TRANSPO</td>
            <td />
            <td />
            <td />
          </tr>
          <tr style={{ height: 16 }}>
            <td className="lb-total-label">ADVANCES</td>
            <td className="lb-amount" />
            <td className="lb-acct">MEALS</td>
            <td />
            <td />
            <td />
          </tr>

          {/* APPROVED BY is one tall signing cell on the paper: the tiny label
              and the blue note sit above the name, which prints in the same
              bold size as the employee's. It spans the TOTAL EXPENSES and
              BALANCE DUE EMPLOYEE rows so there is room for all three lines. */}
          <tr style={{ height: 22 }}>
            <td className="lb-total-label">TOTAL EXPENSES</td>
            <td className="lb-amount">{liqMoney(totals.grand, true)}</td>
            <td className="lb-approver" colSpan={2} rowSpan={2}>
              <span className="lb-sub">APPROVED BY</span>
              {form.approved_via_viber ? (
                <span className="lb-viber">Approved via Viber</span>
              ) : null}
              <span className="lb-approver-name">{form.approved_by}</span>
            </td>
            <td className="lb-acct">OFFICE SUPPLIES</td>
            <td />
            <td />
            <td />
          </tr>
          <tr style={{ height: 18 }}>
            <td className="lb-total-label">BALANCE DUE EMPLOYEE</td>
            <td className="lb-amount">{balanceDueEmployee}</td>
            <td className="lb-acct">LOAD / ACCOM.</td>
            <td />
            <td />
            <td />
          </tr>
          <tr style={{ height: 18 }}>
            <td className="lb-total-label">BALANCE DUE COMPANY</td>
            <td className="lb-amount" />
            <td className="lb-slip" colSpan={2}>
              <span className="lb-sub">AMOUNT RECEIVED BY</span>
            </td>
            <td className="lb-acct">ENTERTAINMENT</td>
            <td />
            <td />
            <td />
          </tr>
          <tr style={{ height: 18 }}>
            <td className="lb-label lb-center">CR NO</td>
            <td />
            <td className="lb-label lb-center">DATE</td>
            <td />
            <td className="lb-slip" colSpan={2}>
              <span className="lb-sub">DATE RECEIVED</span>
            </td>
            <td className="lb-acct">OTHER BUSINESS</td>
            <td />
            <td />
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
