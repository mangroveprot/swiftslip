/**
 * Excel export — client-side port of `InventoryReportService.BuildExcelAsync`
 * (ClosedXML), built on dynamically imported exceljs the same way
 * `word-export.ts` keeps `docx` out of the main bundle.
 *
 * Same recipe as the original service:
 *   1. load the blank `report_template.xlsx` shipped in `/inventory/`
 *   2. clone the template sheet once per floor sheet (ClosedXML `proto.CopyTo`)
 *   3. `FillSheet` — titles, grow/shrink the data block to the real row count,
 *      wipe the sample rows, write the asset rows, rebuild the totals block,
 *      then `ApplyFlexibleLayout` (landscape fit-to-width, wrap text,
 *      content-sized columns)
 *   4. delete the template copy and activate the first sheet
 *
 * Cell-for-cell equality with the original .NET output is enforced by the
 * golden test in `scripts/inventory-report-golden/`.
 */
import type { Alignment, Cell, CellValue, Row, Style, Workbook, Worksheet } from "exceljs";
import type { InventoryReportDocument, ReportAssetRow, ReportFloorSheet } from "@/shared/inventory";

/* ------------------------------------------------------------ template --- */

const FIRST_DATA_ROW = 5;
const TEMPLATE_DATA_ROWS = 20;
const BLANK_ROWS_BEFORE_TOTALS = 4; // breathing room under the table
const DATA_COLUMNS = 13;
const HEADER_ROW = FIRST_DATA_ROW - 1; // 4 — column titles
const TEMPLATE_SHEET_NAME = "__template__";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * `Path.GetInvalidFileNameChars()` — quotes, angle brackets, separators,
 * wildcards and control chars 0x00-0x1F. Built via `fromCharCode` so the
 * source file itself carries no control bytes.
 */
const INVALID_FILENAME_CHARS = new RegExp(
  `["<>:/\\\\|?*${String.fromCharCode(0)}-${String.fromCharCode(31)}]+`,
  "g",
);

/**
 * Minimum width per column group (NoC) — `AdjustToContents(min,
 * double.MaxValue)`: breathing room only, no upper cap, so a long value
 * (Notes, serial strings) widens its column instead of being compressed
 * and wrapped into clipped rows.
 */
const COLUMN_MINIMUMS: Record<number, number> = {
  2: 12, // monitor / keyboard
  3: 12,
  6: 14, // assigned / dept / location
  7: 14,
  8: 14,
  13: 16, // notes
  5: 8, // cubicle / status / condition / floor / installed
  9: 8,
  10: 8,
  11: 8,
  12: 8,
};
const DEFAULT_MINIMUM = 10; // item id / asset type

/* ------------------------------------------------------------ measuring -- */

/**
 * Codepoint ranges covered by the glyph-advance tables below: printable
 * ASCII + Latin-1 + Latin Extended-A, general punctuation (dashes, quotes,
 * ellipsis) and currency symbols (incl. ₱ where the font has it). Anything
 * outside the ranges — or missing from the font — falls back to the
 * `.notdef` advance, which is what SixLabors.Fonts reports to ClosedXML too.
 */
const FONT_ADVANCE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x17f],
  [0x2000, 0x206f],
  [0x20a0, 0x20bf],
];

/**
 * Glyph advance widths in font units (unitsPerEm 2048), extracted from
 * `C:\Windows\Fonts\arial.ttf` and `calibri.ttf` (cmap + hmtx) — the two
 * families the template's cells use. Data rows are Arial 9; cells outside
 * the template's style range (rows 23-24) fall back to the workbook default
 * Calibri 11.
 */
interface FontMetrics {
  readonly upem: number;
  readonly notdef: number;
  readonly advances: readonly number[];
}

