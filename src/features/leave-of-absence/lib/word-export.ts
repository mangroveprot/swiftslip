import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from "docxtemplater-image-module-free";
import { base64ToBytes, fitSignature, naturalSize, toBase64 } from "@/lib/signature";
import { formatMonthDayYear } from "@/shared/period";
import type { LoaForm } from "@/shared/types";

// The export fills a tokenized copy of the company's real Word form
// (public/loa_form_template.docx — tokenized by scripts/loa-template-tokenize.mjs)
// so the output matches the template's exact layout/styling instead of being
// rebuilt in code. Original tokens: {IdNumber} {EmployeName} {DepratmentLocation}
// {DateField} {Postion} {NumberDaysApplied} {From} {To} {Remarks} {date}
// {approvedBy}. The tokenize script adds: the inline signature image
// {%employee_signature}, one ✓ token per leave-type box (chk_*), the "Others:"
// line ({others_line}), the two pay boxes ({chk_with_pay}/{chk_without_pay}),
// and {viber} (blue note).
const TEMPLATE_URL = "/loa_form_template.docx";

// A 1×1 FULLY transparent pixel (RGBA 0,0,0,0): docxtemplater's image module
// refuses to render an empty value, so an employee who hasn't signed yet still
// exports — the cell just stays blank, exactly like the untouched template.
// (The value this replaced was RGBA 0,0,255,127 — a half-opaque BLUE — which
// Word drew as a blue block in the signature cell of every unsigned export.)
const TRANSPARENT_PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";

/** The template's own empty "Others:" line — the fallback when no text is given. */
const OTHERS_LINE = "_".repeat(41);

/** Second-line indent for the typed Others text — 15 Calibri-bold spaces
 *  match the width of the "Others: " prefix (48.5px), so the text starts
 *  under the line instead of in front of it (same rule as the preview). */
const OTHERS_TEXT_INDENT = " ".repeat(15);

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** form.leave_type → its {chk_*} token in the tokenized template (single choice). */
const CHECK_TOKENS: Record<string, string> = {
  "Vacation Leave": "chk_vacation",
  "Maternity Leave": "chk_maternity",
  "Emergency Leave": "chk_emergency",
  "Sick Leave": "chk_sick",
  "Paternity Leave": "chk_paternity",
  "Bereavement Leave": "chk_bereavement",
  Others: "chk_others",
};

/**
 * `w14:paraId` of the three header cells the preview centres: the "Date Filed:" /
 * "Position:" / "Number of Days Applied:" labels and the value cells under them.
 * The ids live in public/loa_form_template.docx, so they survive every render
 * and there's no text to match against (the value cells are empty in the
 * template — their contents differ on every export).
 */
const CENTERED_PARA_IDS = [
  "36183A05", // Date Filed:
  "5A76AA9B", // Position:
  "7DE5730A", // Number of Days Applied:
  "400AA95C", // {DateField}
  "74100F27", // {Postion}
  "439D4F4E", // {NumberDaysApplied}
];

/** Insert `markup` into the `<w:pPr>` of the paragraph carrying `paraId`, right
 *  before the paragraph's own run-props — where OOXML wants ind / jc / spacing
 *  to sit. Anything that doesn't look like the expected shape is returned
 *  unchanged rather than mangled. */
function insertInPPr(xml: string, paraId: string, markup: string): string {
  const at = xml.indexOf(`w14:paraId="${paraId}"`);
  if (at < 0) return xml;
  const pPr = xml.indexOf("<w:pPr>", at);
  const pPrEnd = pPr < 0 ? -1 : xml.indexOf("</w:pPr>", pPr);
  const pEnd = xml.indexOf("</w:p>", at);
  if (pPr < 0 || pPrEnd < 0 || pEnd < 0 || pPrEnd > pEnd) return xml;
  const rPr = xml.indexOf("<w:rPr>", pPr);
  const insertAt = rPr >= 0 && rPr < pPrEnd ? rPr : pPrEnd;
  return xml.slice(0, insertAt) + markup + xml.slice(insertAt);
}

/** Centre the paragraph carrying `paraId` — `<w:jc>` after `ind`, before `rPr`. */
const centerParagraph = (xml: string, paraId: string) =>
  insertInPPr(xml, paraId, '<w:jc w:val="center"/>');

/**
 * The "Others:" paragraph (typed answer on top, fill line underneath).
 *
 * The answer line is tightened so it sits just above the fill line — but not
 * so far that the two collide. `w:line` under `lineRule="auto"` counts 240ths
 * of a single line, so 190 is ~10.9pt for Calibri 11, i.e. ~14.6px between the
 * two baselines: close to the preview's own spacing, and clear of the font's
 * glyph extent. Values much below ~170 make Word draw the answer straight ON
 * the fill line (the value this replaced was 67, ≈3.9pt — less than a third of
 * the text's own height, so the two lines overlapped).
 *
 * The cell is bottom-aligned (`w:vAlign="bottom"`), so the leading moves the
 * answer line only; the 75-twip `after` is what keeps the fill line itself on
 * the baseline the template leaves it at.
 */
const OTHERS_PARA_ID = "0C022627";

