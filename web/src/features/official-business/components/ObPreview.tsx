import { APP } from "@/config/app";
import { resolveExitSignoff, type ExitLeg } from "@/features/official-business/lib/exit-signoff";
import {
  obDepartureDisplay,
  obDepartureRowIndex,
  obReturnDisplay,
  obReturnRowIndex,
  type ObTimeOfDisplay,
} from "@/features/official-business/lib/time-of-display";
import { formatMonthDayYear } from "@swiftslip/shared/period";
import type { ObSigners } from "@swiftslip/shared/api-types";
import type { ObHrFields } from "@swiftslip/shared/hr";
import type { ObEntry, ObForm } from "@swiftslip/shared/types";

// Matches public/ob_template.docx (see public/example.png): 50%-gray header
// fill, black bold text, and FOUR separate bordered boxes stacked with gaps.
const HEADER_FILL = "#7f7f7f";
const MIN_ROWS = 1;

export function ObPreview({
  form,
  rows,
  sheetId,
  hr,
  signers,
}: {
  form: ObForm;
  rows: ObEntry[];
  /** DOM id for the sheet — only the inline editor copy carries one, so the
   *  full-view lightbox copy can never produce a duplicate id. */
  sheetId?: string;
  /**
   * HR-owned sign-off columns. The HR detail page passes the same object it
   * already holds as `form`; the employee editor passes the loaded row so the
   * preview can fill the boxes HR signed even though its edit state is ObForm.
   */
  hr?: Partial<ObHrFields> | null | undefined;
  /** Resolved names, positions + e-signatures for those boxes. */
  signers?: ObSigners | null | undefined;
}) {
  const padded: (ObEntry | null)[] = [...rows];
  while (padded.length < MIN_ROWS) padded.push(null);

  // Only the RETURN row can carry a signed date line (and only on a late
  // return). DEPARTURE is time-only, but keeps the row index for its fallback.
  const departureRow = obDepartureRowIndex(rows);
  const returnRow = obReturnRowIndex(rows);

  const details = hr ?? {};
  const {
    verified: verifiedByHr,
    departure: departureLeg,
    arrival: arrivalLeg,
  } = resolveExitSignoff(hr, signers);

  return (
    <div
      id={sheetId}
      className="print-sheet mx-auto w-full bg-paper px-6 pb-6 pt-1 text-[13px] leading-tight text-ink shadow-sm ring-1 ring-border"
      style={{ fontFamily: 'Calibri, "Segoe UI", Candara, Arial, sans-serif' }}
    >
      {/* Title — centered logo above a centered, heavy title. The logo is sized
          as a % of the sheet width (not fixed px) so it keeps the same proportion
          on screen and in print, where .print-sheet stretches to full A4 width. */}
      <div className="mb-2 flex flex-col items-center justify-center gap-0">
        <img src={APP.obLogoPath} alt="" className="h-auto w-[30%] object-contain" />
        <h1
          className="-mt-1 text-center text-[18px] font-extrabold tracking-wide"
          style={{
            fontFamily:
              '"Eras Demi ITC", "Eras Bold ITC", "Arial Black", "Century Gothic", Arial, sans-serif',
          }}
        >
          OFFICIAL BUSINESS FORM
        </h1>
      </div>

      {/* BOX 1 — identity grid (its own bordered box) */}
      <table className="w-full table-fixed border-collapse border-[2.5px] border-ink">
        <colgroup>
          <col style={{ width: "21%" }} />
          <col style={{ width: "32%" }} />
          <col style={{ width: "47%" }} />
        </colgroup>
        <tbody>
          <tr>
            <HeaderField label="ID Number:" value={form.id_number} />
            <HeaderField label="Employee Name:" value={form.employee_name} />
            <HeaderField label="Department / Location:" value={form.department} />
          </tr>
          <tr>
            <HeaderField
              label="Date Filed:"
              value={formatMonthDayYear(form.date_filed)}
              highlight
            />
            <HeaderField label="Position:" value={form.position} />
            <HeaderField label="Date of OB:" value={formatMonthDayYear(form.date_of_ob)} />
          </tr>
        </tbody>
      </table>

      <div className="h-2.5" />

      {/* BOX 2 — itinerary (its own bordered box) */}
      <table className="w-full table-fixed border-collapse border-[2.5px] border-ink text-center">
        {/* The two time columns are the narrowest ones — they get 15% each (was
            12.5%) so "DEPARTURE"/"RETURN" never spill over their borders in the
            on-screen preview and visually merge. */}
        <colgroup>
          <col style={{ width: "19%" }} />
          <col style={{ width: "24%" }} />
          <col style={{ width: "27%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>
        <thead className="font-bold" style={{ backgroundColor: HEADER_FILL }}>
          <tr>
            <th className="border border-ink px-1 py-0.5" colSpan={2}>
              ITENERARY / DESTINATION
            </th>
            <th className="border border-ink px-1 py-0.5" rowSpan={2}>
              PURPOSE (S)
            </th>
            <th className="border border-ink px-1 py-0.5" colSpan={2}>
              TIME OF
            </th>
          </tr>
          <tr>
            <th className="border border-ink px-1 py-0.5">FROM</th>
            <th className="border border-ink px-1 py-0.5">TO</th>
            <th className="border border-ink px-0.5 py-0.5 text-[11px] leading-tight break-words md:text-[13px]">
              DEPARTURE
            </th>
            <th className="border border-ink px-0.5 py-0.5 text-[11px] leading-tight break-words md:text-[13px]">
              RETURN
            </th>
          </tr>
        </thead>
        <tbody>
          {padded.map((row, i) => (
            <tr key={row ? row.idx : `pad-${i}`}>
              <td className="h-12 whitespace-pre-line border border-ink px-1 py-1 align-top break-words">
                {row?.from_place}
              </td>
              <td className="whitespace-pre-line border border-ink px-1 py-1 align-top break-words">
                {row?.to_place}
              </td>
              <td className="whitespace-pre-line border border-ink px-1 py-1 text-left align-top break-words">
                {row?.purpose}
              </td>
              {/* DEPARTURE is time-only; a blank planned cell falls back to HR's
                  signed actual departure time so a signed form is never empty. */}
              <td className="whitespace-pre-line border border-ink px-1 py-1 align-top break-words">
                {row ? (
                  <TimeOfCell
                    display={obDepartureDisplay(row, {
                      hr,
                      isDepartureRow: i === departureRow,
                    })}
                  />
                ) : null}
              </td>
              <td className="whitespace-pre-line border border-ink px-1 py-1 align-top break-words">
                {row ? (
                  <TimeOfCell
                    display={obReturnDisplay(row, {
                      hr,
                      isReturnRow: i === returnRow,
                      dateOfOb: form.date_of_ob,
                    })}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="h-2.5" />

      {/* BOX 3 — signatures + note (its own bordered box) */}
      <div className="border-[2.5px] border-ink">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "32%" }} />
            <col style={{ width: "37%" }} />
            <col style={{ width: "31%" }} />
          </colgroup>
          <tbody>
            <tr>
              {/* Employee */}
              <td className="border-r border-ink px-2 pb-1 pt-2 align-top">
                <p className="text-left text-[14px] font-bold">&nbsp;</p>
                <div className="flex h-12 flex-col items-center justify-end gap-0.5 pb-0.5">
                  {/* The cell is narrower than 11rem at preview width, so the
                      drawing is capped at the cell's own width as well —
                      without the min() it spills over the "Approved by" cell
                      beside it. */}
                  {form.employee_signature ? (
                    <img
                      src={form.employee_signature}
                      alt=""
                      className="max-h-[2.25rem] w-auto max-w-[min(11rem,100%)] object-contain mix-blend-multiply"
                    />
                  ) : null}
                  {form.employee_name ? (
                    <p className="text-center text-[13px] font-medium tracking-wide">
                      {form.employee_name}
                    </p>
                  ) : null}
                </div>
                <div className="-mx-2 mt-1 border-t border-ink px-2 pt-0.5">
                  <p className="text-center text-[10px] font-semibold">EMPLOYEE&apos;S SIGNATURE</p>
                  <p className="text-center text-[11px]">Printed Name and Signature</p>
                </div>
              </td>
              {/* Approved by */}
              <td className="border-r border-ink px-2 pb-1 pt-2 align-top">
                <p className="text-left text-[14px] font-bold">Approved by:</p>
                <div className="flex h-12 flex-col items-center justify-end gap-0.5 pb-0.5">
                  {form.approved_via_viber ? (
                    <p className="text-center text-[14px]" style={{ color: "#4472C4" }}>
                      Approved via Viber
                    </p>
                  ) : null}
                  {form.approved_by ? (
                    <p className="text-center text-[13px] font-medium tracking-wide">
                      {form.approved_by}
                    </p>
                  ) : null}
                </div>
                <div className="-mx-2 mt-1 border-t border-ink px-2 pt-0.5">
                  <p className="text-center text-[10px] font-semibold">
                    Supervisor / Department Head or Manager
                  </p>
                  <p className="text-center text-[11px]">Printed Name and Signature</p>
                </div>
              </td>
              {/* Verified by HRD */}
              <td className="px-2 pb-1 pt-2 align-top">
                <p className="text-left text-[14px] font-bold">&nbsp;</p>
                {/* Paper order: signature, printed name, then the position line. */}
                <div className="flex h-12 flex-col items-center justify-end gap-0.5 pb-0.5">
                  {/* Same cell-width cap as the employee signature: 8.5rem is
                      wider than this cell at preview size, so the drawing
                      used to push into the "Approved by" cell and past the
                      box border. */}
                  {verifiedByHr?.signature ? (
                    <img
                      src={verifiedByHr.signature}
                      alt=""
                      className="max-h-[2.25rem] w-auto max-w-[min(8.5rem,100%)] object-contain mix-blend-multiply"
                    />
                  ) : null}
                  {verifiedByHr?.name ? (
                    <p className="text-center text-[12px] font-medium leading-tight tracking-wide">
                      {verifiedByHr.name}
                    </p>
                  ) : null}
                  {verifiedByHr?.position ? (
                    <p className="text-center text-[11px] leading-tight tracking-wide">
                      {verifiedByHr.position}
                    </p>
                  ) : null}
                </div>
                <div className="-mx-2 mt-1 border-t border-ink px-2 pt-0.5">
                  <p className="text-center text-[10px] font-semibold">VERIFIED BY: HRD</p>
                  <p className="text-center text-[11px]">Printed Name and Signature</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="border-t border-ink px-3 py-2 text-center text-[10px] leading-snug">
          <span className="font-semibold">Note:</span> Employees leaving the Company premises shall
          be required at all times to accomplish this{" "}
          <span className="font-bold">OFFICIAL BUSINESS FORM</span> before departure. Accomplished
          forms without the signature of authorized official shall be considered invalidated and
          thereby departure may be classified as <span className="font-bold">UNAUTHORIZED</span>.
        </div>
      </div>

      <div className="h-2.5" />

      {/* BOX 4 — exit clearance (its own bordered box; underlines only, no cell grid) */}
      <div className="border-[2.5px] border-ink">
        <div
          className="border-b border-ink py-0.5 text-center text-[13px] font-bold"
          style={{ backgroundColor: HEADER_FILL }}
        >
          EXIT CLEARANCE
        </div>
        <table className="w-full table-fixed border-collapse text-center">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "24%" }} />
          </colgroup>
          <tbody>
            <tr className="text-[9px] font-bold">
              <td className="px-2 py-1" />
              <td className="px-2 py-1">RESIDENCE / OFFICE</td>
              <td className="px-2 py-1">DESTINATION</td>
              <td className="px-2 py-1">SIGNATURE OF SECURITY GUARD / HR</td>
            </tr>
            <tr>
              <td className="px-2 py-2 text-left align-bottom text-[11px] leading-tight">
                <div>Date / Time of Actual Departure</div>
              </td>
              <td className="px-3 py-2 align-bottom">
                <div className="min-h-[17px] border-b border-ink pt-3 text-[11px] font-medium">
                  {departureLeg.signed ? details.residence : ""}
                </div>
              </td>
              <td className="px-3 py-2 align-bottom">
                <div className="min-h-[17px] border-b border-ink pt-3 text-[11px] font-medium">
                  {departureLeg.signed ? details.destination : ""}
                </div>
              </td>
              <td className="px-1.5 py-2 align-bottom">
                <ExitSignature leg={departureLeg} />
              </td>
            </tr>
            <tr>
              <td className="px-2 py-2 text-left align-bottom text-[11px] leading-tight">
                <div>Date / Time of Actual Arrival</div>
              </td>
              <td className="px-3 py-2 align-bottom">
                <div className="min-h-[17px] border-b border-ink pt-3 text-[11px] font-medium">
                  {/* The return leg swaps the departure route, exactly like the
                      paper form: where they were, then where they came back to. */}
                  {arrivalLeg.signed ? details.destination : ""}
                </div>
              </td>
              <td className="px-3 py-2 align-bottom">
                <div className="min-h-[17px] border-b border-ink pt-3 text-[11px] font-medium">
                  {arrivalLeg.signed ? details.residence : ""}
                </div>
              </td>
              <td className="px-1.5 py-2 align-bottom">
                <ExitSignature leg={arrivalLeg} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <td className="border border-ink px-2 pb-1 pt-1 align-top">
      <span className={`text-[13px] font-bold ${highlight ? "bg-yellow-300 px-0.5" : ""}`}>
        {label}
      </span>
      <div className="mt-0.5 min-h-[16px] text-left font-medium">{value}</div>
    </td>
  );
}

/**
 * Renders one TIME OF cell. DEPARTURE is always a single line (time only).
 * RETURN adds a smaller second line with HR's signed arrival date on a late
 * return, so both fit the narrow 15% column.
 */
function TimeOfCell({ display }: { display: ObTimeOfDisplay }) {
  if (!display.time && !display.date) return null;
  return (
    <>
      {display.time ? <span className="block whitespace-nowrap">{display.time}</span> : null}
      {display.date ? (
        <span className="mt-0.5 block whitespace-nowrap text-[10px] leading-tight md:text-[11px]">
          {display.date}
        </span>
      ) : null}
    </>
  );
}

/**
 * The "Signature of Security Guard / HR" cell, left to right exactly like the
 * paper form: a small signature, then the time, then the date.
 *
 * Three things the owner asked for, in one box:
 *
 * 1. The content sits at the **bottom** of the cell, right on the underline,
 *    the way the residence/destination boxes beside it do (an earlier version
 *    centred it in a 40px box, which left it floating in the middle).
 * 2. Time and date travel **together** as one group, so a narrow preview column
 *    drops the pair to the second line instead of splitting them — and only
 *    splits them further if the group itself cannot fit.
 * 3. Nothing can spill over the cell's right border: every piece is unbreakable
 *    on its own and the pieces wrap instead of overflowing (that spill is what
 *    made the date collide with the edge on a small screen).
 *
 * An unsigned row keeps the original blank underline.
 */
function ExitSignature({ leg }: { leg: ExitLeg }) {
  return (
    <div className="flex min-h-[2.5rem] flex-wrap items-end gap-x-1 gap-y-0.5 border-b border-ink px-0.5 pb-0.5">
      {leg.signer?.signature ? (
        <img
          src={leg.signer.signature}
          alt=""
          className="h-[18px] w-auto max-w-[2.5rem] shrink-0 object-contain mix-blend-multiply"
        />
      ) : null}
      {leg.signed ? (
        <span className="flex flex-wrap items-baseline gap-x-0.5 gap-y-0.5 text-[10px] font-medium leading-tight">
          <span className="whitespace-nowrap">{leg.time}</span>
          <span className="whitespace-nowrap">{leg.date}</span>
        </span>
      ) : null}
    </div>
  );
}
