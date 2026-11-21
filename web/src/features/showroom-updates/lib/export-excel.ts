/**
 * Showroom Updates Excel export, client-side like the Inventory board's.
 *
 * The owner's rule: the exported look must match the sheet they supplied, so
 * this reproduces its gold title bar, plum header, per-cell people/status/
 * remarks/vehicle fills and Calibri body rather than dumping a grey table.
 * exceljs is imported dynamically so it stays out of the main bundle until the
 * user actually exports.
 *
 * Rows are the ones currently filtered on screen; the total is the same
 * "status is OPEN" count the PDF prints. Text cells wrap and every row is as
 * tall as its tallest wrapped cell, so a long location or requirement is
 * never cut off at its column edge (owner request, 2026-11-21).
 *
 * Layout, top to bottom, as on the supplied sheet:
 *   row 1  gold title bar     – across the whole table (A:J), centred
 *   row 2  plum "Total Active SR" bar – same span (A:J)
 *   row 3  plum column headers – every column; the four right-hand ones
 *          (Responsible Person … Vehicle) use the slightly lighter plum
 *   rows   one per showroom, and nothing after them
 * The print area is exactly A1:J{last row}, centred horizontally on the page.
 */
import type { ShowroomUpdate } from "@swiftslip/shared/showroom-updates";
import {
  showroomUpdateRemarksMeta,
  showroomUpdateResponsibleMeta,
  showroomUpdateSheetDate,
  showroomUpdateStatusMeta,
  showroomUpdateVehicleMeta,
} from "@swiftslip/shared/showroom-updates";

import { buildShowroomUpdateFileName } from "./file-names";

export { buildShowroomUpdateFileName };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* The sheet's own palette (see showroom-updates-sheet.css). */
const GOLD = "FFF0A93C";
const TITLE = "FF1F3A6E";
const PLUM = "FF3F2B46";
const PLUM_SIDE = "FF4A3552";
const HEAD_TEXT = "FFF2B947";
const GRID = "FF7D7D7D";
const HEAD_RULE = "FF5B476A";
const NO_FILL = "FFF7F7F7";
const TOTAL_INK = "FFFFD34D";

/**
 * Column widths (Excel character units), A…J. Wide enough that every normal
 * value (the longest showroom and location, "Jimmy the Great", "READY TO
 * LAUNCH", "WITH SIDECAR", "23-Sep-2026") sits on ONE line, so each row stays
 * a single line tall like the supplied sheet and the whole board prints on a
 * single A4 landscape page (~75% scale, 7–8 pt body). Only the long Action
 * Required sentence and the hand-broken vehicle label take more than a line;
 * anything else that is longer than its column wraps and grows its row.
 */
const COLUMN_WIDTHS = [4, 25, 54, 8, 24, 26, 15, 16, 12, 14];

/**
 * Above this many rows the page is only fitted one page WIDE: squeezing a
 * long filtered list onto one page would shrink it past reading size.
 */
const ONE_PAGE_MAX_ROWS = 40;

/** A4 landscape printable area in points (page less the margins set below). */
const PRINT_WIDTH_PT = (11.69 - 0.5) * 72;
const PRINT_HEIGHT_PT = (8.27 - 0.6) * 72;
/** Body rows never grow past this multiple, so a short export isn't stretched silly. */
const MAX_ROW_STRETCH = 1.8;

/**
 * Fit-to-page scales by WIDTH, so the single-line rows leave a blank band under
 * the table. Grow the body rows (text stays centred in them) until the table
 * fills the printable height at the print scale, so the page has no empty
 * space at the bottom. A small safety margin keeps it on one page.
 */
function stretchRowsToFillPage(sheet: {
  rowCount: number;
  getRow(index: number): { height?: number };
}): void {
  const sheetWidthPt =
    (COLUMN_WIDTHS.reduce((sum, w) => sum + w, 0) * 7 + COLUMN_WIDTHS.length * 5) * 0.75;
  const scale = Math.min(1, PRINT_WIDTH_PT / sheetWidthPt);
  const budget = (PRINT_HEIGHT_PT / scale) * 0.97;
  const fixed = TITLE_HEIGHT + TOTAL_HEIGHT + HEADER_HEIGHT;

  let body = 0;
  for (let index = 4; index <= sheet.rowCount; index += 1) {
    body += sheet.getRow(index).height ?? BODY_HEIGHT;
  }
  if (body <= 0) return;
  const factor = Math.min(MAX_ROW_STRETCH, (budget - fixed) / body);
  if (factor <= 1) return;
  for (let index = 4; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    row.height = Math.round((row.height ?? BODY_HEIGHT) * factor * 10) / 10;
  }
}