export async function downloadLoaWord({ form, fileName }: { form: LoaForm; fileName: string }) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Could not load the Word template.");
  const content = await res.arrayBuffer();

  const sigB64 = toBase64(form.employee_signature ?? "");
  const sigSize = fitSignature(sigB64 ? await naturalSize(form.employee_signature) : null);

  const imageModule = new ImageModule({
    centered: false,
    getImage: (tag: string) => base64ToBytes(tag || TRANSPARENT_PX),
    getSize: () => sigSize,
  });

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });

  const check = (on: boolean) => (on ? "✓" : "");
  const box = (type: string) =>
    Object.fromEntries([[CHECK_TOKENS[type], check(form.leave_type === type)]]);

  // The typed Others answer goes ON TOP (indented to where the fill line
  // starts), with "Others:" and the line — plus the two pay boxes, spaced off
  // the line — underneath it, the same order the preview draws. It only appears
  // while Others is the chosen type; switching away keeps the draft in the form
  // but out of the sheet/export.
  const typedOthers =
    form.leave_type === "Others" && form.leave_type_other ? form.leave_type_other.trim() : "";

  doc.render({
    IdNumber: form.id_number ?? "",
    EmployeName: form.employee_name ?? "",
    DepratmentLocation: form.department ?? "",
    DateField: formatMonthDayYear(form.date_filed),
    Postion: form.position ?? "",
    NumberDaysApplied: form.days_applied ?? "",
    From: formatMonthDayYear(form.date_from),
    To: formatMonthDayYear(form.date_to),
    Remarks: form.reasons ?? "",
    date: formatMonthDayYear(form.report_back_date),
    approvedBy: form.approved_by ?? "",
    viber: form.approved_via_viber ? "Approved via Viber" : "",
    employee_signature: sigB64 || TRANSPARENT_PX,
    // Exactly one box gets the tick — the form's single choice.
    ...box("Vacation Leave"),
    ...box("Maternity Leave"),
    ...box("Emergency Leave"),
    ...box("Sick Leave"),
    ...box("Paternity Leave"),
    ...box("Bereavement Leave"),
    ...box("Others"),
    // The two trailing spaces are the gap before "( ) w/ PAY"; docxtemplater
    // keeps them (it emits xml:space="preserve" on the run).
    others_line: OTHERS_LINE + "  ",
    chk_with_pay: form.pay_status === "with_pay" ? "✓" : " ",
    chk_without_pay: form.pay_status === "without_pay" ? "✓" : " ",
  });

  // Post-render XML pass: the typed answer sits ON TOP of the fill line and the
  // Date Filed / Position / Number of Days cells are centred — both matching the
  // preview. Centring runs on every export; the answer only when Others is the
  // chosen type.
  const entry = zip.file("word/document.xml");
  let xml = entry ? entry.asText() : "";
  if (xml) {
    for (const paraId of CENTERED_PARA_IDS) xml = centerParagraph(xml, paraId);
    // …and tighten the answer line so it sits just above its fill line.
    xml = insertInPPr(
      xml,
      OTHERS_PARA_ID,
      '<w:spacing w:line="190" w:lineRule="auto" w:after="75"/>',
    );

    if (typedOthers) {
      const label = xml.indexOf("Others:");
      const pEnd = label < 0 ? -1 : xml.indexOf("</w:p>", label);
      const tcEnd = label < 0 ? -1 : xml.indexOf("</w:tc>", label);
      if (pEnd >= 0 && (tcEnd < 0 || pEnd < tcEnd)) {
        // Reuse the label run's rPr so the answer matches the line's styling,
        // then drop it in BEFORE that run: text on top, "Others:" and the fill
        // line underneath — the order the preview draws. {others_line} is
        // followed inline by the pay boxes, so the break goes between the two
        // runs rather than inside the token.
        const runStart = Math.max(xml.lastIndexOf("<w:r>", label), xml.lastIndexOf("<w:r ", label));
        const rPr =
          /<w:rPr>[\s\S]*<\/w:rPr>/.exec(runStart >= 0 ? xml.slice(runStart, label) : "")?.[0] ??
          "";
        const text = typedOthers.replace(/[\r\n]+/g, " ");
        if (runStart >= 0) {
          const above =
            `<w:r>${rPr}<w:t xml:space="preserve">${OTHERS_TEXT_INDENT}${xmlEsc(text)}</w:t></w:r>` +
            `<w:r>${rPr}<w:br/></w:r>`;
          xml = xml.slice(0, runStart) + above + xml.slice(runStart);
        }

        // The template ends with an invisible empty paragraph (after the last
        // table) that still occupies a full line — with the sheet one line
        // taller, Word spills it onto a blank second page. Pin it to 2pt for
        // this export only; every other export stays byte-identical.
        const sect = xml.lastIndexOf("<w:sectPr");
        const pOpen = Math.max(xml.lastIndexOf("<w:p ", sect), xml.lastIndexOf("<w:p>", sect));
        const pClose = pOpen < 0 ? -1 : xml.indexOf("</w:p>", pOpen);
        if (pOpen >= 0 && pClose > pOpen) {
          const para = xml.slice(pOpen, pClose);
          const tight = '<w:spacing w:line="40" w:lineRule="exact"/>';
          let fixed: string;
          if (/<w:spacing\b[^>]*\/>/.test(para)) {
            fixed = para.replace(/<w:spacing\b[^>]*\/>/, tight);
          } else {
            // spacing sits after pStyle and before jc/rPr in a valid pPr.
            const at = ["<w:jc", "<w:rPr", "</w:pPr>"]
              .map((t) => para.indexOf(t))
              .filter((n) => n >= 0)
              .sort((a, b) => a - b)[0];
            fixed =
              at !== undefined
                ? para.slice(0, at) + tight + para.slice(at)
                : para.replace(/^(<w:p(?:\s[^>]*)?>)/, "$1<w:pPr>" + tight + "</w:pPr>");
          }
          xml = xml.slice(0, pOpen) + fixed + xml.slice(pClose);
        }
      }
    }

    zip.file("word/document.xml", xml);
  }

  const blob = zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const name = fileName.replace(/\.docx?$/i, "") + ".docx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
