/* One-shot tokenizer for public/dtr_template.docx.
 *
 * The company's DAILY TIME RECORD ships as a blank Word form. This adds the
 * tokens the app needs:
 *   - Identity values (TABLE#1): {emp_no} {name} {designation} {area}
 *   - Period (TABLE#2): {month} {year}
 *   - Daily entries loop (TABLE#3, single repeating row):
 *     {#entries}{date} {time_in} {time_out} {schedule} {remarks}{/entries}
 *   - Employee signature image + printed name (the empty paragraph right after
 *     the table, i.e. the space above the signature rule):
 *     {%employee_signature}<w:br/>{name}
 *   - Certifier name (the last empty paragraph before the certifier caption):
 *     {certified_by}
 *
 * It also centres the employee signature/name and the certifier name over their
 * respective rules (both rules are right-indented 1940 twips, so the paragraphs
 * get the same right indent + jc=center to match).
 *
 * On top of that it trims vertical slack so the filled form stays on ONE A4
 * page: data rows 20pt → 16pt, cell padding 4pt → 2pt, the 20pt gap under the
 * signature block → 2pt, one redundant blank line before "Certified by:" gone.
 *
 * It validates by rendering with docxtemplater (a full fill AND an empty fill)
 * before touching the file, and copies the original to the temp folder first.
 * Idempotent: re-running on an already-tokenized file exits immediately.
 *
 *   node scripts/dtr-template-tokenize.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";

const TEMPLATE = "public/dtr_template.docx";

const die = (msg) => {
  console.error(`ABORT: ${msg}`);
  console.error("The template was NOT modified.");
  process.exit(1);
};

const raw = fs.readFileSync(TEMPLATE);
const zip = new PizZip(raw);
let xml = zip.file("word/document.xml").asText();

if (xml.includes("{emp_no}")) {
  console.log("Template is already tokenized — nothing to do.");
  process.exit(0);
}

/* ---------- helpers ---------- */

/** Cell bounds of a row, offset by `base`. */
function cellBounds(rowXml, base) {
  const out = [];
  const re = /<w:tc>[\s\S]*?<\/w:tc>/g;
  let m;
  while ((m = re.exec(rowXml)) !== null) {
    out.push({ start: base + m.index, end: base + m.index + m[0].length });
  }
  return out;
}

/** Re-derive the i-th <w:tbl>...</w:tbl> bounds from the live xml. */
function tableBounds(tIdx) {
  const starts = [...xml.matchAll(/<w:tbl>/g)].map((m) => m.index);
  const ends = [...xml.matchAll(/<\/w:tbl>/g)].map((m) => m.index + 8);
  if (tIdx < 0 || tIdx >= starts.length) {
    die(`table #${tIdx} not found (have ${starts.length})`);
  }
  return { start: starts[tIdx], end: ends[tIdx] };
}

/** Row bounds of one table, read fresh from the live document. */
function tableRows(tIdx) {
  const { start, end } = tableBounds(tIdx);
  const t = xml.slice(start, end);
  const out = [];
  const re = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    out.push({ start: start + m.index, end: start + m.index + m[0].length });
  }
  return out;
}

/** Cell bounds of one row of one table. */
function rowCells(tIdx, rowIdx) {
  const rows = tableRows(tIdx);
  const r = rows[rowIdx];
  if (!r) die(`table #${tIdx} row ${rowIdx + 1} not found (have ${rows.length})`);
  return cellBounds(xml.slice(r.start, r.end), r.start);
}

const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Replace the cell's empty self-closing <w:p .../> with one run holding `token`.
 * The cell in this template always carries a single empty self-closing
 * paragraph that we fill in place — that keeps the row's height and the cell's
 * existing borders exactly as the company drew them.
 */
function putTokenInCell(tIdx, rowIdx, colIdx, token, label) {
  const cell = rowCells(tIdx, rowIdx)[colIdx];
  if (!cell) {
    die(`${label}: table #${tIdx} row ${rowIdx + 1} has no cell ${colIdx + 1}`);
  }
  const frag = xml.slice(cell.start, cell.end);
  const m = frag.match(/<w:p\b[^>]*?\/>/);
  if (!m) {
    die(`${label}: cell has no empty <w:p/> to fill (cell might already have content)`);
  }
  const openTag = m[0].slice(0, -2); // drop trailing "/>"
  const replacement = `${openTag}><w:r><w:t xml:space="preserve">${escText(
    token,
  )}</w:t></w:r></w:p>`;
  xml =
    xml.slice(0, cell.start + m.index) +
    replacement +
    xml.slice(cell.start + m.index + m[0].length);
  console.log(`✓ ${label}`);
}

/* ---------- 1) Trim TABLE#3 to header + one loop row ---------- */
{
  const rows = tableRows(3);
  const total = rows.length;
  if (total !== 16) {
    die(
      `TABLE#3 expected 16 rows (1 header + 15 data), found ${total} — aborting so the loop row token injection stays correct`,
    );
  }
  // Delete from the end so the offsets we haven't read yet don't shift.
  for (let i = total - 1; i >= 2; i--) {
    const r = rows[i];
    xml = xml.slice(0, r.start) + xml.slice(r.end);
  }
  console.log(`✓ TABLE#3 trimmed to 2 rows (header + loop row)`);
}

