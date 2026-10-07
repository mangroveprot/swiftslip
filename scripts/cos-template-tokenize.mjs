/* One-shot tokenizer for public/cos_template.docx.
 *
 * The company's CHANGE OF SCHEDULE FORM ships with no fill-in tokens at all —
 * every value box is simply empty. This script adds the ones the app needs:
 * the identity / plant / position values, the two Change of Work Schedule
 * boxes, the effectivity date and the two SCHEDULE lines, the inline signature
 * image, the reason body, and the three sign-off names.
 *
 * It validates the result by rendering it with docxtemplater (a sample fill AND
 * an empty fill) before touching the file. The original is copied to the temp
 * folder first; if any step fails, the file is left untouched.
 *
 * Idempotent: re-running on an already-tokenized file exits immediately.
 *
 *   node scripts/cos-template-tokenize.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";

const TEMPLATE = "public/cos_template.docx";

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

/** A plain bold-free Calibri run carrying one token. */
const run = (token) =>
  `<w:r><w:rPr>${CALIBRI}</w:rPr><w:t xml:space="preserve">${token}</w:t></w:r>`;

/** The blue "Approved via Viber" note — the same 4472C4 the OB sheet uses. */
const viberRun = (token) =>
  `<w:r><w:rPr><w:color w:val="4472C4"/>${CALIBRI}</w:rPr><w:t xml:space="preserve">${token}</w:t></w:r>`;

/* ------------------------------------------------------------- row surgery - */

