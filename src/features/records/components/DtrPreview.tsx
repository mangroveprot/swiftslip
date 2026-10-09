import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { APP } from "@/config/app";
import { formatPeriodDateRange, formatShortDate } from "@/shared/period";
import type { DtrEntry, DtrHeader, DtrTemplate } from "@/shared/types";

/** Company form fill colour used for the title bar + column-header row. */
const TEMPLATE_HEADER_FILL = "#bfbfbf";

/** Sheet width in px at 96dpi: 5.76in table + 2 × 0.7in side padding. */
const SHEET_W_PX = 687;
/** Same typeface as the Word form, so wrapping matches the export. */
const SHEET_FONT = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';

/**
 * Layout metrics for the sheet, kept in one place so the numbers are easy to
 * compare against the form they replicate:
 *
 * - `GAP` — space between the stacked blocks above the signature
 * - `CELL_H` / `LOG_ROW_H` / `LOG_HEAD_H` — the field row heights
 * - `SIGN_MARGIN` / `CERT_MARGIN` — the signature block's spacing
 * - the three `COLS_*` groups — the column proportions of each table
 */
const GAP = "mb-[0.18in]";
const CELL_H = "h-[0.3in]";
const LOG_ROW_H = "h-[0.29in]";
const LOG_HEAD_H = "h-[0.34in]";
const SIGN_MARGIN = "mt-[0.45in]";
const CERT_MARGIN = "mt-[0.3in] mb-[0.35in]";
/** Header table: label, narrow value, narrow value, wide filler. */
const COLS_HEADER = ["12%", "11.2%", "5.7%", "71.1%"];
/** Log table: DATE is wider because it holds a full "MM/DD/YY" date. */
const COLS_LOG = ["11.5%", "14.7%", "15.5%", "31.4%", "26.9%"];
/** Month/year table: label, value, label, value. */
const COLS_MONTH = ["12%", "32%", "12%", "44%"];
/** Rule under the signature lines. */
const RULE_W = "1.5px";

/**
 * The sheet is laid out at its true size (inches / 11pt), so on a narrow panel
 * it would overflow. This renders it at a fixed design width and scales the
 * whole thing down (or up) to fit the container, keeping every column and label
 * in proportion. The print rule undoes the scaling.
 */
