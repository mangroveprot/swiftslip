import { APP } from "@/config/app";
import { formatMonthDayYear } from "@/shared/period";
import type { CosForm, CosSchedule } from "@/shared/types";
import { formatScheduleLine } from "../lib/schedule-line";

/**
 * The live preview / print replica of public/cos_template.docx.
 *
 * Laid out fluidly (`w-full`) with the same typography the OB preview uses —
 * 13px Calibri body, an 18px heavy title, 2.5px outer rules — rather than being
 * rendered at the template's true width and scaled down, which shrank the text
 * to roughly two-thirds the size of every other preview in the app.
 *
 * The column widths are the template's own proportions nudged so the label
 * cells stay wider than their text at the narrowest the preview column ever
 * gets (~26rem); at the template's raw 22/26/26/26 "EFFECTIVITY DATE" and
 * "EMPLOYEE SIGNATURE" wrap onto two lines.
 *
 * All the styling lives in `src/styles.css`, scoped under `.cos-sheet`.
 */
export function CosPreview({
  form,
  schedules,
  sheetId,
}: {
  form: CosForm;
  schedules: CosSchedule[];
  sheetId?: string;
}) {
  const ticked = (on: boolean) => (on ? "✕" : "");
  // At least one (blank) line so the block keeps its value row.
  const padded: (CosSchedule | null)[] = [...schedules];
  while (padded.length < 1) padded.push(null);

  return (
    <div id={sheetId} className="print-sheet cos-sheet">
      <div className="form">
        <div className="logo">
          <img src={APP.obLogoPath} alt="Mindbridge" className="h-auto w-[30%] object-contain" />
        </div>
        <h1>CHANGE OF SCHEDULE FORM</h1>

        {/* Employee info */}
        <table className="outer info">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "44%" }} />
          </colgroup>
          <tbody>
            <tr>
              <td>
                <span className="label">ID Number:</span>
                <div className="val">{form.id_number}</div>
              </td>
              <td>
                <span className="label">Employee Name:</span>
                <div className="val">{form.employee_name}</div>
              </td>
              <td>
                <span className="label">Date Filed</span>
                <div className="val">{formatMonthDayYear(form.date_filed)}</div>
              </td>
            </tr>
            <tr>
              <td>
                <span className="label">Plant/Location:</span>
                <div className="val normal">{form.plant_location}</div>
              </td>
              <td>
                <span className="label">Position:</span>
                <div className="val normal">{form.position}</div>
              </td>
              <td>
                <span className="label">Change of Work Schedule</span>
                <span className="check">
                  <span className="cb">{ticked(form.change_type === "shift")}</span> Shift Schedule
                </span>
                <span className="check">
                  <span className="cb">{ticked(form.change_type === "rest_day")}</span> Rest Day
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="gap" />

        {/* Schedule */}
        <table className="sched">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "30%" }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>EFFECTIVITY DATE</th>
              <th colSpan={2}>SCHEDULE</th>
              <th rowSpan={2}>EMPLOYEE SIGNATURE</th>
            </tr>
            <tr className="sub">
              <th>FROM</th>
              <th>TO</th>
            </tr>
          </thead>
          <tbody>
            {padded.map((row, i) => (
              <tr key={row ? row.idx : `pad-${i}`}>
                <td>{row ? formatMonthDayYear(row.effectivity_date) : null}</td>
                <td>
                  {row ? formatScheduleLine(row.from_date, row.from_start, row.from_end) : null}
                </td>
                <td>{row ? formatScheduleLine(row.to_date, row.to_start, row.to_end) : null}</td>
                {/* The signature repeats on every line, matching the Word
                    export — a repeated table row can't merge its last cell. */}
                <td>
                  <div className="sig-line">
                    {form.employee_signature ? (
                      <img
                        src={form.employee_signature}
                        alt=""
                        style={{
                          maxHeight: 40,
                          maxWidth: "100%",
                          display: "block",
                          margin: "0 auto",
                          mixBlendMode: "multiply",
                        }}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="gap" />

        {/* Reason */}
        <div className="reason">
          <b className="title">REASON/S FOR CHANGE OF SCHEDULE</b>
          <p>{form.reasons}</p>
        </div>

        <div className="gap" />

        {/* Signatories */}
        <table className="sign">
          <colgroup>
            <col style={{ width: "35%" }} />
            <col style={{ width: "29%" }} />
            <col style={{ width: "36%" }} />
          </colgroup>
          <tbody>
            <tr>
              <td>
                <div className="head">Approved by:</div>
                <div className="who">
                  {/* Same blue note the OB sheet prints when the approval came
                      through Viber — the attachment tick drives it. */}
                  {form.approved_via_viber ? <div className="viber">Approved via Viber</div> : null}
                  <div className="name">{form.approved_by}</div>
                  Immediate Superior
                  <p>Printed Name and Signature</p>
                </div>
              </td>
              <td>
                <div className="head">Received by:</div>
                <div className="who">
                  <div className="name">{form.received_by}</div>
                </div>
              </td>
              <td>
                <div className="head">Processed by:</div>
                <div className="team">
                  {form.processed_by ? <div className="name">{form.processed_by}</div> : null}
                  <span>Payroll&nbsp; Team</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