/** Absolute [start,end) bounds of every `<w:tc>` in `rowXml`, offset by `base`. */
function cellBounds(rowXml, base) {
  const out = [];
  const re = /<w:tc>[\s\S]*?<\/w:tc>/g;
  let m;
  while ((m = re.exec(rowXml)) !== null)
    out.push({ start: base + m.index, end: base + m.index + m[0].length });
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
 * blank line the template leaves under each caption for its value (the reason
 * body, and the three sign-off names). Reusing that line keeps the sheet's
 * height and alignment exactly as the template has it; adding a paragraph of
 * our own would push everything below it down. Falls back to the cell's last
 * paragraph when there is no blank one.
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

const raw = fs.readFileSync(TEMPLATE);
const zip = new PizZip(raw);
let xml = readXml(zip);

if (xml.includes("{id_number}")) {
  console.log("Template is already tokenized — nothing to do.");
  process.exit(0);
}

const tblStart = xml.indexOf("<w:tbl>");
const tblEnd = xml.indexOf("</w:tbl>");
if (tblStart < 0 || tblEnd < 0) die("the form table was not found");
const tbl = xml.slice(tblStart, tblEnd + 8);

const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
const rows = [];
let rm;
while ((rm = rowRe.exec(tbl)) !== null) {
  rows.push({ start: tblStart + rm.index, end: tblStart + rm.index + rm[0].length, xml: rm[0] });
}
if (rows.length < 12) die(`expected 12 rows, found ${rows.length}`);

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
tokenInto(1, 2, "{date_filed}", "date_filed");

/* 2) Plant / Position — row 4. */
tokenInto(3, 0, "{plant_location}", "plant_location");
tokenInto(3, 1, "{position}", "position");

/* 3) The two Change of Work Schedule boxes — row 4, third cell.
 *    The template draws them as literal ☐ glyphs; swap each for a token so the
 *    export can fill the chosen one. */
{
  const cell = cellsOf(3)[2];
  if (!cell) die("change-of-work-schedule cell not found");
  const frag = xml.slice(cell.start, cell.end);
  if (!frag.includes("☐")) die("the ☐ boxes were not found in the change-of-work-schedule cell");
  const swapped = frag.replace("☐", "{chk_shift}").replace("☐", "{chk_rest_day}");
  xml = xml.slice(0, cell.start) + swapped + xml.slice(cell.end);
  console.log("✓ chk_shift / chk_rest_day");
}

/* 4) The schedule block — one row per effectivity date, so the row is wrapped
 *    in a docxtemplater table loop: the opening tag rides in the first cell and
 *    the closing tag in the third, which is what makes the whole <w:tr> repeat.
 *    The signature cell sits after the loop's span but still inside the row, so
 *    a repeated row shows the signature on every line (a repeated row can't
 *    merge its last cell). */
tokenInto(7, 0, "{#schedules}{effectivity_date}", "schedules loop + effectivity_date");
tokenInto(7, 1, "{schedule_from}", "schedule_from");
tokenInto(7, 2, "{schedule_to}{/schedules}", "schedule_to + loop close");
tokenInto(7, 3, "{%employee_signature}", "employee_signature (image)");

/* 5) The reason body — the blank centered line the template already leaves
 *    inside the REASON/S cell, under its own header. */
{
  const cell = cellsOf(9)[0];
  if (!cell) die("reason cell not found");
  xml = insertIntoBlankLine(xml, cell, run("{reasons}"));
  console.log("✓ reasons");
}

/* 6) The three sign-off names — row 12. Each goes on the blank line its own
 *    cell leaves between the caption ("Approved by:" …) and the footer line. */
{
  if (cellsOf(11).length < 3) die("sign-off row does not have three cells");
  // The approval note takes the line ABOVE the approver's name — that is where
  // the OB sheet prints it — so it goes in first and the name then falls to the
  // next blank line down.
  xml = insertIntoBlankLine(xml, cellsOf(11)[0], viberRun("{viber}"));
  console.log("✓ viber (approval note)");
  xml = insertIntoBlankLine(xml, cellsOf(11)[0], run("{approved_by}"));
  console.log("✓ approved_by");
  xml = insertIntoBlankLine(xml, cellsOf(11)[1], run("{received_by}"));
  console.log("✓ received_by");
  xml = insertIntoBlankLine(xml, cellsOf(11)[2], run("{processed_by}"));
  console.log("✓ processed_by");
}

/* 7) Strip the two things the sheet no longer shows: the "Printed Name and
 *    Signature" captions under the sign-off blocks, and the dashed cut line
 *    that trailed the form. Both are whole paragraphs, so they come out clean. */
{
  const textOf = (p) =>
    (p.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("");

  const strip = (predicate, label) => {
    const re = /<w:p\b[\s\S]*?<\/w:p>/g;
    let out = "";
    let last = 0;
    let removed = 0;
    let m;
    while ((m = re.exec(xml)) !== null) {
      if (!predicate(m[0])) continue;
      out += xml.slice(last, m.index);
      last = m.index + m[0].length;
      removed += 1;
    }
    out += xml.slice(last);
    xml = out;
    console.log(`✓ ${label} (${removed})`);
  };

  strip(
    (p) => textOf(p).trim() === "Printed Name and Signature",
    'removed "Printed Name and Signature"',
  );
  // The cut line is the only drawing with no text of its own (the header
  // paragraph carries the logo AND the title, so it never matches).
  strip((p) => /<w:drawing>/.test(p) && textOf(p).trim() === "", "removed the dashed cut line");
}

/* ----------------------------------------------------------------- validate - */

// A module can only be attached to one Docxtemplater instance, so every render
// gets its own (validation renders twice: a full fill and an empty fill).
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
  date_filed: "10/06/2026",
  plant_location: "RGC-DIPOLOG SAT OFFICE",
  position: "IT SUPPORT",
  chk_shift: "☒",
  chk_rest_day: "☐",
  schedules: [
    {
      effectivity_date: "10/10/2026",
      schedule_from: "10/07/2026 - 8am - 5pm",
      schedule_to: "10/10/2026 - 8am - 5pm",
    },
    {
      effectivity_date: "10/17/2026",
      schedule_from: "10/15/2026 - 8am - 5pm",
      schedule_to: "10/17/2026 - 8am - 5pm",
    },
  ],
  reasons: "October 7, 2026, is Special Non-working Holiday at Dipolog City",
  viber: "Approved via Viber",
  approved_by: "RON A. MALDIA",
  received_by: "",
  processed_by: "",
  employee_signature: TRANSPARENT_PX,
};

const EMPTY = Object.fromEntries(Object.keys(FULL).map((k) => [k, ""]));
// A loop needs a list, not the empty string the generic fill would give it.
EMPTY.schedules = [];

let full;
try {
  full = render(FULL);
} catch (e) {
  die(`render with a full fill failed: ${e.message}`);
}
const checks = [
  ["name", full.includes("GERALD VILLAVER")],
  ["plant", full.includes("RGC-DIPOLOG SAT OFFICE")],
  ["first schedule line", full.includes("10/07/2026 - 8am - 5pm")],
  ["second schedule line (loop repeated)", full.includes("10/15/2026 - 8am - 5pm")],
  ["reason", full.includes("Special Non-working Holiday")],
  ["approver", full.includes("RON A. MALDIA")],
  ["viber note", full.includes("Approved via Viber")],
  ["signature image", full.includes("<w:drawing>")],
  ["ticked box", full.includes("☒")],
  ["sign-off caption gone", !full.includes("Printed Name and Signature")],
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

const backup = path.join(os.tmpdir(), "cos_template.orig.docx");
fs.copyFileSync(TEMPLATE, backup);
zip.file("word/document.xml", xml);
fs.writeFileSync(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`Tokenized ${TEMPLATE}`);
console.log(`Original backed up to ${backup}`);
