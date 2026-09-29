// Regenerates public/ob_form_template.docx from the pristine company form
// public/ob_template.docx by injecting docxtemplater tokens into the exact
// paragraphs of word/document.xml (matched by their stable w14:paraId).
//
// Run from the project root:  node scripts/tokenize-ob-template.mjs
//
// The pristine template is never hand-edited; re-run this after replacing
// public/ob_template.docx to reproduce the tokenized copy the export uses.
import fs from "node:fs";
import PizZip from "pizzip";

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
  const seg = xml.slice(i, close);
  if (!seg.includes(find)) throw new Error(`"${find}" not in para ${paraId}`);
  return xml.slice(0, i) + seg.replace(find, repl) + xml.slice(close);
}

const zip = new PizZip(fs.readFileSync(SRC));
let xml = zip.file("word/document.xml").asText();

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

zip.file("word/document.xml", xml);
fs.writeFileSync(OUT, zip.generate({ type: "nodebuffer" }));
console.log("Wrote", OUT);