const FONT_METRICS: Readonly<Record<string, FontMetrics | undefined>> = {
  Arial: {
    upem: 2048,
    notdef: 1536,
    advances: [
      569, 569, 727, 1139, 1139, 1821, 1366, 391, 682, 682, 797, 1196, 569, 682, 569, 569, 1139,
      1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 569, 569, 1196, 1196, 1196, 1139, 2079,
      1366, 1366, 1479, 1479, 1366, 1251, 1593, 1479, 569, 1024, 1366, 1139, 1706, 1479, 1593, 1366,
      1593, 1479, 1366, 1251, 1479, 1366, 1933, 1366, 1366, 1251, 569, 569, 569, 961, 1139, 682,
      1139, 1139, 1024, 1139, 1139, 569, 1139, 1139, 455, 455, 1024, 455, 1706, 1139, 1139, 1139,
      1139, 682, 1024, 569, 1139, 1024, 1479, 1024, 1024, 1024, 684, 532, 684, 1196, 1536, 1536,
      1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536,
      1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536,
      1536, 569, 682, 1139, 1139, 1139, 1139, 532, 1139, 682, 1509, 758, 1139, 1196, 682, 1509,
      1131, 819, 1124, 682, 682, 682, 1180, 1100, 682, 682, 682, 748, 1139, 1708, 1708, 1708, 1251,
      1366, 1366, 1366, 1366, 1366, 1366, 2048, 1479, 1366, 1366, 1366, 1366, 569, 569, 569, 569,
      1479, 1479, 1593, 1593, 1593, 1593, 1593, 1196, 1593, 1479, 1479, 1479, 1479, 1366, 1366,
      1251, 1139, 1139, 1139, 1139, 1139, 1139, 1821, 1024, 1139, 1139, 1139, 1139, 569, 569, 569,
      569, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1124, 1251, 1139, 1139, 1139, 1139, 1024, 1139,
      1024, 1366, 1139, 1366, 1139, 1366, 1139, 1479, 1024, 1479, 1024, 1479, 1024, 1479, 1024,
      1479, 1259, 1479, 1139, 1366, 1139, 1366, 1139, 1366, 1139, 1366, 1139, 1366, 1139, 1593,
      1139, 1593, 1139, 1593, 1139, 1593, 1139, 1479, 1139, 1479, 1139, 569, 569, 569, 569, 569,
      569, 569, 455, 569, 569, 1505, 909, 1024, 455, 1366, 1024, 1024, 1139, 455, 1139, 455, 1139,
      597, 1139, 684, 1139, 455, 1479, 1139, 1479, 1139, 1479, 1139, 1237, 1481, 1139, 1593, 1139,
      1593, 1139, 1593, 1139, 2048, 1933, 1479, 682, 1479, 682, 1479, 682, 1366, 1024, 1366, 1024,
      1366, 1024, 1366, 1024, 1251, 569, 1251, 768, 1251, 569, 1479, 1139, 1479, 1139, 1479, 1139,
      1479, 1139, 1479, 1139, 1479, 1139, 1933, 1479, 1366, 1024, 1366, 1251, 1024, 1251, 1024,
      1251, 1024, 455, 1024, 2048, 1024, 2048, 683, 512, 341, 1139, 569, 410, 171, 0, 0, 0, 0, 0,
      1536, 1536, 1139, 1139, 2048, 2048, 846, 1131, 455, 455, 455, 455, 682, 682, 682, 682, 1139,
      1139, 717, 1536, 1536, 1536, 2048, 1536, 1536, 1536, 0, 0, 0, 0, 0, 410, 2048, 1536, 384, 725,
      725, 1536, 1536, 1536, 1536, 682, 682, 1536, 1024, 1139, 682, 1536, 1536, 1536, 1536, 1536,
      342, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536,
      1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 1536, 569, 1536, 1536, 1536, 1536, 1536,
      1536, 1536, 1536, 1536, 1536, 1536, 0, 0, 0, 0, 0, 0, 1139, 1479, 1479, 1139, 1139, 1706,
      1479, 2240, 2384, 1933, 1670, 1051, 1139, 1366, 1251, 2048, 1067, 1366, 1593, 1366, 1139,
      1479, 1139, 1366, 1251, 1139, 1139, 1699, 1610, 1139, 1627, 1366,
    ],
  },
  Calibri: {
    upem: 2048,
    notdef: 1038,
    advances: [
      463, 667, 821, 1020, 1038, 1464, 1397, 452, 621, 621, 1020, 1020, 511, 627, 517, 791, 1038,
      1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 548, 548, 1020, 1020, 1020, 949, 1831,
      1185, 1114, 1092, 1260, 1000, 941, 1292, 1276, 516, 653, 1064, 861, 1751, 1322, 1356, 1058,
      1378, 1112, 941, 998, 1314, 1162, 1822, 1063, 998, 959, 628, 791, 628, 1020, 1020, 596, 981,
      1076, 866, 1076, 1019, 625, 964, 1076, 470, 490, 931, 470, 1636, 1076, 1080, 1076, 1076, 714,
      801, 686, 1076, 925, 1464, 887, 927, 809, 644, 943, 644, 1020, 1038, 1038, 1038, 1038, 1038,
      1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038,
      1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 463, 667, 1020,
      1038, 1020, 1038, 1020, 1020, 804, 1709, 824, 1049, 1020, 627, 1038, 807, 694, 1020, 688, 685,
      598, 1126, 1200, 517, 629, 504, 865, 1049, 1303, 1375, 1383, 949, 1185, 1185, 1185, 1185,
      1185, 1185, 1563, 1092, 1000, 1000, 1000, 1000, 516, 516, 516, 516, 1279, 1322, 1356, 1356,
      1356, 1356, 1356, 1020, 1359, 1314, 1314, 1314, 1314, 998, 1058, 1080, 981, 981, 981, 981,
      981, 981, 1583, 866, 1019, 1019, 1019, 1019, 470, 470, 470, 470, 1076, 1076, 1080, 1080, 1080,
      1080, 1080, 1020, 1084, 1076, 1076, 1076, 1076, 927, 1076, 927, 1185, 981, 1185, 981, 1185,
      981, 1092, 866, 1092, 866, 1092, 866, 1092, 866, 1260, 1164, 1279, 1130, 1000, 1019, 1000,
      1019, 1000, 1019, 1000, 1019, 1000, 1019, 1292, 964, 1292, 964, 1292, 964, 1292, 964, 1276,
      1076, 1344, 1091, 516, 470, 516, 470, 516, 470, 516, 470, 516, 470, 1170, 960, 653, 490, 1064,
      931, 931, 861, 470, 861, 470, 866, 540, 1118, 765, 880, 507, 1322, 1076, 1322, 1076, 1322,
      1076, 1186, 1287, 1076, 1356, 1080, 1356, 1080, 1356, 1080, 1775, 1740, 1112, 714, 1112, 714,
      1112, 714, 941, 801, 941, 801, 941, 801, 941, 801, 998, 686, 998, 708, 998, 700, 1314, 1076,
      1314, 1076, 1314, 1076, 1314, 1076, 1314, 1076, 1314, 1076, 1822, 1464, 998, 927, 998, 959,
      809, 959, 809, 959, 809, 497, 1024, 2048, 1024, 2048, 687, 512, 341, 1104, 444, 409, 256, 0,
      0, 0, 0, 0, 627, 1038, 1038, 1020, 1854, 1854, 809, 1020, 511, 511, 511, 511, 857, 857, 857,
      856, 1020, 1020, 1020, 1038, 517, 1038, 1414, 1038, 1038, 1038, 0, 0, 0, 0, 0, 463, 2126,
      1038, 452, 820, 1188, 1038, 1038, 1038, 800, 694, 694, 1038, 1142, 990, 1020, 1038, 1038,
      1038, 1038, 1038, 689, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038,
      1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 548, 455, 1038,
      1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038,
      1262, 1092, 1092, 941, 1038, 1636, 1322, 1888, 1608, 1822, 1525, 1130, 1038, 1064, 998, 2216,
      1082, 1154, 1202, 1173, 941, 1092, 1236, 1476, 1038, 1038, 1038, 1316, 1367, 1038, 1341, 1201,
    ],
  },
};

