/* One-shot tokenizer for public/ot_template.docx.
 *
 * The company's OVERTIME AUTHORIZATION FORM ships with no fill-in tokens at all.
 * This adds the ones the app needs: the identity / department / position values,
 * the inline signature image, the OT table's row loop (date, regular shift,
 * actual from/to, total and validation), the reason body, the blue approval note
 * and the three sign-off names.
 *
 * It validates by rendering with docxtemplater (a full fill AND an empty fill)
 * before touching the file, and copies the original to the temp folder first.
 * Idempotent: re-running on an already-tokenized file exits immediately.
 *
 *   node scripts/ot-template-tokenize.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";

const TEMPLATE = "public/ot_template.docx";

const die = (msg) => {
  console.error(`ABORT: ${msg}`);
  console.error("The template was NOT modified.");
  process.exit(1);
};

const readXml = (zip) => {
  const entry = zip.file("word/document.xml");
  if (!entry) die("word/document.xml not found in the template");
  return typeof entry.text === "string" ? entry.text : entry.asText();
};

const CALIBRI = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';

const run = (token) =>
  `<w:r><w:rPr>${CALIBRI}</w:rPr><w:t xml:space="preserve">${token}</w:t></w:r>`;

/** The blue "Approved via Viber" note — the same 4472C4 the other sheets use. */
const viberRun = (token) =>
  `<w:r><w:rPr><w:color w:val="4472C4"/>${CALIBRI}</w:rPr><w:t xml:space="preserve">${token}</w:t></w:r>`;

const raw = fs.readFileSync(TEMPLATE);
const zip = new PizZip(raw);
let xml = readXml(zip);

if (xml.includes("{id_number}")) {
  console.log("Template is already tokenized — nothing to do.");
  process.exit(0);
}

/* ------------------------------------------------------------- row surgery - */

/** Absolute [start,end) bounds of every `<w:tc>` in `rowXml`, offset by `base`. */
function cellBounds(rowXml, base) {
  const out = [];
  const re = /<w:tc>[\s\S]*?<\/w:tc>/g;
  let m;
  while ((m = re.exec(rowXml)) !== null) {
    out.push({ start: base + m.index, end: base + m.index + m[0].length });
  }
  return out;
}

/** Insert `markup` immediately before the first `</w:p>` inside the cell. */
function insertIntoCell(xml, cell, markup) {
  const close = xml.indexOf("</w:p>", cell.start);
  if (close < 0 || close > cell.end) die("target cell has no paragraph");
  return xml.slice(0, close) + markup + xml.slice(close);
}

/**
 * Insert `markup` into the cell's first paragraph that carries no text — the
 * blank line the template leaves under each caption for its value. Reusing that
 * line keeps the sheet's height and alignment exactly as the template has it.
 * Falls back to the cell's last paragraph when there is no blank one.
 */
function insertIntoBlankLine(xml, cell, markup) {
  const frag = xml.slice(cell.start, cell.end);
  const paras = [...frag.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  if (!paras.length) die("target cell has no paragraph");
  const chosen =
    paras.find((p) => !/<w:t(?:\s[^>]*)?>[^<]*\S/.test(p[0])) ?? paras[paras.length - 1];
  const close = frag.indexOf("</w:p>", chosen.index);
  if (close < 0) die("no paragraph close in the target cell");
  return xml.slice(0, cell.start + close) + markup + xml.slice(cell.start + close);
}

/* ------------------------------------------------------------------- start - */

const tblStart = xml.indexOf("<w:tbl>");
const tblEnd = xml.indexOf("</w:tbl>");
if (tblStart < 0 || tblEnd < 0) die("the form table was not found");

/**
 * Re-derive the table's rows from the LIVE xml. Every insert shifts the offsets
 * of everything after it, so the bounds captured up front go stale immediately —
 * each lookup has to re-parse rather than reuse a cached position.
 */
function currentRows() {
  const tStart = xml.indexOf("<w:tbl>");
  const tEnd = xml.indexOf("</w:tbl>");
  const t = xml.slice(tStart, tEnd + 8);
  const out = [];
  const re = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    out.push({ start: tStart + m.index, end: tStart + m.index + m[0].length });
  }
  return out;
}

/** The `<w:tc>` bounds of one row, read fresh from the live document. */
function cellsOf(rowIndex) {
  const r = currentRows()[rowIndex];
  if (!r) die(`row ${rowIndex + 1} not found`);
  return cellBounds(xml.slice(r.start, r.end), r.start);
}

/** Insert one token into one cell of one row. */
function tokenInto(rowIndex, cellIndex, token, what) {
  const cell = cellsOf(rowIndex)[cellIndex];
  if (!cell) die(`${what}: row ${rowIndex + 1} has no cell ${cellIndex + 1}`);
  xml = insertIntoCell(xml, cell, run(token));
  console.log(`✓ ${what}`);
}

/* 1) Identity values — row 2 (empty cells under the row-1 labels). */
tokenInto(1, 0, "{id_number}", "id_number");
tokenInto(1, 1, "{employee_name}", "employee_name");
tokenInto(1, 2, "{%employee_signature}", "employee_signature (image)");

