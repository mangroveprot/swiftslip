import { APP } from "@/config/app";
import { formatMonthDayYear } from "@/shared/period";
import type { OtEntry, OtForm } from "@/shared/types";
import { formatOtHours } from "../lib/ot-line";

// Matches public/ot_template.docx: 65%-gray header fill, black bold text, and
// FOUR separate bordered boxes stacked with gaps — the same construction the OB
// preview uses (see ObPreview.tsx), so every form in the app reads alike.
const HEADER_FILL = "#a6a6a6";
const MIN_ROWS = 1;

export function OtPreview({
  form,
  entries,
  sheetId,
}: {
  form: OtForm;
  entries: OtEntry[];
  /** DOM id for the sheet — only the inline editor copy carries one, so the
   *  full-view lightbox copy can never produce a duplicate id. */
  sheetId?: string;
}) {
  const padded: (OtEntry | null)[] = [...entries];
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
          OVERTIME AUTHORIZATION FORM
        </h1>
      </div>

      {/* BOX 1 — identity grid. Its own bordered box.
          The template merges this 9-column Word grid down to three logical
          columns (4540 / 656 / 5514 twips ≈ 40 / 6 / 49 %), so ID Number and
          Department/Location share the wide left column, Employee Name and
          Position the narrow middle one, and the two right-hand cells the third. */}
      <table className="w-full table-fixed border-collapse border-[2.5px] border-ink">
        <colgroup>
          <col style={{ width: "40%" }} />
          <col style={{ width: "23%" }} />
          <col style={{ width: "37%" }} />
        </colgroup>
        <tbody>
          <tr>
            <OtField label="ID Number:" value={form.id_number} />
            <OtField label="Employee Name:" value={form.employee_name} />
            <OtField label="Employee Signature:">
              {form.employee_signature ? (
                <img
                  src={form.employee_signature}
                  alt=""
                  className="mt-1 h-6 w-auto max-w-full object-contain mix-blend-multiply"
                />
              ) : null}
            </OtField>
          </tr>
          <tr>
            <OtField label="Department/Location:" value={form.department} />
            <OtField label="Position:" value={form.position} />
            <OtField label="Date & Time Filed:" value={form.date_filed} highlight />
          </tr>
        </tbody>
      </table>

      <div className="h-2.5" />

      {/* BOX 2 — OT hours, one row per date. Its own bordered box.
          Six value columns: REGULAR SHIFT SCHEDULE is ONE column (the template
          merges it across both header rows) while ACTUAL OT HOURS splits into
          FROM and TO — hence six cells, not seven.
          The widths follow the template's own rules (98.9 / 175.6 / 71.7 /
          27.1 / 44.2 / 98.9 px of 714), tightened a little at the two ends so
          the two-word headers fit without spilling: at the template's literal
          6% the TOTAL OT HOURS cell wraps to three lines in a narrow preview. */}
      <table className="w-full table-fixed border-collapse border-[2.5px] border-ink text-center">
        <colgroup>
          <col style={{ width: "17%" }} />
          <col style={{ width: "27%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "21%" }} />
        </colgroup>
        <thead className="font-bold" style={{ backgroundColor: HEADER_FILL }}>
          <tr>
            <th className="border border-ink px-0.5 py-0.5" rowSpan={2}>
              DATE OF OT WORK
            </th>
            <th className="border border-ink px-0.5 py-0.5" rowSpan={2}>
              REGULAR SHIFT SCHEDULE
            </th>
            <th className="border border-ink px-0.5 py-0.5" colSpan={2}>
              ACTUAL OT HOURS
            </th>
            <th className="border border-ink px-0.5 py-0.5" rowSpan={2}>
              TOTAL OT HOURS
            </th>
            <th className="border border-ink px-0.5 py-0.5" rowSpan={2}>
              For HR use only OT VALIDATION
            </th>
          </tr>
          <tr>
            <th className="border border-ink px-0.5 py-0.5">FROM</th>
            <th className="border border-ink px-0.5 py-0.5">TO</th>
          </tr>
        </thead>
        <tbody>
          {padded.map((row, i) => (
            <tr key={row ? row.idx : `pad-${i}`}>
              <td className="h-7 border border-ink px-1 py-0.5">
                {row ? formatMonthDayYear(row.date_of_ot) : null}
              </td>
              {/* One column — the shift hours read as a single range. */}
              <td className="border border-ink px-1 py-0.5">
                {row ? formatOtHours(row.regular_from, row.regular_to) : null}
              </td>
              <td className="border border-ink px-1 py-0.5">
                {row?.actual_from ? formatOtHours(row.actual_from, "") : null}
              </td>
              <td className="border border-ink px-1 py-0.5">
                {row?.actual_to ? formatOtHours("", row.actual_to) : null}
              </td>
              <td className="border border-ink px-1 py-0.5">{row?.total_hours}</td>
              <td className="border border-ink px-1 py-0.5">{row?.validation}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="h-2.5" />

      {/* BOX 3 — reason. Its own bordered box. The template puts the label and
          the reason in the one tall cell, with the reason centred on a line of
          its own. */}
      <div className="border-[2.5px] border-ink px-3 pb-6 pt-1">
        <p className="text-[13px] font-bold">REASON FOR OVERTIME:</p>
        <p className="mt-1 whitespace-pre-line text-center text-[13px]">{form.reasons}</p>
      </div>

      <div className="h-2.5" />

      {/* BOX 4 — signatories. Its own bordered box: a thin label row over a tall
          names row, with a rule between them (as the template draws it). */}
      <div className="border-[2.5px] border-ink">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "40%" }} />
            <col style={{ width: "23%" }} />
            <col style={{ width: "37%" }} />
          </colgroup>
          <tbody>
            <tr className="text-[13px] font-bold">
              <td className="border-b border-r border-ink px-2 py-1">Approved by:</td>
              <td className="border-b border-r border-ink px-2 py-1">Received by:</td>
              <td className="border-b border-ink px-2 py-1">Processed by:</td>
            </tr>
            <tr>
              <td className="h-24 border-r border-ink px-2 pb-1 pt-2 align-top">
                <div className="flex h-16 flex-col items-center justify-end gap-0.5 pb-0.5">
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
                <div className="-mx-2 mt-1 px-2 pt-0.5">
                  <p className="text-center text-[10px] font-semibold">
                    Supervisor / Department Head or Manager
                  </p>
                  <p className="text-center text-[11px]">Printed Name and Signature</p>
                </div>
              </td>
              <td className="h-24 border-r border-ink px-2 pb-1 pt-2 align-top">
                <div className="flex h-16 flex-col items-center justify-end gap-0.5 pb-0.5">
                  {form.received_by ? (
                    <p className="text-center text-[13px] font-medium tracking-wide">
                      {form.received_by}
                    </p>
                  ) : null}
                </div>
              </td>
              <td className="h-24 px-2 pb-1 pt-2 align-top">
                <div className="flex h-16 flex-col items-center justify-end gap-0.5 pb-0.5">
                  {form.processed_by ? (
                    <p className="text-center text-[13px] font-medium tracking-wide">
                      {form.processed_by}
                    </p>
                  ) : null}
                </div>
                <div className="-mx-2 mt-1 px-2 pt-0.5">
                  <p className="text-center text-[11px]">Payroll Team</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One labelled cell of the OT identity grid: the label in bold, the value in
 * regular weight beneath it — the same arrangement `HeaderField` gives the OB
 * preview. `highlight` paints the label yellow (the template's "Date & Time
 * Filed"), which needs `print-color-adjust` to survive the print pipeline.
 */
function OtField({
  label,
  value,
  highlight,
  children,
}: {
  label: string;
  value?: string;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <td className="border border-ink px-2 pb-1 pt-1 align-top">
      <span className={`text-[13px] font-bold ${highlight ? "bg-yellow-300 px-0.5" : ""}`}>
        {label}
      </span>
      {value !== undefined ? (
        <div className="mt-0.5 min-h-[16px] text-left font-medium">{value}</div>
      ) : (
        children
      )}
    </td>
  );
}