/** The workbook's default cell font (template style0) — clamps use its MDW. */
const DEFAULT_CELL_FONT = { name: "Calibri", size: 11 } as const;

/** `XLConstants.ColumnWidthOffset` — ClosedXML saves `Width + this`. */
const COLUMN_WIDTH_OFFSET = 0.710625;

/* ---------------------------------------------------------------- export - */

/**
 * Port of the original download file name:
 * `$"REGASCO_{safe}_inventory_{DateTime.Now:yyyyMMdd}.xlsx"` with
 * `Path.GetInvalidFileNameChars()` split out.
 */
export function buildReportFileName(branchName: string): string {
  const safe = branchName
    .split(INVALID_FILENAME_CHARS)
    .filter((part) => part.length > 0)
    .join("_");
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `REGASCO_${safe}_inventory_${stamp}.xlsx`;
}

/** Fetches the template shipped in `public/inventory/` (browser only). */
async function fetchTemplateBytes(): Promise<ArrayBuffer> {
  const response = await fetch("/inventory/report_template.xlsx");
  if (!response.ok) {
    throw new Error(`Could not load the Excel template (HTTP ${response.status}).`);
  }
  return await response.arrayBuffer();
}

/**
 * The template anchors the header logo with a two-cell anchor, but its
 * rendered size lives in the picture's `spPr/a:xfrm <a:ext cx cy>` (EMU).
 * ClosedXML reloads that size on load (`Convert.ToInt32(emu × dpi / 914400)`)
 * and re-saves the picture as a one-cell anchor in whole pixels — golden.xlsx
 * ships `ext 72×78`. exceljs keeps only from/to positions, so the drawing is
 * the one place the size can be recovered from.
 */
