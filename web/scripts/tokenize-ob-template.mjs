// Regenerates public/ob_form_template.docx from the pristine company form
// public/ob_template.docx by injecting docxtemplater tokens into the exact
// paragraphs of word/document.xml (matched by their stable w14:paraId).
//
// Run from the web folder:  node scripts/tokenize-ob-template.mjs
//
// The pristine template is never hand-edited; re-run this after replacing
// public/ob_template.docx to reproduce the tokenized copy the export uses.
// The result is validated with docxtemplater (a full fill AND an empty fill)
// before anything is written, so a bad token never ships.
import fs from "node:fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";

const SRC = "public/ob_template.docx";
const OUT = "public/ob_form_template.docx";

/** Insert a run carrying `tokenText` just before the paragraph's </w:p>. */
function injectRun(xml, paraId, tokenText) {
  const i = xml.indexOf(`w14:paraId="${paraId}"`);
  if (i < 0) throw new Error("paraId not found: " + paraId);
  const close = xml.indexOf("</w:p>", i);
  if (close < 0) throw new Error("no </w:p> after " + paraId);
  const run = `<w:r><w:t xml:space="preserve">${tokenText}</w:t></w:r>`;
  return xml.slice(0, close) + run + xml.slice(close);
}

/** Replace `find` with `repl` inside a single paragraph (matched by paraId). */
function replaceInPara(xml, paraId, find, repl) {
  const i = xml.indexOf(`w14:paraId="${paraId}"`);
  if (i < 0) throw new Error("paraId not found: " + paraId);
  const close = xml.indexOf("</w:p>", i);
  if (close < 0) throw new Error("no </w:p> after " + paraId);
  const seg = xml.slice(i, close);
  if (!seg.includes(find)) throw new Error(`"${find}" not in para ${paraId}`);
  return xml.slice(0, i) + seg.replace(find, repl) + xml.slice(close);
}

/** Insert whole paragraph XML immediately AFTER the paragraph `paraId`. */
function insertParaAfter(xml, paraId, paraXml) {
  const i = xml.indexOf(`w14:paraId="${paraId}"`);
  if (i < 0) throw new Error("paraId not found: " + paraId);
  const close = xml.indexOf("</w:p>", i);
  if (close < 0) throw new Error("no </w:p> after " + paraId);
  const at = close + "</w:p>".length;
  return xml.slice(0, at) + paraXml + xml.slice(at);
}

/**
 * One NoSpacing paragraph holding `text` at `sz` half-points — the shape of the
 * template's own signature lines, so added lines inherit its look.
 */