/* ---------- 1b) Compact the day rows ----------
 * The company form gives every data row a 20pt minimum height (trHeight 400)
 * plus 4pt of cell padding top and bottom. Halving the padding and dropping the
 * minimum to 16pt still reads comfortably at the form's 11pt typeface, and over
 * 16 rows it frees roughly 50pt — which is what keeps the certifier's caption
 * from spilling onto a second page. */
{
  const { start, end } = tableBounds(3);
  let t = xml.slice(start, end);
  t = t.replace(/<w:trHeight w:val="400"\/>/g, '<w:trHeight w:val="320"/>');
  t = t.replace(/<w:tcMar>[\s\S]*?<\/w:tcMar>/g, (m) =>
    m
      .replace(/<w:top w:w="\d+" w:type="dxa"\/>/, '<w:top w:w="20" w:type="dxa"/>')
      .replace(/<w:bottom w:w="\d+" w:type="dxa"\/>/, '<w:bottom w:w="20" w:type="dxa"/>'),
  );
  xml = xml.slice(0, start) + t + xml.slice(end);
  console.log("✓ TABLE#3 row height 400 → 320, cell padding 40 → 20");
}

/* ---------- 2) Identity values (TABLE#1) ---------- */
putTokenInCell(1, 0, 1, "{emp_no}", "emp_no (EMP NO. value)");
putTokenInCell(1, 1, 1, "{name}", "name (NAME value)");
putTokenInCell(1, 2, 1, "{designation}", "designation (DESIGNATION value)");
putTokenInCell(1, 3, 1, "{area}", "area (AREA value)");

/* ---------- 3) Period values (TABLE#2) ---------- */
putTokenInCell(2, 0, 1, "{month}", "month (MONTH range value)");
putTokenInCell(2, 0, 4, "{year}", "YEAR value");

/* ---------- 4) Daily-entries loop row (TABLE#3 r1) ---------- */
putTokenInCell(3, 1, 0, "{#entries}{date}", "entries loop + date (DATE cell)");
putTokenInCell(3, 1, 1, "{time_in}", "time_in (IN cell)");
putTokenInCell(3, 1, 2, "{time_out}", "time_out (OUT cell)");
putTokenInCell(3, 1, 3, "{schedule}", "schedule (Working Schedule cell)");
putTokenInCell(3, 1, 4, "{remarks}{/entries}", "remarks + loop close (REMARKS cell)");

/* ---------- 5) Signature + printed name (centred over the rule) ----------
 * The blank paragraph right after the table is the space ABOVE the signature
 * rule, so it carries both the signature image and the printed name: the image
 * on the first line, a soft return, then the name sitting directly over the
 * rule — the same arrangement as the on-screen preview, where the name is set
 * just above the line underneath the signature strokes. */
{
  const lastTblEnd = xml.lastIndexOf("</w:tbl>") + 8;
  const rest = xml.slice(lastTblEnd);
  const m = rest.match(/<w:p\b[\s\S]*?<\/w:p>/);
  if (!m) die("signature paragraph not found after the last table");
  const absStart = lastTblEnd + m.index;
  const absEnd = absStart + m[0].length;
  let pXml = m[0];
  // Close the 20pt gap under this paragraph — the name has to hug the rule.
  pXml = pXml.replace(/<w:spacing w:after="400"\/>/, '<w:spacing w:after="40"/>');
  // Augment or insert <w:pPr> with jc=center + the same right indent as the rule.
  const pPrMatch = pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  if (pPrMatch) {
    const inner = pPrMatch[0].slice("<w:pPr>".length, -"</w:pPr>".length);
    const newInner = `${inner}<w:ind w:right="1940"/><w:jc w:val="center"/>`;
    pXml = pXml.replace(pPrMatch[0], `<w:pPr>${newInner}</w:pPr>`);
  } else {
    pXml = pXml.replace(
      /<w:p\b[^>]*>/,
      `$&<w:pPr><w:ind w:right="1940"/><w:jc w:val="center"/></w:pPr>`,
    );
  }
  // Image and printed name in the same run sequence — the export post-process
  // converts the inline image to a floating/anchored drawing so the signature
  // strokes overlay the printed name (same visual as the on-screen preview).
  pXml = pXml.replace(
    /<\/w:p>$/,
    `<w:r><w:t>{%employee_signature}</w:t></w:r><w:r><w:t>{name}</w:t></w:r></w:p>`,
  );
  xml = xml.slice(0, absStart) + pXml + xml.slice(absEnd);
  console.log("✓ employee signature + printed name (centred over the rule)");
}