/** Row heights (points). */
const TITLE_HEIGHT = 30;
const TOTAL_HEIGHT = 18;
const HEADER_HEIGHT = 30;
const BODY_HEIGHT = 16;

/** One wrapped line's height for a font size (a 9 pt line is ~12 pt tall). */
function lineBox(fontPt: number): number {
  return (fontPt * 12) / 9;
}

/**
 * How wide one character is, in digit widths — the unit Excel column widths
 * are measured in. Lowercase letters are about one digit, capitals a little
 * more, M/W much more, CJK/fullwidth/emoji about two, and thin marks
 * (i l t f r j . , spaces) about half. Weighing glyphs instead of counting
 * characters keeps the line estimate honest for an ALL-CAPS or non-Latin
 * value.
 */
function glyphWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f9ff)
  ) {
    return 2;
  }
  if ("MWmw".includes(char)) return 1.7;
  if (char >= "A" && char <= "Z") return 1.2;
  if (" iIl.,'|!(){}[]-:;\"tfrj".includes(char)) return 0.55;
  return 1;
}

function measure(text: string): number {
  let sum = 0;
  for (const char of text) sum += glyphWidth(char);
  return sum;
}

/**
 * How many printed lines a cell needs at a column width.
 *
 * Excel wraps on word boundaries, so a line is rarely full: the next word
 * jumps down while there is still room, and a long location needs a line more
 * than total-length / line-length suggests (that undercount is what clipped
 * the bottom of tall cells). This therefore lays words out greedily, line by
 * line, the way Excel does:
 *  - the usable line is the column width less the cell's side padding, in
 *    11 pt digit widths, so a smaller font fits proportionally more, and
 *    bold text (a little wider) gets a slightly shorter line;
 *  - manual line breaks (the three-line vehicle label) each start a line;
 *  - a single word wider than a line is split across lines.
 * The line is deliberately a touch shorter than Excel's real one, so the
 * estimate can ask for one line too many but never one too few. The 12-line
 * cap keeps a pathological value from turning into a 400 pt row.
 */
function wrappedLines(
  value: string | null | undefined,
  width: number,
  fontPt: number,
  bold = false,
): number {
  const text = value?.trim() ?? "";
  if (!text) return 1;
  const capacity = Math.max(1, (width - 1) * (11 / fontPt) * (bold ? 0.87 : 0.95));
  const space = glyphWidth(" ");

  let lines = 0;
  for (const segment of text.split("\n")) {
    let segmentLines = 1;
    let used = 0;
    for (const word of segment.split(/\s+/).filter(Boolean)) {
      const wordWidth = measure(word);
      const joined = used === 0 ? wordWidth : used + space + wordWidth;
      if (joined <= capacity) {
        used = joined;
        continue;
      }
      // The word starts a new line (the first word of a segment already does).
      if (used > 0) segmentLines += 1;
      if (wordWidth > capacity) {
        const extra = Math.ceil(wordWidth / capacity) - 1;
        segmentLines += extra;
        used = wordWidth - extra * capacity;
      } else {
        used = wordWidth;
      }
    }
    lines += segmentLines;
  }
  return Math.min(12, lines);
}

/** One cell that wraps: its text, its column width and its font. */
type WrappedCell = {
  text: string | null | undefined;
  width: number;
  fontPt: number;
  bold?: boolean;
};

/** Height for one body row, driven by its tallest wrapped cell. */
function bodyHeight(cells: readonly WrappedCell[]): number {
  let tallest = 0;
  for (const cell of cells) {
    tallest = Math.max(
      tallest,
      wrappedLines(cell.text, cell.width, cell.fontPt, cell.bold) * lineBox(cell.fontPt),
    );
  }
  return Math.max(BODY_HEIGHT, Math.round(tallest + 5));
}

const STATUS_FILL: Record<string, { fill: string; ink: string }> = {
  open: { fill: "FF1E6A4D", ink: "FFDFF3EA" },
  ready: { fill: "FFE4F0C8", ink: "FF444444" },
  in_progress: { fill: "FF2C72B4", ink: "FFD7E8F7" },
  pending: { fill: "FFC0504D", ink: "FFF5D6D4" },
};

const PERSON_FILL: Record<string, { fill: string; ink: string }> = {
  jimmy: { fill: "FFFFFFFF", ink: "FF222222" },
  jonnah: { fill: "FFF4C7C4", ink: "FFA8625D" },
  maynard: { fill: "FF1E6A4D", ink: "FF9FCBB7" },
  jeanette: { fill: "FFF6CF8F", ink: "FF3B3B3B" },
  marvin: { fill: "FF4A3A8E", ink: "FFA99BDC" },
  ivanray: { fill: "FF121212", ink: "FF8A8A8A" },
};

