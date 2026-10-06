import type { CSSProperties, ReactNode } from "react";

import { APP } from "@/config/app";
import type { LoaForm } from "@/shared/types";

// Pixel replica of public/loa_form_template.docx (APPLICATION FOR LEAVE OF
// ABSENCE). Every row below encodes the template's document.xml exactly:
// per-cell border sides AND widths (Word sz in eighths of a point: 18 → 3px,
// 8 → 1.33px, 6 → 1px, 4 → 0.67px), the Word-default cell side padding
// (108 twips = 7.2px), per-cell vertical alignment (top in the signature
// boxes, bottom on the "Others" cell), the #7f7f7f gray bars, and the
// template's point sizes at 96 dpi. Row heights are the template's trHeight
// twips (min-heights, like Word).
const HEADER_FILL = "#7f7f7f";
const VIBER_BLUE = "#4472C4";
const CELL_PAD_X = "7.2px";

/** Sheet outer width — an exact A4 page replica: 794px (210mm at 96dpi) with
 *  the template's own page margins as padding (36px left / 20px right per
 *  sectPr pgMar), leaving the same 738px of content so line breaks match the
 *  Word template. Every container (inline preview column, full-view lightbox)
 *  must render the sheet at exactly this width; the print path gets the
 *  identical box from the named `@page loa` in styles.css (which zeroes this
 *  padding and re-applies the margins at page level). */
export const LOA_SHEET_WIDTH = 794;

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

/** Word border sz (eighths of a point) → CSS px. */
const SZ_PX: Record<number, number> = { 18: 3, 8: 1.33, 6: 1, 4: 0.67 };

/** "t18|l8|b18|r8" → CSS border sides; missing sides stay 0 width.
 *  Undefined = full box at sz18 (the template's fully bordered cells). */
function borderStyles(b?: string): CSSProperties {
  const spec = b ?? "t18|l18|b18|r18";
  const got: Record<string, number> = {};
  if (spec !== "NONE") {
    for (const part of spec.split("|")) {
      const sz = Number(part.slice(1));
      got[part[0] as "t" | "l" | "b" | "r"] = SZ_PX[sz] ?? sz / 8;
    }
  }
  return {
    borderStyle: "solid",
    borderColor: "var(--color-ink)",
    borderTopWidth: got["t"] ?? 0,
    borderLeftWidth: got["l"] ?? 0,
    borderBottomWidth: got["b"] ?? 0,
    borderRightWidth: got["r"] ?? 0,
  };
}

