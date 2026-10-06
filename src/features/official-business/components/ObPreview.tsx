import { APP } from "@/config/app";
import { formatMonthDayYear } from "@/shared/period";
import { formatTime12h } from "@/shared/time";
import type { ObEntry, ObForm } from "@/shared/types";

// Matches public/ob_template.docx (see public/example.png): 50%-gray header
// fill, black bold text, and FOUR separate bordered boxes stacked with gaps.
const HEADER_FILL = "#7f7f7f";
const MIN_ROWS = 1;

export function ObPreview({
  form,
  rows,
  sheetId,
}: {
  form: ObForm;
  rows: ObEntry[];
  /** DOM id for the sheet — only the inline editor copy carries one, so the
   *  full-view lightbox copy can never produce a duplicate id. */
  sheetId?: string;
}) {
  const padded: (ObEntry | null)[] = [...rows];
  while (padded.length < MIN_ROWS) padded.push(null);

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
              <td className="whitespace-pre-line border border-ink px-1 py-1 align-top break-words">
                {row ? formatTime12h(row.time_departure) : null}
              </td>
              <td className="whitespace-pre-line border border-ink px-1 py-1 align-top break-words">
                {row ? formatTime12h(row.time_return) : null}
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
                  {form.employee_signature ? (
                    <img
                      src={form.employee_signature}
                      alt=""
                      className="max-h-[2.25rem] w-auto max-w-[11rem] object-contain mix-blend-multiply"
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
                <div className="h-12" />
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
              <td className="px-2 py-2 text-left text-[11px]">Date / Time of Actual Departure</td>
              <td className="px-3 py-2 align-bottom">
                <div className="border-b border-ink pt-3" />
              </td>
              <td className="px-3 py-2 align-bottom">
                <div className="border-b border-ink pt-3" />
              </td>
              <td className="px-3 py-2 align-bottom">
                <div className="border-b border-ink pt-3" />
              </td>
            </tr>
            <tr>
              <td className="px-2 py-2 text-left text-[11px]">Date / Time of Actual Arrival</td>
              <td className="px-3 py-2 align-bottom">
                <div className="border-b border-ink pt-3" />
              </td>
              <td className="px-3 py-2 align-bottom">
                <div className="border-b border-ink pt-3" />
              </td>
              <td className="px-3 py-2 align-bottom">
                <div className="border-b border-ink pt-3" />
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