async function readTemplateImageExt(
  bytes: ArrayBuffer,
): Promise<{ width: number; height: number }> {
  const mod = await import("jszip");
  // CJS interop: the namespace may carry `default = module.exports` (Node,
  // bundler) or be the exports object itself — accept either shape.
  const JSZip = mod.default ?? mod;
  const zip = await JSZip.loadAsync(bytes);
  const drawingNames = Object.keys(zip.files)
    .filter((name) => /^xl\/drawings\/drawing\d+\.xml$/.test(name))
    .sort();
  for (const name of drawingNames) {
    const xml = await zip.file(name)?.async("string");
    if (!xml) continue;
    const match = /<a:xfrm[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/.exec(xml);
    if (match) {
      // EMU → pixels at 96 dpi. An integer EMU count can never land exactly
      // on .5 (the quantum is 1/9525 px), so Math.round == Convert.ToInt32.
      return {
        width: Math.round((Number(match[1]) * 96) / 914400),
        height: Math.round((Number(match[2]) * 96) / 914400),
      };
    }
  }
  throw new Error("Report template has no sized image anchor.");
}

type TemplateImageRange = {
  tl: unknown;
  br?: unknown;
  ext?: { width: number; height: number };
  editAs?: string;
};

/**
 * Swaps every two-cell image anchor for a one-cell anchor with an explicit
 * pixel size — the shape ClosedXML writes. Done on the template sheet before
 * its model is captured, so all cloned floor sheets inherit it.
 */
function applyTemplateImageExt(sheet: Worksheet, ext: { width: number; height: number }): void {
  const images = sheet.getImages() as unknown as Array<{ range: TemplateImageRange }>;
  for (const image of images) {
    if (image.range.ext == null) {
      image.range = { tl: image.range.tl, ext, editAs: image.range.editAs ?? "oneCell" };
    }
  }
}

/** Builds the workbook and triggers a browser download (the page toasts on success). */
export async function downloadReportWorkbook(
  report: InventoryReportDocument,
  fileName: string,
): Promise<void> {
  const templateBytes = await fetchTemplateBytes();
  const bytes = await buildReportWorkbook(report, templateBytes);
  const blob = new Blob([bytes], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Builds the full workbook from the report document + template bytes.
 * Exported for the golden test, which runs this in Node against the bytes the
 * original .NET service produced from the very same document.
 */
export async function buildReportWorkbook(
  report: InventoryReportDocument,
  templateBytes: ArrayBuffer | Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  // exceljs ships CommonJS: `require`/ESM `default` is the exports object
  // (`{ Workbook, ... }`), while the typings describe named exports — pick
  // whichever shape this bundler/runtime exposes.
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const workbook = new ExcelJS.Workbook();
  // exceljs's `Buffer` in `load()` is declared `interface Buffer extends
  // ArrayBuffer`, so normalize either input shape to one ArrayBuffer.
  const bytes =
    templateBytes instanceof Uint8Array
      ? (templateBytes.buffer.slice(
          templateBytes.byteOffset,
          templateBytes.byteOffset + templateBytes.byteLength,
        ) as ArrayBuffer)
      : templateBytes;
  await workbook.xlsx.load(bytes);

  const proto = workbook.worksheets[0];
  if (!proto) throw new Error("Report template has no worksheet.");
  applyTemplateImageExt(proto, await readTemplateImageExt(bytes));
  const protoModel = captureModel(proto);
  proto.name = TEMPLATE_SHEET_NAME;

  for (const floor of report.sheets) {
    const { sheet, merges } = cloneSheet(workbook, protoModel, floor.sheetName);
    fillSheet(sheet, report.branchName, floor, merges);
  }

  // ClosedXML `proto.Delete()` — only the floor sheets remain.
  if (workbook.worksheets.length <= 1) throw new Error("Report workbook has no sheets.");
  workbook.removeWorksheet(TEMPLATE_SHEET_NAME);

  // ClosedXML `Worksheet(1).SetTabActive()` — open on the first floor sheet.
  if (workbook.views.length > 0) {
    workbook.views = workbook.views.map((view) => ({ ...view, firstSheet: 0, activeTab: 0 }));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/* --------------------------------------------------------------- copying - */

/**
 * The exceljs stand-in for ClosedXML's `proto.CopyTo(name)`: the worksheet
 * model carries cells + styles, column widths, merges, views and page setup.
 * Each sheet gets its own structured clone so style objects stay independent.
 */
type SheetModel = {
  name?: string;
  merges?: string[];
  [key: string]: unknown;
};

function captureModel(sheet: Worksheet): SheetModel {
  return structuredClone((sheet as unknown as { model: SheetModel }).model);
}

function cloneSheet(
  workbook: Workbook,
  protoModel: SheetModel,
  name: string,
): { sheet: Worksheet; merges: string[] } {
  const model = structuredClone(protoModel);
  model.name = name;
  const sheet = workbook.addWorksheet(name);
  // The model setter reads merges from `model.mergeCells`, which the getter
  // never emits — capture them and apply after FillSheet instead, so merges
  // never ride along while rows are being spliced (exceljs doesn't move them).
  const merges = (model.merges ?? []).filter((range): range is string => typeof range === "string");
  (sheet as unknown as { model: SheetModel }).model = model;
  return { sheet, merges };
}

/* ------------------------------------------------------------ FillSheet -- */

function cellAt(sheet: Worksheet, row: number, column: number): Cell {
  return sheet.getRow(row).getCell(column);
}

/**
 * exceljs cells can SHARE one style instance (the reader reuses styles), so
 * assigning `cell.alignment = ...` would leak the change onto unrelated cells
 * — swap in a fresh style object instead.
 */
function patchAlignment(cell: Cell, alignment: Partial<Alignment>): void {
  const holder = cell as unknown as { style: Style };
  holder.style = { ...holder.style, alignment: { ...holder.style.alignment, ...alignment } };
}

/**
 * `row.values` is typed as an array/object union, but the getter always
 * returns a sparse array indexed by column — reading it never materialises
 * new cells.
 */
function rowValueAt(row: Row, column: number): CellValue | undefined {
  return (row.values as CellValue[])[column];
}

/** Port of `FindRowContaining` — first column-A cell whose text matches. */
function findRowContaining(sheet: Worksheet, text: string): number | null {
  const needle = text.toLowerCase();
  let found: number | null = null;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (found != null) return;
    const value = rowValueAt(row, 1);
    if (value == null) return;
    if (displayText(value).toLowerCase().includes(needle)) found = rowNumber;
  });
  return found;
}

/** Port of `XLCell.Clear(XLClearOptions.Contents)` — values only, styles stay. */
function clearRowContents(sheet: Worksheet, rowNumber: number): void {
  const row = sheet.getRow(rowNumber);
  for (let column = 1; column <= DATA_COLUMNS; column++) {
    row.getCell(column).value = undefined;
  }
}

/**
 * Port of ClosedXML's `sourceRow.CopyTo(destRow)` for the data rows: cell
 * styles + row height. (Cell contents are not copied — the template's style
 * source row is always empty, and FillSheet clears the destination anyway.)
 */
function copyRowStyle(sheet: Worksheet, sourceRow: number, destRow: number): void {
  const source = sheet.getRow(sourceRow);
  const dest = sheet.getRow(destRow);
  for (let column = 1; column <= DATA_COLUMNS; column++) {
    const holder = dest.getCell(column) as unknown as { style: Style };
    holder.style = { ...(source.getCell(column) as unknown as { style: Style }).style };
  }
  if (source.height != null) dest.height = source.height;
}

const MERGE_RANGE = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/;

function shiftMergesForInsert(merges: string[], at: number, count: number): string[] {
  return merges.map((range) => {
    const match = MERGE_RANGE.exec(range);
    if (!match) return range;
    const top = Number(match[2]);
    const bottom = Number(match[4]);
    if (top >= at) return `${match[1]}${top + count}:${match[3]}${bottom + count}`;
    if (bottom >= at) return `${match[1]}${top}:${match[3]}${bottom + count}`;
    return range;
  });
}

function shiftMergesForDelete(merges: string[], at: number, count: number): string[] {
  const lastDeleted = at + count - 1;
  const kept: string[] = [];
  for (const range of merges) {
    const match = MERGE_RANGE.exec(range);
    if (!match) {
      kept.push(range);
      continue;
    }
    const top = Number(match[2]);
    const bottom = Number(match[4]);
    if (bottom < at) kept.push(range);
    else if (top > lastDeleted) kept.push(`${match[1]}${top - count}:${match[3]}${bottom - count}`);
    else if (top >= at && bottom <= lastDeleted)
      continue; // merge rows deleted entirely
    else if (top >= at) kept.push(`${match[1]}${at}:${match[3]}${bottom - count}`);
    else kept.push(`${match[1]}${top}:${match[3]}${at - 1}`);
  }
  return kept;
}

/** The 13 column values, in template order (ITEM ID ... NOTES). */
function rowValues(row: ReportAssetRow): string[] {
  return [
    row.itemId,
    row.monitor,
    row.keyboardMouse,
    row.assetType,
    row.cubicle,
    row.assignedTo,
    row.department,
    row.location,
    row.status,
    row.condition,
    row.floor,
    row.installed,
    row.notes,
  ];
}

/**
 * Port of `InventoryReportService.FillSheet` — titles, fit the data block to
 * the real row count, wipe the sample rows, write the asset rows, rebuild the
 * totals block, then re-apply (shifted) merges and lay the sheet out.
 */
function fillSheet(
  sheet: Worksheet,
  branchName: string,
  floor: ReportFloorSheet,
  initialMerges: string[],
): void {
  let merges = [...initialMerges];

  cellAt(sheet, 1, 1).value = branchName;
  cellAt(sheet, 3, 1).value = floor.floorTitle;

  let totalOfRow = findRowContaining(sheet, "TOTAL OF:") ?? FIRST_DATA_ROW + TEMPLATE_DATA_ROWS;
  let preparedRow = findRowContaining(sheet, "PREPARED BY:") ?? totalOfRow + 9;

  const needed = floor.rows.length;
  const available = totalOfRow - FIRST_DATA_ROW;

  if (needed > available) {
    const insertAt = totalOfRow;
    const extra = needed - available;
    // ClosedXML `sheet.Row(insertAt).InsertRowsAbove(extra)` — exceljs moves
    // everything below (values, styles, heights); merges we shift ourselves.
    sheet.spliceRows(insertAt, 0, ...Array.from({ length: extra }, (): never[] => []));

    const styleSource = FIRST_DATA_ROW + available - 1;
    for (let i = 0; i < extra; i++) {
      const dest = styleSource + 1 + i;
      copyRowStyle(sheet, styleSource, dest);
      clearRowContents(sheet, dest);
    }

    totalOfRow += extra;
    preparedRow += extra;
    merges = shiftMergesForInsert(merges, insertAt, extra);
  }

  // Clear previous sample data (rows keep their styles).
  const clearEnd = Math.max(totalOfRow - 1, FIRST_DATA_ROW);
  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= clearEnd; rowNumber++) {
    clearRowContents(sheet, rowNumber);
  }

  floor.rows.forEach((assetRow, index) => {
    const values = rowValues(assetRow);
    for (let column = 1; column <= DATA_COLUMNS; column++) {
      cellAt(sheet, FIRST_DATA_ROW + index, column).value = values[column - 1];
    }
  });

  // Drop the unused blank template rows so the sheet hugs the real data
  // (`sheet.Rows(firstUnused, totalOfRow - 1).Delete()`).
  const firstUnused = needed === 0 ? FIRST_DATA_ROW : FIRST_DATA_ROW + needed;
  if (firstUnused < totalOfRow) {
    const deleteCount = totalOfRow - firstUnused;
    sheet.spliceRows(firstUnused, deleteCount);
    merges = shiftMergesForDelete(merges, firstUnused, deleteCount);
    totalOfRow = findRowContaining(sheet, "TOTAL OF:") ?? firstUnused;
    preparedRow = findRowContaining(sheet, "PREPARED BY:") ?? totalOfRow + 9;
  }

  // Leave blank rows between the table and the totals block — ClosedXML
  // `sheet.Row(totalOfRow).InsertRowsAbove(4)`; exceljs moves the rows below
  // (values, styles, heights) and we shift the merges ourselves.
  sheet.spliceRows(
    totalOfRow,
    0,
    ...Array.from({ length: BLANK_ROWS_BEFORE_TOTALS }, (): never[] => []),
  );
  merges = shiftMergesForInsert(merges, totalOfRow, BLANK_ROWS_BEFORE_TOTALS);
  totalOfRow += BLANK_ROWS_BEFORE_TOTALS;
  preparedRow += BLANK_ROWS_BEFORE_TOTALS;

  // Rebuild the totals block under TOTAL OF:.
  cellAt(sheet, totalOfRow, 1).value = "TOTAL OF:";
  const totalsStart = totalOfRow + 1;
  const sampleTotalsEnd = Math.max(preparedRow - 2, totalsStart);
  for (let rowNumber = totalsStart; rowNumber <= sampleTotalsEnd; rowNumber++) {
    cellAt(sheet, rowNumber, 1).value = undefined;
  }
  floor.totals.forEach((total, index) => {
    cellAt(sheet, totalsStart + index, 1).value = total;
  });

  // Re-apply (possibly shifted) merges — exceljs never moved them with rows.
  for (const range of merges) sheet.mergeCellsWithoutStyle(range);

  const lastDataRow = needed === 0 ? FIRST_DATA_ROW - 1 : FIRST_DATA_ROW + needed - 1;
  applyFlexibleLayout(sheet, lastDataRow, merges);
}

/* ------------------------------------------------------ layout & sizing -- */

/** Advance of one codepoint in font units, falling back to `.notdef`. */
function advanceOf(metrics: FontMetrics, codePoint: number): number {
  let index = 0;
  for (const [start, end] of FONT_ADVANCE_RANGES) {
    if (codePoint >= start && codePoint <= end) {
      return metrics.advances[index + codePoint - start] ?? metrics.notdef;
    }
    index += end - start + 1;
  }
  return metrics.notdef;
}

/** Metrics for a template font family (Calibri stands in for unknown ones). */
function fontMetrics(family: string): FontMetrics {
  const metrics: FontMetrics | undefined = FONT_METRICS[family] ?? FONT_METRICS["Calibri"];
  if (!metrics) throw new Error(`No glyph metrics registered for font "${family}".`);
  return metrics;
}

/** `DefaultGraphicEngine.GetMaxDigitWidth` — the widest digit, in pixels. */
function maxDigitWidthPx(metrics: FontMetrics, size: number): number {
  const scale = (size * 96) / 72 / metrics.upem;
  let widest = 0;
  for (const digit of "0123456789") {
    widest = Math.max(widest, advanceOf(metrics, digit.codePointAt(0) ?? 0) * scale);
  }
  return widest;
}

/**
 * Port of ClosedXML's per-cell measurement chain
 * (`XLCell.GetGlyphBoxes` → `DefaultGraphicEngine.GetGlyphBox` →
 * `XLColumn.CalculateMinColumnWidth`):
 *
 *   • every character's advance is ROUNDED to whole pixels before summing
 *   • the font style is ignored — `LoadFont` builds a Regular font from the
 *     family name alone, so bold headers measure with regular glyphs
 *   • textPx + 2×ceil(textPx × 0.03 + scaledMdw / 4) + 1
 */
function cellWidthPx(text: string, font: { name?: string; size?: number } | undefined): number {
  const family = font?.name ?? DEFAULT_CELL_FONT.name;
  const size = font?.size ?? DEFAULT_CELL_FONT.size;
  const metrics = fontMetrics(family);
  const scale = (size * 96) / 72 / metrics.upem;
  let textPx = 0;
  for (const char of text) {
    textPx += Math.round(advanceOf(metrics, char.codePointAt(0) ?? 0) * scale);
  }
  const scaledMdw = Math.round(maxDigitWidthPx(metrics, size));
  const padding = Math.ceil(textPx * 0.03 + scaledMdw / 4);
  return textPx + 2 * padding + 1;
}

/** Plain-text projection of a cell value (strings, numbers, rich text, ...). */
function displayText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const candidate = value as {
      richText?: { text?: string }[];
      text?: unknown;
      result?: unknown;
    };
    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map((part) => part.text ?? "").join("");
    }
    if (typeof candidate.text === "string") return candidate.text;
    if (candidate.result != null) return String(candidate.result);
  }
  return "";
}