type Cell = {
  /** gridSpan (column count). */
  span: number;
  /** Exact tcBorders spec, e.g. "t18|l8|b8|r18" or "NONE". */
  b?: string;
  /** tcPr vAlign — defaults to center (91 of the template's cells). */
  v?: "top" | "center" | "bottom";
  /** #fill for the gray section bars. */
  fill?: string;
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
          className={c.cls}
          style={{
            ...borderStyles(c.b),
            padding: `0 ${CELL_PAD_X}`,
            height: h ? tw(h) : undefined,
            verticalAlign: c.v ?? "center",
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
  const box = (type: string) => (form.leave_type === type ? "✓" : " ");
  const withPay = form.pay_status === "with_pay" ? "✓" : " ";
  const withoutPay = form.pay_status === "without_pay" ? "✓" : " ";
  // The typed "Others" text only belongs on the sheet while Others is the
  // chosen type — switching away keeps the draft in the form but stops it
  // from leaking into the preview/print/export.
  const othersText =
    `Others: ${
      form.leave_type === "Others" ? form.leave_type_other || OTHERS_LINE : OTHERS_LINE
    }(${withPay}) w/ PAY                ` + `(${withoutPay}) w/o PAY`;

  return (
    <div
      id={sheetId}
      className="print-sheet loa-print-sheet mx-auto bg-paper min-h-[1123px] pb-6 pl-9 pr-5 pt-[52px] text-ink shadow-sm ring-1 ring-border"
      style={{
        width: LOA_SHEET_WIDTH,
        fontFamily: 'Calibri, "Segoe UI", Candara, Arial, sans-serif',
        fontSize: PT.base,
        lineHeight: 1.22,
      }}
    >
      {/* Page header — mirrors header1.xml: logo (271px ≈ 36.7% of the 738px
          content width), ~16px gap, then the 10pt address and phone lines
          (phone icon inline, ~40px before the number, as Word's tab renders). */}
      <div className="flex flex-col items-center text-center">
        <img
          src={APP.mindbridgeLogoPath}
          alt=""
          className="h-auto w-[36.7%] object-contain"
          style={{ position: "relative", top: -5.4 }}
        />
        <p style={{ fontSize: PT.h10, marginTop: 10 }}>
          22
          <sup
            style={{
              fontSize: "1em",
              position: "relative",
              top: "-6px",
              verticalAlign: "baseline",
            }}
          >
            nd
          </sup>
          {" Floor Strata 100, F. Ortigas Jr. Road, San Antonio, Pasig City"}
        </p>
        <p style={{ fontSize: PT.h10, position: "relative" }}>
          {/* Template centers the number on the content box and floats the icon
              133px left of center (Word anchor), so keep the icon out of flow —
              an inline icon would drag the centered text to the right. */}
          <img
            src="/loa_phone.jpg"
            alt=""
            className="absolute left-1/2 top-0 -ml-[133px] h-[13px] w-[14px] object-contain"
          />
          638-06-60 loc 106
        </p>
      </div>

      {/* Title — Eras Demi ITC bold 14pt, centered; the gap covers the
          template's empty 12pt paragraph between the header and the title. */}
      <h1
        className="mt-[16px] text-center"
        style={{
          fontSize: PT.title,
          fontWeight: 700,
          fontFamily: '"Eras Demi ITC", "Eras Bold ITC", Arial, sans-serif',
        }}
      >
        APPLICATION FOR LEAVE OF ABSENCE (LOA) FORM
      </h1>

      {/* Instructions — label bold, body regular (the template's runs carry no
          <w:b/>), indented 90 twips (6px) left / 360 twips (24px) right, body
          justified with the template's first-line tab (a default 0.5" tab stop
          = 48px from the margin = 42px inside the paragraph box). */}
      <div className="mt-[17px]" style={{ paddingLeft: 6, paddingRight: 24 }}>
        <p style={{ fontWeight: 700 }}>Instructions:</p>
        <p className="text-justify" style={{ textIndent: 42, lineHeight: 1.25 }}>
          This form must be accomplished and submitted before an employee goes on leave. In case of
          an emergency or illness this form must be accomplished and submitted upon reporting to
          work. Emergency leave is charged to vacation leave.
        </p>
      </div>

      {/* The main table — cell-for-cell from the template's document.xml. */}
      <table
        className="w-full"
        style={{ borderCollapse: "collapse", tableLayout: "fixed", marginTop: 31 }}
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
              {
                span: 3,
                b: "t18|l18|b8|r8",
                cls: "italic",
                style: { fontWeight: 700 },
                content: "ID Number:",
              },
              {
                span: 8,
                b: "t18|l8|b8|r8",
                cls: "italic",
                style: { fontWeight: 700 },
                content: "Employee Name:",
              },
              {
                span: 8,
                b: "t18|l8|b8|r8",
                cls: "italic",
                style: { fontWeight: 700 },
                content: "Department/Location:",
              },
              {
                span: 2,
                b: "t18|l8|b8|r18",
                cls: "italic",
                style: { fontWeight: 700 },
                content: "Employee Signature",
              },
            ]}
          />
          <Row
            h={771}
            cells={[
              {
                span: 3,
                b: "t8|l18|b8|r8",
                style: { fontWeight: 700 },
                content: form.id_number,
              },
              {
                span: 8,
                b: "t8|l8|b8|r8",
                style: { fontWeight: 700 },
                content: form.employee_name,
              },
              {
                span: 8,
                b: "t8|l8|b8|r8",
                style: { fontWeight: 700 },
                content: form.department,
              },
              {
                span: 2,
                b: "t8|l8|b8|r18",
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
          {/* Date Filed / Position / Number of Days — like the template: the
              vertical rules stay (they ARE the column borders), but the value
              and the band beneath it are one vertically-merged cell, so the
              horizontal between them must go. That keeps a signature drawn
              across the three from being chopped by a cell rule. */}
          <Row
            cells={[
              {
                span: 3,
                b: "t8|l18|b8|r8",
                cls: "italic",
                style: { fontWeight: 700 },
                content: "Date Filed:",
              },
              {
                span: 6,
                b: "t8|l8|b8|r8",
                cls: "italic",
                style: { fontWeight: 700 },
                content: "Position:",
              },
              {
                span: 6,
                b: "t8|l8|b8|r8",
                cls: "italic",
                style: { fontWeight: 700 },
                content: "Number of Days Applied:",
              },
              {
                span: 6,
                b: "t8|l8|b8|r18",
                cls: "italic text-center",
                style: { fontWeight: 700 },
                content: "Inclusive Dates",
              },
            ]}
          />
          <Row
            h={219}
            cells={[
              {
                span: 3,
                b: "t8|l18|r8",
                style: { fontWeight: 700 },
                content: form.date_filed,
              },
              {
                span: 6,
                b: "t8|l8|r8",
                style: { fontWeight: 700 },
                content: form.position,
              },
              {
                span: 6,
                b: "t8|l8|r8",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: form.days_applied,
              },
              {
                span: 5,
                b: "t8|l8|b8|r8",
                cls: "italic text-center",
                style: { fontWeight: 700, fontSize: PT.h9 },
                content: "FROM",
              },
              {
                span: 1,
                b: "t8|l8|b8|r18",
                cls: "italic text-center",
                style: { fontWeight: 700, fontSize: PT.h9 },
                content: "TO",
              },
            ]}
          />
          <Row
            h={466}
            cells={[
              { span: 3, b: "l18|b18|r8", content: "" },
              { span: 6, b: "l8|b18|r8", content: "" },
              { span: 6, b: "l8|b18|r8", content: "" },
              {
                span: 5,
                b: "t8|l8|b18|r8",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: form.date_from,
              },
              {
                span: 1,
                b: "t8|l8|b18|r18",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: form.date_to,
              },
            ]}
          />
          {/* Closing band of the box (8pt, top+bottom only — no verticals). */}
          <Row
            h={240}
            cells={[
              { span: 3, b: "t18|b18", style: { fontSize: PT.h8 }, content: "" },
              { span: 6, b: "t18|b18", style: { fontSize: PT.h8 }, content: "" },
              { span: 7, b: "t18|b18", style: { fontSize: PT.h8 }, content: "" },
              { span: 5, b: "t18|b18", style: { fontSize: PT.h8 }, content: "" },
            ]}
          />

          {/* KINDLY MARK APPROPRIATE BOX — gray bar (thin bottom, sz6). */}
          <Row
            h={350}
            fill={HEADER_FILL}
            cells={[
              {
                span: 21,
                b: "t18|l18|b6|r18",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: "KINDLY MARK APPROPRIATE BOX",
              },
            ]}
          />

          {/* Checkbox grid: 3pt strip, label row, spacer, label row, spacer.
              Box cells carry full sz18 borders (the squares); label cells only
              left+right; spacer cells between boxes have no borders at all.
              Heights are from Word's own render of the template (trHeight plus
              content): strip 8px, label rows ~23px, spacers ~9px. */}
          <Row
            h={120}
            cells={[
              { span: 1, b: "t6|l18", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "t6|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "t6", style: { fontSize: PT.h3 }, content: "" },
              { span: 2, b: "t6|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, b: "t6", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "t6|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "t6|r18", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />
          <Row
            h={350}
            cells={[
              { span: 1, b: "l18|r18", content: "" },
              {
                span: 1,
                b: "t18|l18|b18|r18",
                style: { fontWeight: 700 },
                content: box("Vacation Leave"),
              },
              {
                span: 4,
                b: "l18|r18",
                style: { fontWeight: 700 },
                content: "Vacation Leave",
              },
              {
                span: 2,
                b: "t18|l18|b18|r18",
                style: { fontWeight: 700 },
                content: box("Maternity Leave"),
              },
              {
                span: 8,
                b: "l18|r18",
                style: { fontWeight: 700 },
                content: "Maternity Leave",
              },
              {
                span: 1,
                b: "t18|l18|b18|r18",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Emergency Leave"),
              },
              {
                span: 4,
                b: "l18|r18",
                style: { fontWeight: 700 },
                content: "Emergency Leave",
              },
            ]}
          />
          <Row
            h={130}
            cells={[
              { span: 1, b: "l18", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "NONE", style: { fontSize: PT.h3 }, content: "" },
              { span: 2, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, b: "NONE", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "r18", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />
          <Row
            h={360}
            cells={[
              { span: 1, b: "l18|r18", content: "" },
              {
                span: 1,
                b: "t18|l18|b18|r18",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: box("Sick Leave"),
              },
              { span: 4, b: "l18|r18", style: { fontWeight: 700 }, content: "Sick Leave" },
              {
                span: 2,
                b: "t18|l18|b18|r18",
                style: { fontWeight: 700 },
                content: box("Paternity Leave"),
              },
              { span: 8, b: "l18|r18", style: { fontWeight: 700 }, content: "Paternity Leave" },
              {
                span: 1,
                b: "t18|l18|b18|r18",
                style: { fontWeight: 700 },
                content: box("Bereavement Leave"),
              },
              {
                span: 4,
                b: "l18|r18",
                style: { fontWeight: 700 },
                content: "Bereavement Leave",
              },
            ]}
          />
          <Row
            h={130}
            cells={[
              { span: 1, b: "l18", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "NONE", style: { fontSize: PT.h3 }, content: "" },
              { span: 2, b: "t18", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, b: "NONE", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "t18", style: { fontSize: PT.h3 }, content: "" },
              { span: 4, b: "r18", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />
          {/* Others line + the two pay boxes — bottom-aligned like Word. */}
          <Row
            h={350}
            cells={[
              { span: 1, b: "l18|r18", content: "" },
              {
                span: 1,
                b: "t18|l18|b18|r18",
                style: { fontWeight: 700 },
                content: box("Others"),
              },
              {
                span: 19,
                b: "l18|r18",
                v: "bottom",
                style: { fontWeight: 700, whiteSpace: "pre-wrap" },
                content: othersText,
              },
            ]}
          />
          <Row
            h={130}
            cells={[
              { span: 1, b: "l18|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 1, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" },
              {
                span: 19,
                b: "b18|r18",
                v: "bottom",
                style: { fontSize: PT.h3 },
                content: "",
              },
            ]}
          />
          <Row
            h={120}
            cells={[{ span: 21, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" }]}
          />

          {/* REASONS / REMARKS — gray bar (left-aligned after 54 spaces, as in
              the template), then remarks left / report-back box right. */}
          <Row
            h={235}
            fill={HEADER_FILL}
            cells={[
              {
                span: 21,
                b: "t18|l18|b18|r18",
                style: { fontWeight: 700, fontSize: PT.h12, whiteSpace: "pre" },
                content: "                                                      REASONS / REMARKS",
              },
            ]}
          />
          <Row
            h={517}
            cells={[
              { span: 18, b: "t18|l18|r18", content: "" },
              {
                span: 3,
                b: "t18|l18|r18",
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
            h={750}
            cells={[
              // The three left cells form one borderless-inner column; Word
              // renders the remarks at ~mid-height of that column, so the text
              // lives in this middle slice (relative offset keeps layout intact).
              {
                span: 18,
                b: "l18|r18",
                cls: "text-center",
                style: {
                  fontWeight: 700,
                  fontSize: PT.h12,
                  position: "relative",
                  top: 8,
                },
                content: form.reasons,
              },
              {
                span: 3,
                b: "l18|b18|r18",
                cls: "text-center",
                style: { fontWeight: 700 },
                content: form.report_back_date,
              },
            ]}
          />
          {/* Bottom band — left cell closes with left+bottom only, right cell
              keeps a thin (sz6) bottom; no vertical between them (template). */}
          <Row
            h={765}
            cells={[
              { span: 18, b: "l18|b6", style: { fontSize: PT.h3 }, content: "" },
              { span: 3, b: "t18|b6|r18", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />

          {/* Sick-leave note — gray bar with the two template paragraphs. */}
          <Row
            h={190}
            fill={HEADER_FILL}
            cells={[
              {
                span: 21,
                b: "t6|l18|b18|r18",
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
          <Row
            h={130}
            cells={[{ span: 21, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" }]}
          />

          {/* Approved by / Noted By / Received by — three tall bordered boxes,
              TOP-aligned like the template. Only the approver carries a token;
              the other two print empty for handwriting. */}
          <Row
            h={1480}
            cells={[
              {
                span: 7,
                v: "top",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: (
                  <>
                    <span className="block">Approved by:</span>
                    <span className="block" style={{ height: 36 }} />
                    <span className="block text-center">{form.approved_by}</span>
                    {form.approved_via_viber ? (
                      <span className="block text-center" style={{ color: VIBER_BLUE }}>
                        Approved via Viber
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                span: 7,
                v: "top",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: <span className="block">Noted By:</span>,
              },
              {
                span: 7,
                v: "top",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: <span className="block">Received by:</span>,
              },
            ]}
          />
          <Row
            h={160}
            cells={[
              { span: 5, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" },
              { span: 8, b: "t18|b18", style: { fontSize: PT.h3 }, content: "" },
            ]}
          />

          {/* EMPLOYEE'S LEAVE RECORD — gray bar + the credits table (blank in
              v1). EARNED/BALANCE/Verified keep the template's open gaps: no
              bottom border under the header, no top border on the row below. */}
          <Row
            h={285}
            fill={HEADER_FILL}
            cells={[
              {
                span: 21,
                v: "top",
                b: "t18|l18|b18|r18",
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
                b: "t8|l18|b8|r8",
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "CREDITS",
              },
              {
                span: 3,
                b: "t8|l8|b8|r8",
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "EARNED",
              },
              {
                span: 3,
                b: "t8|l8|b8|r8",
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "USED",
              },
              {
                span: 2,
                b: "t8|l8|b8|r8",
                cls: "text-center",
                style: { fontWeight: 700, fontSize: PT.h12 },
                content: "BALANCE",
              },
              {
                span: 9,
                b: "t18|l8|b4|r18",
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
                b: "t8|l18|b8|r8",
                style: { fontSize: PT.h12 },
                content: "VACATION LEAVE",
              },
              { span: 3, b: "t8|l8|r8", style: { fontSize: PT.h12 }, content: "" },
              { span: 3, b: "t8|l8|b8|r8", style: { fontSize: PT.h12 }, content: "" },
              { span: 2, b: "t8|l8|r8", style: { fontSize: PT.h12 }, content: "" },
              { span: 9, b: "t4|l8|r18", style: { fontSize: PT.h12 }, content: "" },
            ]}
          />
          <Row
            h={252}
            cells={[
              {
                span: 4,
                b: "t8|l18|b18|r8",
                style: { fontSize: PT.h12 },
                content: "SICK LEAVE",
              },
              { span: 3, b: "l8|b18|r8", style: { fontSize: PT.h12 }, content: "" },
              { span: 3, b: "t8|l8|b18|r8", style: { fontSize: PT.h12 }, content: "" },
              { span: 2, b: "l8|b18|r8", style: { fontSize: PT.h12 }, content: "" },
              { span: 9, b: "l8|b18|r18", style: { fontSize: PT.h12 }, content: "" },
            ]}
          />
        </tbody>
      </table>
    </div>
  );
}
