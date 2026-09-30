/**
 * Golden test for the inventory Excel export.
 *
 * Rebuilds the workbook with the JS port
 * (`src/features/inventory/lib/report-export.ts`) from the SAME document the
 * original .NET service produced for `golden.xlsx`, then diffs the two
 * cell-by-cell — plus sheet names, merge ranges, image anchors, page setup
 * and every column width (exact, 6-decimal `SaveRound` values).
 *
 *   npm run test:inventory-report
 *
 * Regenerate the golden files from the live DB (needs the .NET 10 SDK):
 *   npm run test:inventory-report:golden
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";
import JSZip from "jszip";

import { buildReportWorkbook } from "../../src/features/inventory/lib/report-export.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const MAX_REPORTED = 40;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Plain-text projection of a cell value (strings, numbers, rich text, ...). */
function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Array.isArray(value.richText))
      return value.richText.map((part) => part.text ?? "").join("");
    if (typeof value.text === "string") return value.text;
    if (value.result != null) return String(value.result);
  }
  return "";
}

function cellAddress(row, col) {
  return `${String.fromCharCode(64 + col)}${row}`;
}

const fail = (message) => {
  console.error(`FAIL  ${message}`);
  process.exit(1);
};

/**
 * ClosedXML (via the OpenXml SDK writer) serializes spreadsheetml elements
 * with an `x:` namespace prefix (`<x:worksheet>`, `<x:sst>`, `<x:styleSheet>`),
 * while exceljs's xforms match literal tag names written for Excel's
 * unprefixed serialization — it cannot parse the golden file as-is. The
 * prefix carries no meaning (it is bound to the same namespace), so strip it
 * from XML parts before reading. Drawing parts already use the standard
 * `xdr:` prefix and relationship parts use the default namespace; both are
 * left untouched.
 *
 * `docProps/` is dropped: the SDK writes core properties in the default
 * namespace while exceljs expects Excel's `cp:`/`ap:` prefixes, and document
 * properties are not part of this comparison.
 */