/* ---------- 5c) Remove the empty paragraph between "Certified by:" and
 * certified_by — it adds a full blank line that pushes the certifier
 * block onto a second page.          */
{
  const certByIdx = xml.indexOf("Certified by:");
  if (certByIdx < 0) die("Certified by: not found");
  const pClose = xml.indexOf("</w:p>", certByIdx);
  if (pClose < 0) die("Certified by: </w:p> not found");
  const after = pClose + 6;
  const m = xml.slice(after).match(/^<w:p\b[^>]*?\/>/);
  if (!m) die("empty P_e paragraph not found immediately after Certified by:");
  xml = xml.slice(0, after) + xml.slice(after + m[0].length);
  console.log("✓ removed empty paragraph between Certified by: and certified_by");
}

/* ---------- 5d) Tighten the spacer between the employee caption and
 * "Certified by:" (the paragraph with spacing after="300").          */
{
  const lastTblEnd = xml.lastIndexOf("</w:tbl>") + 8;
  const after = xml.slice(lastTblEnd);
  if (after.includes('<w:spacing w:after="300"/>')) {
    const newAfter = after.replace('<w:spacing w:after="300"/>', '<w:spacing w:after="0"/>');
    xml = xml.slice(0, lastTblEnd) + newAfter;
    console.log("✓ spacer after: 300 → 0");
  }
}

/* ---------- 6) Certifier name paragraph (centred over its line) ---------- */
{
  const lineText = "Signature Over Printed Name / Position";
  const lineIdx = xml.indexOf(lineText);
  if (lineIdx < 0) die("certifier line caption not found");
  // Walk back to the <w:p> that wraps the caption.
  const captionPStart = xml.lastIndexOf("<w:p", lineIdx);
  if (captionPStart < 0) die("certifier caption <w:p> not found");
  // The name goes in the LAST self-closing <w:p .../> before the caption.
  const before = xml.slice(0, captionPStart);
  const matches = [...before.matchAll(/<w:p\b[^>]*?\/>/g)];
  const target = matches[matches.length - 1];
  if (!target) die("certifier name paragraph (empty <w:p/>) not found");
  const absStart = target.index;
  const absEnd = absStart + target[0].length;
  const openTag = target[0].slice(0, -2); // drop "/>"
  const replacement = `${openTag}><w:pPr><w:ind w:right="1940"/><w:jc w:val="center"/></w:pPr><w:r><w:t>{certified_by}</w:t></w:r></w:p>`;
  xml = xml.slice(0, absStart) + replacement + xml.slice(absEnd);
  console.log("✓ certified_by (centred over its line)");
}

/* ---------- validate ---------- */

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
  return doc.getZip().file("word/document.xml").asText();
}

const FULL = {
  emp_no: "5056",
  name: "GERALD VILLAVER",
  designation: "IT SUPPORT",
  area: "RGC-DIPOLOG SAT OFFICE",
  // Matches what the app sends: formatPeriodDateRange → "06/01/26 - 06/15/26".
  month: "06/01/26 - 06/15/26",
  year: "2026",
  entries: [
    {
      date: "06/01/26",
      time_in: "8:00 AM",
      time_out: "5:00 PM",
      schedule: "8:00 AM - 5:00 PM",
      remarks: "",
    },
    {
      date: "06/02/26",
      time_in: "8:05 AM",
      time_out: "5:00 PM",
      schedule: "8:00 AM - 5:00 PM",
      remarks: "",
    },
    { date: "06/03/26", time_in: "", time_out: "", schedule: "", remarks: "REST DAY" },
  ],
  employee_signature: TRANSPARENT_PX,
  certified_by: "RON A. MALDIA",
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
  ["emp_no", full.includes("5056")],
  ["name", full.includes("GERALD VILLAVER")],
  ["designation", full.includes("IT SUPPORT")],
  ["area", full.includes("RGC-DIPOLOG SAT OFFICE")],
  ["month", full.includes("06/01/26 - 06/15/26")],
  ["first entry date", /06\/01\/26/.test(full)],
  ["first entry IN", full.includes("8:00 AM")],
  ["third entry remarks (loop repeated)", full.includes("REST DAY")],
  ["signature image", full.includes("<w:drawing>")],
  ["certified_by", full.includes("RON A. MALDIA")],
  ["signature paragraph centered", /<w:jc w:val="center"\/>/.test(full)],
  ["no unrendered tokens left", !/\{[#\/\?\%]?[A-Za-z_]/.test(full)],
];
for (const [what, ok] of checks) if (!ok) die(`render check failed: ${what}`);

try {
  render(EMPTY);
} catch (e) {
  die(`render with empty values failed: ${e.message}`);
}
console.log("✓ validation passed (full fill + empty fill)");

/* ---------- commit ---------- */

const backup = path.join(os.tmpdir(), "dtr_template.orig.docx");
fs.copyFileSync(TEMPLATE, backup);
zip.file("word/document.xml", xml);
fs.writeFileSync(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`Tokenized ${TEMPLATE}`);
console.log(`Original backed up to ${backup}`);
