/* One-shot tokenizer for public/loa_form_template.docx.
 *
 * The company's real LOA form ships with 11 fillable tokens. This script adds
 * the ones the app needs but the template doesn't have yet — the inline
 * signature image, a ✓ token inside each of the 7 leave-type boxes, the
 * "Others:" line, the two pay boxes, and the blue "Approved via Viber" note —
 * and validates the result by rendering it with docxtemplater (a sample fill
 * AND an empty fill) before touching the file. The original is copied to the
 * temp folder first; if any step fails, the file is left untouched.
 *
 * Idempotent: re-running on an already-tokenized file exits immediately.
 *
 *   node scripts/loa-template-tokenize.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";

const TEMPLATE = "public/loa_form_template.docx";

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

/** Last `<w:tc…>` opening at or before `pos` (cells may carry attributes). */
const lastTc = (s, pos) => Math.max(s.lastIndexOf("<w:tc>", pos), s.lastIndexOf("<w:tc ", pos));

/** First `<w:tc…>` opening at or after `pos`, or -1. */
const nextTc = (s, pos) => {
  const a = s.indexOf("<w:tc>", pos);
  const b = s.indexOf("<w:tc ", pos);
  const hits = [a, b].filter((n) => n >= 0);
  return hits.length ? Math.min(...hits) : -1;
};

const textOf = (frag) => [...frag.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]);

const RUN_CAL_11 = `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/></w:rPr><w:t>{%s}</w:t></w:r>`;

// Copied verbatim from public/ob_form_template.docx (rsid/paraId hints stripped
// so nothing collides with this file's own ids) — same blue note as the OB form.
const VIBER_PARA =
  `<w:p><w:pPr><w:pStyle w:val="NoSpacing"/><w:jc w:val="center"/>` +
  `<w:rPr><w:rFonts w:cstheme="minorHAnsi"/><w:bCs/><w:color w:val="4472C4" w:themeColor="accent1"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>` +
  `<w:r><w:rPr><w:rFonts w:cstheme="minorHAnsi"/><w:bCs/><w:color w:val="4472C4" w:themeColor="accent1"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>{viber}</w:t></w:r></w:p>`;

const TRANSPARENT_PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Insert `run` before the first `</w:p>` of the cell right before/at `pos`. */
function insertRunIntoCell(xml, cellStart, cellEnd, run, what) {
  const frag = xml.slice(cellStart, cellEnd);
  if (!frag.includes("<w:tcPr>")) die(`${what}: target is not a plain cell`);
  const texts = textOf(frag);
  if (texts.some((t) => t.trim() !== "")) die(`${what}: target cell is not empty`);
  const pClose = frag.indexOf("</w:p>");
  if (pClose < 0) die(`${what}: target cell has no paragraph`);
  const next = frag.slice(0, pClose) + run + frag.slice(pClose);
  return xml.slice(0, cellStart) + next + xml.slice(cellEnd);
}

const raw = fs.readFileSync(TEMPLATE);
const zip = new PizZip(raw);
let xml = readXml(zip);

if (xml.includes("{%employee_signature}")) {
  console.log("Template is already tokenized — nothing to do.");
  process.exit(0);
}

// ---------------------------------------------------------------- transforms

// 1) Signature image: the empty cell right after the {DepratmentLocation} one.
{
  const i = xml.indexOf("DepratmentLocation");
  if (i < 0) die("token DepratmentLocation not found");
  const cellEnd = xml.indexOf("</w:tc>", i);
  const cellStart = nextTc(xml, cellEnd);
  if (cellEnd < 0 || cellStart < 0) die("signature cell anchors not found");
  const nextEnd = xml.indexOf("</w:tc>", cellStart);
  xml = insertRunIntoCell(
    xml,
    cellStart,
    nextEnd,
    RUN_CAL_11.replace("%s", "%employee_signature"),
    "signature",
  );
  console.log("✓ signature token");
}

// 2) One {chk_*} run inside each leave-type box: the empty cell directly
//    before the cell holding that box's label.
const BOXES = [
  ["Vacation Leave", "chk_vacation"],
  ["Maternity Leave", "chk_maternity"],
  ["Emergency Leave", "chk_emergency"],
  ["Sick Leave", "chk_sick"],
  ["Paternity Leave", "chk_paternity"],
  ["Bereavement Leave", "chk_bereavement"],
  ["Others:", "chk_others"],
];
for (const [needle, token] of BOXES) {
  const i = xml.indexOf(needle);
  if (i < 0) die(`label "${needle}" not found`);
  const cellEnd = xml.lastIndexOf("</w:tc>", i);
  const cellStart = lastTc(xml, cellEnd);
  if (cellEnd < 0 || cellStart < 0) die(`box anchors for "${needle}" not found`);
  const run = `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:b/></w:rPr><w:t>{${token}}</w:t></w:r>`;
  xml = insertRunIntoCell(xml, cellStart, cellEnd, run, `box ${needle}`);
  console.log(`✓ ${token} token`);
}