const REMARKS_FILL: Record<string, { fill: string; ink: string }> = {
  fully_operational: { fill: "FFF4B183", ink: "FF6A3515" },
  ready_to_launch: { fill: "FF2E8B57", ink: "FF5A1F12" },
  ongoing: { fill: "FF9DC3E6", ink: "FFFFFFFF" },
};

const VEHICLE_FILL: Record<string, { fill: string; ink: string }> = {
  with_sidecar: { fill: "FFF4B2A4", ink: "FF6A3515" },
  with_and_without_sidecar: { fill: "FF1F7A76", ink: "FFCDEEEE" },
  requested: { fill: "FF2F6FBF", ink: "FFB7D2F0" },
  none: { fill: "FFD5C6E4", ink: "FF5B4A72" },
};

/** Font sizes (pt) per column. Small, like the sheet, but legible. */
const STATUS_SIZE = 8;
const STATUS_READY_SIZE = 9;
const VEHICLE_SIZE = 7;
const VEHICLE_BOTH_SIZE = 6;

type CellPaint = { fill?: string; ink?: string };

/**
 * Builds the workbook without touching the DOM, so the layout can be checked
 * (and re-used) outside the browser. `downloadShowroomUpdatesWorkbook` is the
 * only caller in the app.
 */
export async function buildShowroomUpdatesWorkbook(rows: ShowroomUpdate[], totalActive: number) {
  // exceljs ships CommonJS: `require`/ESM `default` is the exports object
  // (`{ Workbook, ... }`), while the typings describe named exports.
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("SR Status", {
    // Gridlines off so the empty corners of rows 1–2 read as white.
    views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      // One page, like the supplied sheet; 0 = as many pages as needed.
      fitToHeight: rows.length <= ONE_PAGE_MAX_ROWS ? 1 : 0,
      horizontalCentered: true,
      printTitlesRow: "1:3",
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.2, footer: 0.2 },
    },
  });

  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  /* ------------------------------------------------- title + total row - */

  // Both bars span the whole table (A:J), so the heading is centred over it
  // and no blank corners are left at the top of the printed page.
  sheet.mergeCells("A1:J1");
  const title = sheet.getCell("A1");
  title.value = "SUMMARY OF SR STATUS AND UPDATES";
  title.font = { name: "Courier New", size: 20, bold: true, color: { argb: TITLE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = TITLE_HEIGHT;

  sheet.mergeCells("A2:J2");
  const total = sheet.getCell("A2");
  total.value = {
    richText: [
      {
        font: { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } },
        text: "Total Active SR : ",
      },
      {
        font: { name: "Calibri", size: 13, bold: true, color: { argb: TOTAL_INK } },
        text: String(totalActive),
      },
    ],
  };
  total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PLUM } };
  total.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(2).height = TOTAL_HEIGHT;

  /* ----------------------------------------------------------- header - */

  const header = [
    "No.",
    "Showroom",
    "Location",
    "Status",
    "Lacking Requirements / Missing Documents",
    "Action Required",
    "Responsible Person",
    "Remarks",
    "Date Open",
    "Vehicle",
  ];
  const headerRow = sheet.getRow(3);
  headerRow.values = header;
  headerRow.height = HEADER_HEIGHT;
  headerRow.eachCell((cell, column) => {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: HEAD_TEXT } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      // Responsible Person … Vehicle use the lighter plum, as on the sheet.
      fgColor: { argb: column >= 7 ? PLUM_SIDE : PLUM },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: HEAD_RULE } },
      left: { style: "thin", color: { argb: HEAD_RULE } },
      bottom: { style: "thin", color: { argb: HEAD_RULE } },
      right: { style: "thin", color: { argb: HEAD_RULE } },
    };
  });

  /* ------------------------------------------------------------- body - */

  rows.forEach((row) => {
    const status = showroomUpdateStatusMeta(row.status);
    const person = showroomUpdateResponsibleMeta(row.responsible_person);
    const remarks = showroomUpdateRemarksMeta(row.remarks);
    const vehicle = showroomUpdateVehicleMeta(row.vehicle);
    // The owner's sheet breaks this one label by hand.
    const vehicleLabel =
      row.vehicle === "with_and_without_sidecar"
        ? "WITH SIDECAR &\nWITHOUT\nSIDECAR"
        : (vehicle?.label ?? "");
    const statusLabel = status?.label ?? "";
    const personLabel = person?.label ?? "";
    const remarksLabel = remarks?.label ?? "";
    const isReady = row.status === "ready";
    const statusSize = isReady ? STATUS_READY_SIZE : STATUS_SIZE;
    const vehicleSize =
      row.vehicle === "with_and_without_sidecar" ? VEHICLE_BOTH_SIZE : VEHICLE_SIZE;
    const line = sheet.addRow([
      row.sr_no,
      row.showroom_name,
      row.location,
      statusLabel,
      row.requirements ?? "",
      row.action_required ?? "",
      personLabel,
      remarksLabel,
      showroomUpdateSheetDate(row.open_date),
      vehicleLabel,
    ]);
    // Cells wrap, so the row must be as tall as its tallest wrapped cell;
    // each entry uses the same width, font size and weight its cell is
    // painted with below.
    line.height = bodyHeight([
      { text: row.showroom_name, width: COLUMN_WIDTHS[1]!, fontPt: 10, bold: true },
      { text: row.location, width: COLUMN_WIDTHS[2]!, fontPt: 10 },
      { text: statusLabel, width: COLUMN_WIDTHS[3]!, fontPt: statusSize, bold: isReady },
      { text: row.requirements, width: COLUMN_WIDTHS[4]!, fontPt: 9 },
      { text: row.action_required, width: COLUMN_WIDTHS[5]!, fontPt: 9 },
      { text: personLabel, width: COLUMN_WIDTHS[6]!, fontPt: 9 },
      {
        text: remarksLabel,
        width: COLUMN_WIDTHS[7]!,
        fontPt: 8,
        bold: row.remarks === "ready_to_launch",
      },
      { text: vehicleLabel, width: COLUMN_WIDTHS[9]!, fontPt: vehicleSize, bold: true },
    ]);

    const paintCell = (
      column: number,
      value: string | number,
      options: CellPaint & {
        bold?: boolean;
        size?: number;
        align?: "left" | "center";
        /** Defaults to true: a cell wraps instead of being cut short. */
        wrap?: boolean;
      },
    ) => {
      const cell = line.getCell(column);
      cell.value = value;
      cell.font = {
        name: "Calibri",
        size: options.size ?? 10,
        bold: options.bold ?? false,
        color: { argb: options.ink ?? "FF111111" },
      };
      cell.alignment = {
        horizontal: options.align ?? "center",
        vertical: "middle",
        wrapText: options.wrap ?? true,
      };
      if (options.fill) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.fill } };
      }
      cell.border = {
        top: { style: "thin", color: { argb: GRID } },
        left: { style: "thin", color: { argb: GRID } },
        bottom: { style: "thin", color: { argb: GRID } },
        right: { style: "thin", color: { argb: GRID } },
      };
    };

    // A real number, not a string: Excel otherwise flags every No. cell with
    // its green "number stored as text" triangle.
    paintCell(1, row.sr_no, { fill: NO_FILL, bold: true });
    paintCell(2, row.showroom_name, { align: "left", bold: true });
    paintCell(3, row.location, { align: "left" });
    paintCell(4, statusLabel, {
      ...(row.status ? (STATUS_FILL[row.status] ?? {}) : {}),
      bold: isReady,
      size: statusSize,
    });
    paintCell(5, row.requirements ?? "", { size: 9 });
    paintCell(6, row.action_required ?? "", { size: 9 });
    paintCell(7, personLabel, {
      ...(row.responsible_person ? (PERSON_FILL[row.responsible_person] ?? {}) : {}),
      size: 9,
    });
    paintCell(8, remarksLabel, {
      ...(row.remarks ? (REMARKS_FILL[row.remarks] ?? {}) : {}),
      bold: row.remarks === "ready_to_launch",
      size: 8,
    });
    paintCell(9, showroomUpdateSheetDate(row.open_date), { bold: true, size: 10, wrap: false });
    paintCell(10, vehicleLabel, {
      ...(row.vehicle ? (VEHICLE_FILL[row.vehicle] ?? {}) : {}),
      bold: true,
      // The owner's sheet breaks the with-and-without label by hand onto
      // three lines; every other label fits the column on one line and wraps
      // if a longer one ever appears.
      size: vehicleSize,
    });
  });

  /* ------------------------------------------------ no trailing rows - */

  // The workbook ends with the last real showroom. There are deliberately no
  // numbered-but-empty rows at the bottom: the owner asked for them to be
  // removed completely (2026-11-21), so a full-board export ends exactly on
  // its last data row, same as a filtered one.

  // One-page exports: let the rows fill the page height (no blank band below).
  if (rows.length <= ONE_PAGE_MAX_ROWS) stretchRowsToFillPage(sheet);

  // Print exactly the table: no stray empty column or trailing blank rows,
  // so the page centres on the data and never spills an empty second page.
  sheet.pageSetup.printArea = `A1:J${sheet.rowCount}`;

  return workbook;
}

export async function downloadShowroomUpdatesWorkbook(
  rows: ShowroomUpdate[],
  totalActive: number,
  now: Date = new Date(),
): Promise<void> {
  const workbook = await buildShowroomUpdatesWorkbook(rows, totalActive);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildShowroomUpdateFileName(now);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