/** Excel column letters → index ("A" → 1 … "M" → 13). */
function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index;
}

/** Every merged cell as a `row:column` key — ClosedXML skips them all. */
function collectMergedCells(merges: readonly string[]): Set<string> {
  const cells = new Set<string>();
  for (const range of merges) {
    const match = MERGE_RANGE.exec(range);
    if (!match) continue;
    const left = columnIndex(match[1] ?? "");
    const top = Number(match[2]);
    const right = columnIndex(match[3] ?? "");
    const bottom = Number(match[4]);
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) cells.add(`${row}:${column}`);
    }
  }
  return cells;
}

/**
 * Clamp MDW — `Round(GetMaxDigitWidth(Workbook.Style.Font))`: the workbook
 * default Calibri 11 has a 7.42px widest digit, i.e. 7px (a .NET banker's
 * round that's nowhere near a midpoint).
 */
const CLAMP_MDW = Math.round(
  maxDigitWidthPx(fontMetrics(DEFAULT_CELL_FONT.name), DEFAULT_CELL_FONT.size),
);

/** ClosedXML `DoubleExtensions.SaveRound()` — `Math.Round(value, 6)`. */
function saveRound(value: number): number {
  // .NET ties-break to even, but a saved width is
  // `(integer px − 5)/7 + 0.710625`, whose scaled fraction cycles
  // 0/.14/.29/.43/.57/.71/.86 — never a .5 tie — so Math.round agrees.
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Port of `AdjustToContents(1, endRow, min, double.MaxValue)`: measure the
 * widest non-merged cell in the column with real glyph metrics, apply the
 * per-column minimum in pixels (never a maximum — content always wins),
 * convert back to column-width units and save the way ClosedXML does
 * (`+ 0.710625`, rounded to 6 decimals).
 */
function autoSizeColumn(
  sheet: Worksheet,
  column: number,
  endRow: number,
  merged: ReadonlySet<string>,
): void {
  const min = COLUMN_MINIMUMS[column] ?? DEFAULT_MINIMUM;
  let widestPx = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > endRow) return;
    if (merged.has(`${rowNumber}:${column}`)) return; // `cell.IsMerged()` → skip
    const value = rowValueAt(row, column); // existing cells only — never materialises new ones
    if (value == null) return;
    const text = displayText(value);
    if (text === "") return;
    widestPx = Math.max(widestPx, cellWidthPx(text, row.getCell(column).font));
  });

  // Floor in pixels — `XLHelper.NoCToPixels(min, mdw)` for the bound (all
  // mins ≥ 1 NoC, so the sub-character branch never applies) — then convert
  // back with `PixelToNoC`. There is deliberately no ceiling: the column
  // always grows to fit its widest cell.
  const padding = 2 * Math.ceil(CLAMP_MDW / 4) + 1;
  const minPx = Math.ceil(min * CLAMP_MDW + padding);
  const px = Math.max(widestPx, minPx);
  const internal =
    px >= CLAMP_MDW + padding ? (px - padding) / CLAMP_MDW : px / (CLAMP_MDW + padding);
  sheet.getColumn(column).width = saveRound(internal + COLUMN_WIDTH_OFFSET);
}

