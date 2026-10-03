import type { CSSProperties, ReactNode } from "react";

import { APP } from "@/config/app";
import type { LoaForm } from "@/shared/types";

// Pixel replica of public/loa_form_template.docx (APPLICATION FOR LEAVE OF
// ABSENCE). The structure below is taken cell-for-cell from the template's
// document.xml: one 21-column table where every cell carries exactly the border
// sides the template declares (Word renders quirks like the open bottom band
// and the gap under EARNED literally — so does this preview), the gray section
// bars use the template's #7f7f7f fill, and sizes are the template's point
// sizes at 96 dpi (11pt → 14.67px, 12pt → 16px, 14pt → 18.67px, …).
const HEADER_FILL = "#7f7f7f";

/** The template's word-default body size (docDefaults w:sz 22 = 11pt). */
const PT = {
  base: "14.67px",
  title: "18.67px",
  h12: "16px",
  h10: "13.33px",
  h9: "12px",
  h8: "10.67px",
  h3: "4px",
} as const;

/** The 21-column grid of the template's main table (dxa units, sum 10812). */
const GRID = [
  236, 423, 1231, 517, 900, 288, 72, 378, 522, 270, 923, 259, 900, 78, 90, 90, 480, 420, 485, 415,
  1835,
];
const GRID_SUM = GRID.reduce((a, b) => a + b, 0);

/** Word twips → CSS px (1440 twips/inch, 96 px/inch). */
const tw = (t: number) => Math.round((t / 15) * 10) / 10;

const SIDE_CLASS: Record<string, string> = {
  t: "border-t",
  l: "border-l",
  b: "border-b",
  r: "border-r",
};

/** "tlbr" → Tailwind side utilities + the shared ink color. */
function sides(s: string) {
  return `${s
    .split("")
    .map((c) => SIDE_CLASS[c])
    .join(" ")} border-ink`;
}

type Cell = {
  /** gridSpan (column count). */
  span: number;
  /** Border sides the template's tcBorders declares — default full box. */
  b?: string;
  /** #fill for the gray section bars. */
  fill?: string;
  /** Row height in twips (acts as min-height, like Word). */
  h?: number;
  cls?: string;
  style?: CSSProperties;
  content: ReactNode;
};

function Row({ cells, h, fill }: { cells: Cell[]; h?: number; fill?: string }) {
  return (
    <tr>
      {cells.map((c, i) => (
        <td
          key={i}
          colSpan={c.span}
          className={`align-middle ${sides(c.b ?? "tlbr")} ${c.cls ?? ""}`}
          style={{
            height: (c.h ?? h) ? tw(c.h ?? h!) : undefined,
            backgroundColor: c.fill ?? fill,
            ...c.style,
          }}
        >
          {c.content}
        </td>
      ))}
    </tr>
  );
}

/** Empty fill-in line on the "Others:" row (verbatim from the template). */
const OTHERS_LINE = "_________________________________________";