async function loadGoldenWorkbook(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const normalized = new JSZip();
  for (const file of Object.values(zip.files)) {
    if (file.dir || file.name.startsWith("docProps/")) continue;
    if (/\.xml$|\.rels$/.test(file.name)) {
      const text = await file.async("string");
      normalized.file(
        file.name,
        text.replace(/^\uFEFF/, "").replace(/(<\/?)x:(?=[A-Za-z])/g, "$1"),
      );
    } else {
      normalized.file(file.name, await file.async("nodebuffer"));
    }
  }
  return normalized.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/* ------------------------------------------------------------- inputs --- */

const goldenDoc = JSON.parse(await readFile(path.join(here, "golden.json"), "utf8"));
const goldenBytes = await readFile(path.join(here, "golden.xlsx"));
const templatePath = path.join(repoRoot, "public", "inventory", "report_template.xlsx");
const templateBytes = await readFile(templatePath);

// The .NET side embeds `asset_inventory/.../wwwroot/assets/report_template.xlsx`;
// the browser fetches `public/inventory/report_template.xlsx`. Same bytes or
// the diff below would blame the template.
const embeddedTemplate = await readFile(
  path.join(
    repoRoot,
    "asset_inventory",
    "RGCDIPOLOG_INVENTORY.Shared",
    "wwwroot",
    "assets",
    "report_template.xlsx",
  ),
);
if (sha256(embeddedTemplate) !== sha256(templateBytes)) {
  fail(
    "template copies diverged — public/inventory/report_template.xlsx no longer matches the embedded original",
  );
}

/* --------------------------------------------------------------- build --- */

const jsBytes = await buildReportWorkbook(goldenDoc, new Uint8Array(templateBytes));

const goldenWb = new ExcelJS.Workbook();
await goldenWb.xlsx.load(await loadGoldenWorkbook(goldenBytes));
const jsWb = new ExcelJS.Workbook();
await jsWb.xlsx.load(jsBytes);

/* -------------------------------------------------------------- compare -- */

const problems = [];
const cellDiffs = [];

const goldenNames = goldenWb.worksheets.map((sheet) => sheet.name);
const jsNames = jsWb.worksheets.map((sheet) => sheet.name);
if (goldenNames.join(" | ") !== jsNames.join(" | ")) {
  problems.push(`sheet names: golden=[${goldenNames.join(", ")}] js=[${jsNames.join(", ")}]`);
}

let cellsCompared = 0;
const sheetCount = Math.min(goldenWb.worksheets.length, jsWb.worksheets.length);

for (let index = 0; index < sheetCount; index++) {
  const golden = goldenWb.worksheets[index];
  const js = jsWb.worksheets[index];

  const rows = Math.max(golden.rowCount, js.rowCount);
  const cols = Math.max(golden.columnCount, js.columnCount);
  for (let row = 1; row <= rows; row++) {
    const goldenRow = golden.getRow(row);
    const jsRow = js.getRow(row);
    for (let col = 1; col <= cols; col++) {
      cellsCompared++;
      const expected = textOf(goldenRow.getCell(col).value);
      const actual = textOf(jsRow.getCell(col).value);
      if (expected !== actual) {
        cellDiffs.push(
          `${golden.name}!${cellAddress(row, col)}: golden=${JSON.stringify(expected)} js=${JSON.stringify(actual)}`,
        );
      }
    }
  }

  const goldenMerges = [...(golden.model?.merges ?? [])].sort().join(",");
  const jsMerges = [...(js.model?.merges ?? [])].sort().join(",");
  if (goldenMerges !== jsMerges) {
    problems.push(`merges in "${golden.name}": golden=[${goldenMerges}] js=[${jsMerges}]`);
  }

  // Header graphic: same image count and anchors per sheet.
  const imageKey = (image) => {
    const { tl, br, ext, editAs } = image.model.range;
    return JSON.stringify({ tl, br, ext, editAs });
  };
  const goldenImages = golden.getImages().map(imageKey).sort();
  const jsImages = js.getImages().map(imageKey).sort();
  if (goldenImages.join("|") !== jsImages.join("|")) {
    problems.push(`images in "${golden.name}": golden=[${goldenImages}] js=[${jsImages}]`);
  }

  // Print layout written by ApplyFlexibleLayout.
  for (const key of ["orientation", "fitToPage", "fitToWidth", "fitToHeight"]) {
    const goldenValue = golden.pageSetup?.[key] ?? null;
    const jsValue = js.pageSetup?.[key] ?? null;
    if (goldenValue !== jsValue) {
      problems.push(`pageSetup.${key} in "${golden.name}": golden=${goldenValue} js=${jsValue}`);
    }
  }
}

/* ------------------------------------------------- column widths --------- */

// ClosedXML's AdjustToContents port must reproduce these exactly (6-decimal
// `SaveRound` values), so a difference is a failure, not a note.
const widthDiffs = [];
for (let index = 0; index < sheetCount; index++) {
  const golden = goldenWb.worksheets[index];
  const js = jsWb.worksheets[index];
  for (let col = 1; col <= 13; col++) {
    const goldenWidth = golden.getColumn(col).width ?? 0;
    const jsWidth = js.getColumn(col).width ?? 0;
    if (goldenWidth !== jsWidth) {
      widthDiffs.push(`${golden.name} col ${col}: golden=${goldenWidth} js=${jsWidth}`);
    }
  }
}

/* --------------------------------------------------------------- report --- */

console.log(
  `compared ${cellsCompared} cells across ${sheetCount} sheet(s): ` + `[${goldenNames.join(", ")}]`,
);

if (widthDiffs.length > 0) {
  console.error(`FAIL  ${widthDiffs.length} column width(s) differ:`);
  for (const note of widthDiffs.slice(0, 13)) console.error(`  ${note}`);
}

if (problems.length > 0 || cellDiffs.length > 0 || widthDiffs.length > 0) {
  for (const problem of problems) console.error(`FAIL  ${problem}`);
  if (cellDiffs.length > 0) {
    console.error(`FAIL  ${cellDiffs.length} cell mismatch(es):`);
    for (const diff of cellDiffs.slice(0, MAX_REPORTED)) console.error(`  ${diff}`);
    if (cellDiffs.length > MAX_REPORTED) {
      console.error(`  ... and ${cellDiffs.length - MAX_REPORTED} more`);
    }
  }
  process.exit(1);
}

console.log(
  "PASS  JS workbook matches the original .NET output — cells, merges, image anchors, page setup and column widths",
);
