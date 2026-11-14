/**
 * Showrooms Excel export, client-side like `report-export.ts`.
 *
 * One sheet of the rows currently on screen (the active tab + search have
 * already been applied by the page). exceljs is imported dynamically so it
 * stays out of the main bundle until the owner clicks Download Excel.
 *
 * Labels come from `@swiftslip/shared/showrooms`, so the sheet says exactly
 * what the board says ("Needs request", "Not recorded", …).
 */
import type { Showroom, ShowroomCctvSummary } from "@swiftslip/shared/showrooms";
import {
  cctvConnectionLabel,
  cctvInstalledLabel,
  internetLabel,
} from "@swiftslip/shared/showrooms";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Inventory navy, the header/title fill used on screen and in the reports. */
const NAVY = "FF0F1B4D";
const WHITE = "FFFFFFFF";
const MUTED = "FF6B7280";
const LINE = "FFE6E7DF";
const SOFT = "FFEDEFF6";

const COLUMN_WIDTHS = [28, 16, 30, 18, 44];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `REGASCO_showrooms_<yyyyMMdd>_<HHmmss>.xlsx`, local time, zero-padded. */
export function buildShowroomFileName(now: Date = new Date()): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `REGASCO_showrooms_${date}_${time}.xlsx`;
}

/** Header row + one row per showroom, in the sheet's column order. */
export function showroomSheetRows(rows: Showroom[]): string[][] {
  const header = ["Showroom", "CCTV installed", "CCTV connection", "Internet", "Notes"];
  const body = rows.map((row) => {
    const note = row.cctv_note?.trim() ?? "";
    const connection = cctvConnectionLabel(row.cctv_connection);
    return [
      row.showroom_name,
      cctvInstalledLabel(row.cctv_installed),
      note === "" ? connection : `${connection} (${note})`,
      internetLabel(row.internet),
      row.notes ?? "",
    ];
  });
  return [header, ...body];
}

/**
 * The numbers from the navy header, written above the table: owned units,
 * installed showrooms and the spare stock that makes up the difference. The
 * arithmetic comes from `showroomCctvSummary`, never recomputed here.
 */
export function showroomSummaryRows(
  summary: ShowroomCctvSummary,
): Array<Array<string | number>> {
  return [
    ["Total units", "CCTV installed", "Units available"],
    [summary.totalUnits, summary.installed, summary.available],
  ];
}

/** "14 Nov 2026, 2:06 PM" — the stamp under the title. */
function formatStamp(now: Date): string {
  const hours24 = now.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const meridiem = hours24 < 12 ? "AM" : "PM";
  return (
    `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}, ` +
    `${hours12}:${pad(now.getMinutes())} ${meridiem}`
  );
}

/** Builds the workbook and triggers a browser download (the page toasts on success). */
export async function downloadShowroomsWorkbook(
  rows: Showroom[],
  summary: ShowroomCctvSummary,
  fileName: string,
  now: Date = new Date(),
): Promise<void> {
  // exceljs ships CommonJS: `require`/ESM `default` is the exports object
  // (`{ Workbook, ... }`), while the typings describe named exports.
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Showrooms", {
    views: [{ state: "frozen", ySplit: 6 }],
  });

  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  // Row 1-3: title + branch + stamp.
  sheet.mergeCells("A1:E1");
  const title = sheet.getCell("A1");
  title.value = "RGC Showroom CCTV & Internet Status";
  title.font = { bold: true, size: 14, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 26;

  sheet.mergeCells("A2:E2");
  const branch = sheet.getCell("A2");
  branch.value = "All branches";
  branch.font = { size: 10, color: { argb: MUTED } };

  sheet.mergeCells("A3:E3");
  const stamp = sheet.getCell("A3");
  stamp.value = formatStamp(now);
  stamp.font = { size: 10, color: { argb: MUTED } };

  // Rows 4-5: the header numbers (total units / installed / available), so a
  // printed sheet carries the same stock picture as the screen.
  const [summaryLabels, summaryValues] = showroomSummaryRows(summary);
  const summaryLabelRow = sheet.getRow(4);
  summaryLabelRow.values = summaryLabels;
  summaryLabelRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: MUTED } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  const summaryValueRow = sheet.getRow(5);
  summaryValueRow.values = summaryValues;
  summaryValueRow.height = 20;
  summaryValueRow.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  // Row 6: header.
  const headerRow = sheet.getRow(6);
  headerRow.values = ["Showroom", "CCTV installed", "CCTV connection", "Internet", "Notes"];
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  // Rows 7+: the rows on screen.
  for (const values of showroomSheetRows(rows).slice(1)) {
    const row = sheet.addRow(values);
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
    });
  }

  sheet.autoFilter = { from: "A6", to: "E6" };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