export function LoaPreview({
  form,
  sheetId,
}: {
  form: LoaForm;
  /** DOM id for the sheet — only the inline editor copy carries one, so the
   *  full-view lightbox copy can never produce a duplicate id. */
  sheetId?: string;
}) {
  const box = (type: string) => (form.leave_type === type ? "✓" : " ");
  const payWith = form.pay_status === "with_pay" ? " ✓ " : "   ";
  const payWithout = form.pay_status === "without_pay" ? " ✓ " : "   ";

  return (
    <div
      id={sheetId}
      className="print-sheet mx-auto w-full bg-paper px-3 pb-5 pt-2 text-ink shadow-sm ring-1 ring-border"
      style={{
        fontFamily: 'Calibri, "Segoe UI", Candara, Arial, sans-serif',
        fontSize: PT.base,
        lineHeight: 1.1,
      }}
    >
      {/* Page header — logo, address and phone line, exactly as header1.xml
          lays them out (all three paragraphs centered). */}
      <div className="flex flex-col items-center gap-0.5 text-center">
        <img
          src={APP.mindbridgeLogoPath}
          alt=""
          className="h-auto w-[24%] max-w-[150px] object-contain"
        />
        <p style={{ fontSize: PT.h9 }}>
          22nd Floor Strata 100, F. Ortigas Jr. Road, San Antonio, Pasig City
        </p>
        <p className="flex items-center justify-center gap-1" style={{ fontSize: PT.h9 }}>
          <img src="/loa_phone.jpg" alt="" className="inline-block h-3 w-3 object-contain" />
          638-06-60 loc 106
        </p>
      </div>

      {/* Title — Eras Demi ITC bold 14pt, centered (same treatment as the OB sheet). */}
      <h1
        className="mt-1 text-center"
        style={{
          fontSize: PT.title,
          fontWeight: 800,
          letterSpacing: "0.02em",
          fontFamily:
            '"Eras Demi ITC", "Eras Bold ITC", "Arial Black", "Century Gothic", Arial, sans-serif',
        }}
      >
        APPLICATION FOR LEAVE OF ABSENCE (LOA) FORM
      </h1>

      {/* Instructions — bold, justified, indented 90 twips (6px), as in the template. */}
      <div className="mt-2" style={{ paddingLeft: 6 }}>
        <p style={{ fontWeight: 700 }}>Instructions:</p>
        <p className="text-justify" style={{ fontWeight: 700 }}>
          This form must be accomplished and submitted before an employee goes on leave. In case of
          an emergency or illness this form must be accomplished and submitted upon reporting to
          work. Emergency leave is charged to vacation leave.
        </p>
      </div>

      {/* The main table — cell-for-cell from the template's document.xml. */}
      <table
        className="w-full"
        style={{ borderCollapse: "collapse", tableLayout: "fixed", marginTop: tw(160) }}
      >
        <colgroup>
          {GRID.map((w, i) => (
            <col key={i} style={{ width: `${(w / GRID_SUM) * 100}%` }} />
          ))}
        </colgroup>
        <tbody>
          {/* Identity box — labels row, values row (signature cell), then the
              date / position / days labels and the FROM–TO bands. */}
          <Row
            cells={[
              { span: 3, cls: "italic", style: { fontWeight: 700 }, content: "ID Number:" },
              { span: 8, cls: "italic", style: { fontWeight: 700 }, content: "Employee Name:" },
              {
                span: 8,
                cls: "italic",
                style: { fontWeight: 700 },
                content: "Department/Location:",
              },
              { span: 2, cls: "italic", style: { fontWeight: 700 }, content: "Employee Signature" },
            ]}
          />
          <Row
            h={771}
            cells={[
              { span: 3, style: { fontWeight: 700 }, content: form.id_number },
              { span: 8, style: { fontWeight: 700 }, content: form.employee_name },
              { span: 8, style: { fontWeight: 700 }, content: form.department },
              {
                span: 2,
                cls: "text-center",
                content: form.employee_signature ? (
                  <img
                    src={form.employee_signature}
                    alt="Employee signature"
                    className="mx-auto max-h-[40px] w-auto max-w-full object-contain"
                  />
                ) : (
                  <span />
                ),
              },
            ]}
          />
          <Row
            cells={[
              { span: 3, cls: "italic", style: { fontWeight: 700 }, content: "Date Filed:" },
              { span: 6, cls: "italic", style: { fontWeight: 700 }, content: "Position:" },
              {
                span: 6,
                cls: "italic",
                style: { fontWeight: 700 },
                content: "Number of Days Applied:",
              },
              {
                span: 6,
                cls: "italic text-center",
                style: { fontWeight: 700 },
                content: "Inclusive Dates",
              },
            ]}
          />
          <Row
            h={219}
            cells={[
              { span: 3, style: { fontWeight: 700 }, content: form.date_filed },
              { span: 6, style: { fontWeight: 700 }, content: form.position },
              {
                span: 6,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: form.days_applied,
              },
              {
                span: 5,
                cls: "italic text-center",
                style: { fontWeight: 700, fontSize: PT.h9 },
                content: "FROM",
              },
              {
                span: 1,
                cls: "italic text-center",
                style: { fontWeight: 700, fontSize: PT.h9 },
                content: "TO",
              },
            ]}
          />
          <Row
            h={466}
            cells={[
              { span: 3, content: "" },
              { span: 6, content: "" },
              { span: 6, content: "" },
              {
                span: 5,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: form.date_from,
              },
              { span: 1, cls: "text-center", style: { fontWeight: 700 }, content: form.date_to },
            ]}
          />
          {/* Closing band of the box (8pt, no verticals — template quirk). */}
          <Row
            h={117}
            cells={[
              { span: 3, b: "tb", style: { fontSize: PT.h8 }, content: "" },
              { span: 6, b: "tb", style: { fontSize: PT.h8 }, content: "" },
              { span: 7, b: "tb", style: { fontSize: PT.h8 }, content: "" },
              { span: 5, b: "tb", style: { fontSize: PT.h8 }, content: "" },
            ]}
          />

          {/* KINDLY MARK APPROPRIATE BOX — gray bar. */}
          <Row
            h={307}
            fill={HEADER_FILL}
            cells={[
              {
                span: 21,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: "KINDLY MARK APPROPRIATE BOX",
              },
            ]}
          />

          {/* Checkbox grid: thin spacer, label row, spacer, label row, spacer —
              the box columns run through all three rows, so each checkbox cell
              renders as one square in Word (and here). */}
          <Row
            h={90}
            cells={[
              { span: 1, b: "tl", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "t", style: { fontSize: PT.h3 }, content: "" },
              { span: 2, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, b: "t", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "tr", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />
          <Row
            h={298}
            cells={[
              { span: 1, b: "lr", content: "" },
              {
                span: 1,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Vacation Leave"),
              },
              { span: 4, style: { fontWeight: 700 }, content: "Vacation Leave" },
              {
                span: 2,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Maternity Leave"),
              },
              { span: 8, style: { fontWeight: 700 }, content: "Maternity Leave" },
              {
                span: 1,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Emergency Leave"),
              },
              { span: 4, style: { fontWeight: 700 }, content: "Emergency Leave" },
            ]}
          />
          <Row
            h={83}
            cells={[
              { span: 1, b: "l", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, style: { fontSize: PT.h3 }, content: "" },
              { span: 2, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "r", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />
          <Row
            h={262}
            cells={[
              { span: 1, b: "lr", content: "" },
              {
                span: 1,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Sick Leave"),
              },
              { span: 4, style: { fontWeight: 700 }, content: "Sick Leave" },
              {
                span: 2,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Paternity Leave"),
              },
              { span: 8, style: { fontWeight: 700 }, content: "Paternity Leave" },
              {
                span: 1,
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Bereavement Leave"),
              },
              { span: 4, style: { fontWeight: 700 }, content: "Bereavement Leave" },
            ]}
          />
          <Row
            h={83}
            cells={[
              { span: 1, b: "l", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, style: { fontSize: PT.h3 }, content: "" },
              { span: 2, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "r", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />
          {/* Others line + the two pay boxes, all in one bold row. */}
          <Row
            h={226}
            cells={[
              { span: 1, b: "lr", content: "" },
              {
                span: 1,
                b: "tlbr",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Others"),
              },
              {
                span: 19,
                style: { fontWeight: 700 },
                content: (
                  <>
                    Others: {form.leave_type_other || OTHERS_LINE}
                    {"                      "}({payWith}) w/ PAY {"                "}({payWithout})
                    w/o PAY
                  </>
                ),
              },
            ]}
          />
          <Row
            h={64}
            cells={[
              { span: 1, b: "lb", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 19, b: "lbr", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />
          <Row h={64} cells={[{ span: 21, b: "tb", style: { fontSize: PT.h3 }, content: "" }]} />

          {/* REASONS / REMARKS — gray bar, then the two-column body:
              remarks on the left, the report-back block on the right. */}
          <Row
            h={235}
            fill={HEADER_FILL}
            cells={[
              {
                span: 21,
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "REASONS / REMARKS",
              },
            ]}
          />
          <Row
            h={517}
            cells={[
              {
                span: 18,
                b: "tlr",
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: form.reasons,
              },
              {
                span: 3,
                b: "tlr",
                cls: "text-center",
                content: (
                  <>
                    <span className="block italic" style={{ fontWeight: 700 }}>
                      To report back for work on
                    </span>
                    <span className="block italic" style={{ fontSize: PT.h9 }}>
                      (please specify date)
                    </span>
                  </>
                ),
              },
            ]}
          />
          <Row
            h={704}
            cells={[
              { span: 18, b: "lr", style: { fontSize: PT.h3 }, content: "" },
              {
                span: 3,
                b: "lbr",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: form.report_back_date,
              },
            ]}
          />
          {/* Bottom band — left half closes with bottom+left only (template quirk). */}
          <Row
            h={720}
            cells={[
              { span: 18, b: "lb", style: { fontSize: PT.h3 }, content: "" },
              { span: 3, b: "tbr", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />

          {/* Sick-leave note — gray bar with the two template paragraphs. */}
          <Row
            h={190}
            fill={HEADER_FILL}
            cells={[
              {
                span: 21,
                cls: "text-center",
                content: (
                  <>
                    <span className="block" style={{ fontWeight: 700, fontSize: PT.h10 }}>
                      For SICK LEAVE of TWO (2) DAYS or more, please attached MEDICAL CERTIFICATE
                      indicating that you are FIT TO WORK.
                    </span>
                    <span className="block" style={{ fontSize: PT.h10 }}>
                      Note: Please note that if the employee fails to report for work on the given
                      date, shall be charged AWOL unless notification has been made to the immediate
                      superior. Only documented papers will be allowed and honored which should be
                      duly signed and approved by authorized person/s.
                    </span>
                  </>
                ),
              },
            ]}
          />
          <Row h={38} cells={[{ span: 21, b: "tb", style: { fontSize: PT.h3 }, content: "" }]} />

          {/* Approved by / Noted By / Received by — three tall bordered boxes.
              Only the approver has a token in the template; the other two print
              empty for handwriting, exactly as the template ships them. */}
          <Row
            h={1459}
            cells={[
              {
                span: 7,
                content: (
                  <>
                    <span className="block" style={{ fontWeight: 700, fontSize: PT.h12 }}>
                      Approved by:
                    </span>
                    <span className="block" style={{ height: tw(700) }} />
                    <span
                      className="block text-center"
                      style={{ fontWeight: 700, fontSize: PT.h12 }}
                    >
                      {form.approved_by}
                    </span>
                    {form.approved_via_viber ? (
                      <span className="block text-center text-[12px] text-sky-600">
                        Approved via Viber
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                span: 7,
                content: (
                  <>
                    <span className="block" style={{ fontWeight: 700, fontSize: PT.h12 }}>
                      Noted By:
                    </span>
                    <span className="block" style={{ height: tw(700) }} />
                  </>
                ),
              },
              {
                span: 7,
                content: (
                  <>
                    <span className="block" style={{ fontWeight: 700, fontSize: PT.h12 }}>
                      Received by:
                    </span>
                    <span className="block" style={{ height: tw(700) }} />
                  </>
                ),
              },
            ]}
          />
          <Row
            h={123}
            cells={[
              { span: 5, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, b: "tb", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, b: "tb", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />

          {/* EMPLOYEE'S LEAVE RECORD — gray bar + the credits table (blank in v1). */}
          <Row
            h={285}
            fill={HEADER_FILL}
            cells={[
              {
                span: 21,
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "EMPLOYEE’S LEAVE RECORD",
              },
            ]}
          />
          <Row
            h={279}
            cells={[
              {
                span: 4,
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "CREDITS",
              },
              {
                span: 3,
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "EARNED",
              },
              {
                span: 3,
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "USED",
              },
              {
                span: 2,
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "BALANCE",
              },
              {
                span: 9,
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "Verified by Payroll",
              },
            ]}
          />
          <Row
            h={324}
            cells={[
              {
                span: 4,
                cls: "text-center",
                style: { fontSize: PT.h12 },
                content: "VACATION LEAVE",
              },
              { span: 3, b: "tlr", style: { fontSize: PT.h12 }, content: "" },
              { span: 3, cls: "text-center", style: { fontSize: PT.h12 }, content: "" },
              { span: 2, b: "tlr", style: { fontSize: PT.h12 }, content: "" },
              { span: 9, b: "tlr", style: { fontSize: PT.h12 }, content: "" },
            ]}
          />
          <Row
            h={252}
            cells={[
              { span: 4, cls: "text-center", style: { fontSize: PT.h12 }, content: "SICK LEAVE" },
              { span: 3, b: "lbr", style: { fontSize: PT.h12 }, content: "" },
              { span: 3, cls: "text-center", style: { fontSize: PT.h12 }, content: "" },
              { span: 2, b: "lbr", style: { fontSize: PT.h12 }, content: "" },
              { span: 9, b: "lbr", style: { fontSize: PT.h12 }, content: "" },
            ]}
          />
        </tbody>
      </table>
    </div>
  );
}