/** Port of `InventoryReportService.ApplyFlexibleLayout`. */
function applyFlexibleLayout(
  sheet: Worksheet,
  lastDataRow: number,
  merges: readonly string[],
): void {
  // Landscape, 1 page wide, as many tall as needed — replaces the template's
  // fixed 78% print scale (the template already ships fit-to-page settings).
  sheet.pageSetup = {
    ...sheet.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  if (sheet.views.length > 0) {
    sheet.views = sheet.views.map((view) => ({ ...view, zoomScale: 100 }));
  }

  // Wrap the column-title row.
  for (let column = 1; column <= DATA_COLUMNS; column++) {
    patchAlignment(cellAt(sheet, HEADER_ROW, column), { wrapText: true });
  }

  // Wrap + vertically centre the data rows.
  if (lastDataRow >= FIRST_DATA_ROW) {
    for (let rowNumber = FIRST_DATA_ROW; rowNumber <= lastDataRow; rowNumber++) {
      for (let column = 1; column <= DATA_COLUMNS; column++) {
        patchAlignment(cellAt(sheet, rowNumber, column), { wrapText: true, vertical: "middle" });
      }
    }
  }

  const endRow = Math.max(lastDataRow, HEADER_ROW);
  const merged = collectMergedCells(merges);
  for (let column = 1; column <= DATA_COLUMNS; column++) {
    autoSizeColumn(sheet, column, Math.max(endRow, 1), merged);
  }
}