// 3) The "Others:" line: every run between "Others: " and the first pay paren
//    collapses into one {others_line} token (restored verbatim when empty).
{
  const re = /<w:t>Others: [\s\S]*?(?=<w:t>\(<\/w:t>)/;
  if (!re.test(xml)) die("others-line span not found");
  xml = xml.replace(re, "<w:t>Others: {others_line}</w:t>");
  console.log("✓ others_line token");
}

// 4) w/ PAY box: the spaced-out runs between the two parens become {chk_with_pay}.
{
  const re = /<w:t>\(<\/w:t>[\s\S]*?<w:t>\)<\/w:t>/;
  if (!re.test(xml)) die("w/ PAY parens not found");
  xml = xml.replace(re, "<w:t>({chk_with_pay})</w:t>");
  console.log("✓ chk_with_pay token");
}

// 5) w/o PAY box: parens already live in a single run.
{
  const from = '<w:t xml:space="preserve">   (  )</w:t>';
  if (!xml.includes(from)) die("w/o PAY parens not found");
  xml = xml.replace(from, '<w:t xml:space="preserve">   ({chk_without_pay})</w:t>');
  console.log("✓ chk_without_pay token");
}

// 6) Blue "Approved via Viber" note, one paragraph below {approvedBy}.
{
  const i = xml.indexOf("<w:t>approvedBy</w:t>");
  if (i < 0) die("token approvedBy not found");
  const pClose = xml.indexOf("</w:p>", i);
  if (pClose < 0) die("approvedBy paragraph not found");
  xml = xml.slice(0, pClose + 6) + VIBER_PARA + xml.slice(pClose + 6);
  console.log("✓ viber token");
}

// ------------------------------------------------------------------ validate

// A module can only be attached to one Docxtemplater instance, so every render
// gets its own (validation renders twice: a full fill and an empty fill).
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
  IdNumber: "12345",
  EmployeName: "JUAN DELA CRUZ",
  DepratmentLocation: "Operations",
  DateField: "2026-10-05",
  Postion: "Supervisor",
  NumberDaysApplied: "2",
  From: "2026-10-06",
  To: "2026-10-07",
  Remarks: "Medical rest advised by the company clinic.",
  date: "2026-10-08",
  approvedBy: "MARIA SANTOS",
  viber: "Approved via Viber",
  employee_signature: TRANSPARENT_PX,
  chk_vacation: "",
  chk_maternity: "",
  chk_emergency: "",
  chk_sick: "✓",
  chk_paternity: "",
  chk_bereavement: "",
  chk_others: "",
  others_line: "_".repeat(41),
  chk_with_pay: " ",
  chk_without_pay: "✓",
};

const EMPTY = Object.fromEntries(Object.keys(FULL).map((k) => [k, ""]));

let full;
try {
  full = render(FULL);
} catch (e) {
  die(`render with a full fill failed: ${e.message}`);
}
const checks = [
  ["name", full.includes("JUAN DELA CRUZ")],
  ["approver", full.includes("MARIA SANTOS")],
  ["viber note", full.includes("Approved via Viber")],
  ["reasons", full.includes("Medical rest advised")],
  ["signature image", full.includes("<w:drawing>")],
  ["tick count = 2", (full.match(/✓/g) ?? []).length === 2],
  ["no unrendered tokens left", !/\{[A-Za-z_#]/.test(full)],
];
for (const [what, ok] of checks) if (!ok) die(`render check failed: ${what}`);

try {
  render(EMPTY);
} catch (e) {
  die(`render with empty values failed: ${e.message}`);
}
console.log("✓ validation passed (full fill + empty fill)");

// ------------------------------------------------------------------- commit

const backup = path.join(os.tmpdir(), "loa_form_template.orig.docx");
fs.copyFileSync(TEMPLATE, backup);
zip.file("word/document.xml", xml);
fs.writeFileSync(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`Tokenized ${TEMPLATE}`);
console.log(`Original backed up to ${backup}`);