function FitToWidth({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, left: 0, height: 0 });

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const update = () => {
      const scale = Math.min(o.clientWidth / SHEET_W_PX, 1.5);
      setFit({
        scale,
        left: Math.max(0, (o.clientWidth - SHEET_W_PX * scale) / 2),
        height: i.offsetHeight * scale,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    // The sheet is absolutely positioned, so it adds nothing to this box's width.
    // The width comes only from the parent, and the height is set from the scaled sheet.
    <div
      ref={outer}
      className="dtr-fit relative w-full min-w-0 overflow-hidden"
      style={{ height: fit.height || undefined }}
    >
      <style>{`@media print{.dtr-fit{height:auto!important;overflow:visible!important}.dtr-fit-inner{position:static!important;transform:none!important;width:auto!important}}`}</style>
      <div
        ref={inner}
        className="dtr-fit-inner absolute top-0"
        style={{
          left: fit.left,
          width: SHEET_W_PX,
          transform: `scale(${fit.scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function DtrPreview({
  template,
  header,
  days,
  entryFor,
  sheetId,
}: {
  template: DtrTemplate;
  header: DtrHeader;
  days: number[];
  entryFor: (day: number) => DtrEntry;
  /** DOM id for the sheet — only the inline editor copy carries one, so the
   *  full-view lightbox copy can never produce a duplicate id. */
  sheetId?: string;
}) {
  const monthRange = formatPeriodDateRange(header.period, header.month, header.year);

  return (
    <FitToWidth>
      <div
        id={sheetId}
        className="print-sheet w-full bg-paper px-[0.7in] pt-[0.5in] pb-[0.5in] text-[11pt] leading-[1.25] text-ink shadow-sm ring-1 ring-border"
        style={{ fontFamily: SHEET_FONT }}
      >
        <img
          src={APP.logoPath}
          alt=""
          className="mb-1.5 block w-[1.55in] object-contain object-left"
        />

        <table className={`w-full table-fixed border-collapse border border-ink ${GAP}`}>
          <tbody>
            <tr>
              <td
                className="border border-ink text-center font-bold"
                style={{ backgroundColor: TEMPLATE_HEADER_FILL }}
              >
                {template.title}
              </td>
            </tr>
          </tbody>
        </table>

        <table className={`w-full table-fixed border-collapse ${GAP}`}>
          <Colgroup widths={COLS_HEADER} />
          <tbody>
            <HeaderRow label="EMP NO." value={header.emp_no} labelSpan={1} valueSpan={2} filler />
            <HeaderRow label="NAME" value={header.name} labelSpan={1} valueSpan={3} />
            <HeaderRow label="DESIGNATION" value={header.designation} labelSpan={2} valueSpan={2} />
            <HeaderRow label="AREA" value={header.area} labelSpan={1} valueSpan={3} />
          </tbody>
        </table>

        <table className={`w-full table-fixed border-collapse border border-ink ${GAP}`}>
          <Colgroup widths={COLS_MONTH} />
          <tbody>
            <tr>
              <td className={`border border-ink px-[4px] py-[2px] text-center ${CELL_H}`}>MONTH</td>
              <td className={`border border-ink px-[4px] py-[2px] ${CELL_H}`}>{monthRange}</td>
              <td className={`border border-ink px-[4px] py-[2px] text-center ${CELL_H}`}>YEAR</td>
              <td className={`border border-ink px-[4px] py-[2px] ${CELL_H}`}>{header.year}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full table-fixed border-collapse border border-ink text-center">
          <Colgroup widths={COLS_LOG} />
          <thead>
            {/* `whitespace-nowrap` keeps the header row at its intended height. */}
            <tr className="font-bold" style={{ backgroundColor: TEMPLATE_HEADER_FILL }}>
              <th className={`border border-ink px-[4px] whitespace-nowrap ${LOG_HEAD_H}`}>DATE</th>
              <th className={`border border-ink px-[4px] whitespace-nowrap ${LOG_HEAD_H}`}>
                {template.columns.in}
              </th>
              <th className={`border border-ink px-[4px] whitespace-nowrap ${LOG_HEAD_H}`}>
                {template.columns.out}
              </th>
              <th className={`border border-ink px-[4px] whitespace-nowrap ${LOG_HEAD_H}`}>
                {template.columns.schedule}
              </th>
              <th className={`border border-ink px-[4px] whitespace-nowrap ${LOG_HEAD_H}`}>
                {template.columns.remarks}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const e = entryFor(d);
              return (
                <tr key={d}>
                  <td className={`border border-ink px-[4px] pb-[2px] align-top ${LOG_ROW_H}`}>
                    {formatShortDate(d, header.month, header.year)}
                  </td>
                  <td className={`border border-ink px-[4px] pb-[2px] align-top ${LOG_ROW_H}`}>
                    {e.time_in}
                  </td>
                  <td className={`border border-ink px-[4px] pb-[2px] align-top ${LOG_ROW_H}`}>
                    {e.time_out}
                  </td>
                  <td className={`border border-ink px-[4px] pb-[2px] align-top ${LOG_ROW_H}`}>
                    {e.schedule}
                  </td>
                  <td className={`border border-ink px-[4px] pb-[2px] align-top ${LOG_ROW_H}`}>
                    {e.remarks}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className={SIGN_MARGIN}>
          {/* Name and signature share this block so the strokes cross the printed
              name; the height is the signature's own box. */}
          <div className="relative mx-auto flex h-[4.75rem] w-full max-w-md items-end justify-center">
            {header.name ? (
              <p className="absolute bottom-1 left-1/2 z-0 -translate-x-1/2 text-center text-[11px] font-medium tracking-wide text-ink">
                {header.name}
              </p>
            ) : null}
            {header.employee_signature ? (
              <img
                src={header.employee_signature}
                alt=""
                className="relative z-10 mb-[-2px] h-[4.25rem] w-auto max-w-[18rem] object-contain mix-blend-multiply"
              />
            ) : null}
          </div>
          <div className="border-ink border-b" style={{ borderBottomWidth: RULE_W }} />
          <p className="pt-[3px] text-center">{template.employee_signature_label}</p>

          <p className={CERT_MARGIN}>{template.certified_by_label}</p>
          <p className="text-center font-medium">{header.certified_by}</p>
          <div className="mt-[0.2in] border-ink border-b" style={{ borderBottomWidth: RULE_W }} />
          <p className="pt-[3px]">{template.certifier_signature_label}</p>
        </div>
      </div>
    </FitToWidth>
  );
}

/** Column widths for a fixed-layout table. */
function Colgroup({ widths }: { widths: string[] }) {
  return (
    <colgroup>
      {widths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

function HeaderRow({
  label,
  value,
  labelSpan,
  valueSpan,
  filler,
}: {
  label: string;
  value: string;
  /** How many columns the label covers. */
  labelSpan: number;
  /** How many the value covers — the rest of the row. */
  valueSpan: number;
  /** EMP NO. leaves the far-right cell blank (borderless). */
  filler?: boolean;
}) {
  return (
    <tr>
      <td colSpan={labelSpan} className={`border border-ink px-[4px] py-[2px] ${CELL_H}`}>
        {label}
      </td>
      <td colSpan={valueSpan} className={`border border-ink px-[4px] py-[2px] ${CELL_H}`}>
        {value}
      </td>
      {filler ? <td className="border-0" /> : null}
    </tr>
  );
}