function textPara(text, { sz, center = false }) {
  const fonts = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>';
  const jc = center ? '<w:jc w:val="center"/>' : "";
  return (
    `<w:p><w:pPr><w:pStyle w:val="NoSpacing"/>${jc}` +
    `<w:rPr>${fonts}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr>${fonts}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>` +
    `<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  );
}

const zip = new PizZip(fs.readFileSync(SRC));
let xml = zip.file("word/document.xml").asText();
// The company logo is already a drawing — every signature token must add one.
const BASE_DRAWINGS = (xml.match(/<w:drawing/g) ?? []).length;

// Identity grid values (empty cells beneath each label).
xml = injectRun(xml, "7E4CDE95", "{id_number}");
xml = injectRun(xml, "35C19850", "{employee_name}");
xml = injectRun(xml, "2B31DC9D", "{department}");
xml = injectRun(xml, "400AA95C", "{date_filed}");
xml = injectRun(xml, "74100F27", "{position}");
xml = injectRun(xml, "04F83C21", "{date_of_ob}");

// Itinerary: wrap the single data row in a {#items} loop so it repeats per row.
xml = injectRun(xml, "4049AE62", "{#items}{from_place}");
xml = injectRun(xml, "127E4A72", "{to_place}");
xml = injectRun(xml, "4D5AD78A", "{purpose}");
xml = injectRun(xml, "310B9D34", "{time_departure}");
xml = injectRun(xml, "259AA617", "{time_return}{/items}");

// Signatures: inline employee signature image, printed names, blue Viber note.
xml = injectRun(xml, "17FE3BB4", "{%employee_signature}");
xml = replaceInPara(xml, "335E2876", "FIRSTNAME LASTNAME", "{employee_name}");
xml = replaceInPara(xml, "46ABA061", "FIRSTNAME LASTNAME", "{approved_by}");
xml = replaceInPara(xml, "53B8A13B", "Approved via Viber", "{viber}");

// The template printed names are only 9pt (sz 18) which reads too small under the
// signature lines; bump both to 11pt (sz 22) to match the rest of the form.
const SZ_9 = '<w:sz w:val="18"/><w:szCs w:val="18"/>';
const SZ_11 = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
xml = replaceInPara(xml, "335E2876", SZ_9, SZ_11);
xml = replaceInPara(xml, "46ABA061", SZ_9, SZ_11);

// "VERIFIED BY: HRD" — the box HR signs. The cell ships with two blank
// paragraphs; the second becomes the signature line and two more (printed name,
// then the position line under it) follow it, the paper form's order.
xml = replaceInPara(xml, "15BD7A53", '<w:jc w:val="both"/>', '<w:jc w:val="center"/>');
xml = injectRun(xml, "15BD7A53", "{%hr_signature}");
xml = insertParaAfter(
  xml,
  "15BD7A53",
  textPara("{hr_name}", { sz: 22, center: true }) +
    textPara("{hr_position}", { sz: 18, center: true }),
);

// Exit clearance, departure row: the first cell holds the label only — the
// date/time moved into the guard/HR cell with the signature — then the route
// cells, then that cell: a small signature with the time and the date beside
// it, left to right, exactly like the preview.
xml = injectRun(xml, "700DFEFA", "{departure_residence}");
xml = injectRun(xml, "4AC909ED", "{departure_destination}");
xml = injectRun(xml, "02B1D283", "{%departure_signature}");
xml = injectRun(xml, "02B1D283", "  {departure_time}  {departure_date}");

// Arrival row — the return leg prints the swapped route, as on the paper form.
xml = injectRun(xml, "674A17A2", "{arrival_residence}");
xml = injectRun(xml, "70965AF1", "{arrival_destination}");
xml = injectRun(xml, "52CB1110", "{%arrival_signature}");
xml = injectRun(xml, "52CB1110", "  {arrival_time}  {arrival_date}");

// ------------------------------------------------------------------ validate

// A module can only be attached to one Docxtemplater instance, so every render
// gets its own. Sizes are fixed here: Node has no `Image` to measure with, and
// the app passes real per-signature sizes at export time.
const IMAGE_SIZE = {
  employee_signature: [150, 45],
  hr_signature: [136, 36],
  departure_signature: [72, 20],
  arrival_signature: [72, 20],
};

function makeImageModule() {
  return new ImageModule({
    centered: false,
    getImage: (tag) => {
      const bin = atob(tag);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    },
    getSize: (_img, _value, tagName) => IMAGE_SIZE[tagName] ?? [150, 45],
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

// A 1×1 transparent PNG: proves every image token resolves without shipping a
// real signature into the template.
const PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const FULL = {
  id_number: "12345",
  employee_name: "JUAN DELA CRUZ",
  department: "Operations",
  date_filed: "10/28/2026",
  position: "Supervisor",
  date_of_ob: "10/28/2026",
  approved_by: "MARIA SANTOS",
  viber: "Approved via Viber",
  employee_signature: PX,
  items: [
    {
      from_place: "Head Office",
      to_place: "Ortigas St.",
      purpose: "Delivery",
      time_departure: "8:45 AM",
      time_return: "3:55 PM",
    },
  ],
  hr_signature: PX,
  hr_name: "MARY JUSTINE R. ACOSTA",
  hr_position: "HR ASSOCIATE",
  departure_residence: "Head Office",
  departure_destination: "Ortigas St.",
  departure_signature: PX,
  departure_time: "8:45 AM",
  departure_date: "10/28/2026",
  arrival_residence: "Ortigas St.",
  arrival_destination: "Head Office",
  arrival_signature: PX,
  arrival_time: "3:55 PM",
  arrival_date: "10/28/2026",
};

const EMPTY = Object.fromEntries(Object.keys(FULL).map((k) => [k, ""]));

let full;
try {
  full = render(FULL);
} catch (e) {
  throw new Error(`render with a full fill failed: ${e.message}`);
}

const checks = [
  ["HRD name", full.includes("MARY JUSTINE R. ACOSTA")],
  ["HRD position", full.includes("HR ASSOCIATE")],
  ["departure route", full.includes("Head Office") && full.includes("Ortigas St.")],
  ["departure time + date", full.includes("8:45 AM  10/28/2026")],
  ["arrival time + date", full.includes("3:55 PM  10/28/2026")],
  [
    "first cell keeps its label only — no date/time line above it",
    full.includes("Date / Time of Actual Departure") &&
      full.includes("Date / Time of Actual Arrival") &&
      !full.includes("10/28/2026 ·"),
  ],
  [
    "four signature images",
    (full.match(/<w:drawing/g) ?? []).length === BASE_DRAWINGS + 4,
    (full.match(/<w:drawing/g) ?? []).length,
  ],
  ["no unrendered tokens left", !/\{[A-Za-z_#]/.test(full)],
];
for (const [what, ok, detail] of checks) {
  if (!ok) {
    throw new Error(
      `render check failed: ${what}${detail === undefined ? "" : ` (got ${detail})`}`,
    );
  }
}

try {
  render(EMPTY);
} catch (e) {
  throw new Error(`render with empty values failed: ${e.message}`);
}
console.log("✓ validation passed (full fill + empty fill)");

zip.file("word/document.xml", xml);
fs.writeFileSync(OUT, zip.generate({ type: "nodebuffer" }));
console.log("Wrote", OUT);