/* 2) Department / Position / Date & Time Filed — row 4. */
tokenInto(3, 0, "{department}", "department");
tokenInto(3, 1, "{position}", "position");
tokenInto(3, 2, "{date_filed}", "date_filed");

/* 3) The OT table's value row — one row per date. The row is wrapped in a
 *    docxtemplater table loop: the opening tag rides in the first cell and the
 *    closing tag in the last, which is what makes the whole <w:tr> repeat.
 *    Six cells: DATE OF OT WORK, REGULAR SHIFT SCHEDULE (one column), ACTUAL
 *    FROM, ACTUAL TO, TOTAL OT HOURS, OT VALIDATION. */
tokenInto(7, 0, "{#entries}{date_of_ot}", "entries loop + date_of_ot");
tokenInto(7, 1, "{regular_hours}", "regular_hours");
tokenInto(7, 2, "{actual_from}", "actual_from");
tokenInto(7, 3, "{actual_to}", "actual_to");
tokenInto(7, 4, "{total_hours}", "total_hours");
tokenInto(7, 5, "{validation}{/entries}", "validation + loop close");

/* 4) The reason body — the blank line inside the "REASON FOR OVERTIME:" cell, so
 *    it prints in the same box as its heading (row 11 is a separate spacer row,
 *    and text parked there falls outside the box). */
{
  const cell = cellsOf(9)[0];
  if (!cell) die("reason cell not found");
  xml = insertIntoBlankLine(xml, cell, run("{reasons}"));
  console.log("✓ reasons");
}

/* 5) The sign-off names. The approval note takes the line above the approver's
 *    name, so it goes in first and the name falls to the next blank line. */
{
  if (cellsOf(11).length < 3) die("sign-off row does not have three cells");
  xml = insertIntoBlankLine(xml, cellsOf(11)[0], viberRun("{viber}"));
  console.log("✓ viber (approval note)");
  xml = insertIntoBlankLine(xml, cellsOf(11)[0], run("{approved_by}"));
  console.log("✓ approved_by");
  xml = insertIntoBlankLine(xml, cellsOf(11)[1], run("{received_by}"));
  console.log("✓ received_by");
  xml = insertIntoBlankLine(xml, cellsOf(11)[2], run("{processed_by}"));
  console.log("✓ processed_by");
}

/* ----------------------------------------------------------------- validate - */

const TRANSPARENT_PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";

function makeImageModule() {
  return new ImageModule({
    centered: false,
    getImage: (tag) => {
      const b64 = tag || TRANSPARENT_PX;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    },
    getSize: () => [150, 45],
  });
}

function render(data) {
  zip.file("word/document.xml", xml);
  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  const doc = new Docxtemplater(new PizZip(out), {
    modules: [makeImageModule()],
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  return readXml(doc.getZip());
}

const FULL = {
  id_number: "2026-515",
  employee_name: "GERALD VILLAVER",
  department: "RGC-DIPOLOG SAT OFFICE",
  position: "IT SUPPORT",
  date_filed: "10/06/2026 3:30 PM",
  entries: [
    {
      date_of_ot: "10/07/2026",
      regular_hours: "08am - 05pm",
      actual_from: "05pm",
      actual_to: "08pm",
      total_hours: "3",
      validation: "",
    },
    {
      date_of_ot: "10/08/2026",
      regular_hours: "08am - 05pm",
      actual_from: "06pm",
      actual_to: "09pm",
      total_hours: "3",
      validation: "",
    },
  ],
  reasons: "To finish the month-end reports.",
  viber: "Approved via Viber",
  approved_by: "RON A. MALDIA",
  received_by: "",
  processed_by: "",
  employee_signature: TRANSPARENT_PX,
};

const EMPTY = Object.fromEntries(Object.keys(FULL).map((k) => [k, ""]));
// A loop needs a list, not the empty string the generic fill would give it.
EMPTY.entries = [];

let full;
try {
  full = render(FULL);
} catch (e) {
  die(`render with a full fill failed: ${e.message}`);
}

const checks = [
  ["name", full.includes("GERALD VILLAVER")],
  ["department", full.includes("RGC-DIPOLOG SAT OFFICE")],
  ["first OT line", full.includes("08am - 05pm")],
  ["second OT line (loop repeated)", full.includes("09pm")],
  ["reason", full.includes("month-end reports")],
  ["viber note", full.includes("Approved via Viber")],
  ["approver", full.includes("RON A. MALDIA")],
  ["signature image", full.includes("<w:drawing>")],
  ["no unrendered tokens left", !/\{[A-Za-z_#/%]/.test(full)],
];
for (const [what, ok] of checks) if (!ok) die(`render check failed: ${what}`);

try {
  render(EMPTY);
} catch (e) {
  die(`render with empty values failed: ${e.message}`);
}
console.log("✓ validation passed (full fill + empty fill)");

/* ------------------------------------------------------------------- commit - */

const backup = path.join(os.tmpdir(), "ot_template.orig.docx");
fs.copyFileSync(TEMPLATE, backup);
zip.file("word/document.xml", xml);
fs.writeFileSync(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`Tokenized ${TEMPLATE}`);
console.log(`Original backed up to ${backup}`);
