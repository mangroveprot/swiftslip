import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from "docxtemplater-image-module-free";
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

// Signature image is rendered at most this big (pixels); aspect ratio preserved.
const SIG_MAX_W = 150;
const SIG_MAX_H = 45;

// A 1×1 transparent pixel: docxtemplater's image module refuses to render an
// empty value, so an employee who hasn't signed yet still exports (the cell
// just stays blank, exactly like the untouched template).
const TRANSPARENT_PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Split a data URL / bare base64 into its raw base64 payload (no prefix). */
function toBase64(src: string): string {
  if (!src) return "";
  const comma = src.indexOf(",");
  return src.startsWith("data:") && comma >= 0 ? src.slice(comma + 1) : src;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Natural pixel size of an image source, or null if it can't be measured. */
function naturalSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fit(size: { w: number; h: number } | null): [number, number] {
  if (!size || !size.w || !size.h) return [SIG_MAX_W, SIG_MAX_H];
  const scale = Math.min(SIG_MAX_W / size.w, SIG_MAX_H / size.h);
  return [Math.round(size.w * scale), Math.round(size.h * scale)];
}

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

export async function downloadLoaWord({ form, fileName }: { form: LoaForm; fileName: string }) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Could not load the Word template.");
  const content = await res.arrayBuffer();

  const sigB64 = toBase64(form.employee_signature ?? "");
  const sigSize = fit(sigB64 ? await naturalSize(form.employee_signature) : null);

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

  // The fill line keeps the template's exact width; the typed Others text
  // goes on its own line directly UNDER it — the same rule as the preview
  // (and only while Others is the chosen type). The second line is appended
  // after render, just before the paragraph's close: {others_line} is
  // followed inline by the pay boxes, so a line break inside the token
  // would drag "( ) w/ PAY" down with the text.
  const typedOthers =
    form.leave_type === "Others" && form.leave_type_other ? form.leave_type_other.trim() : "";

  doc.render({
    IdNumber: form.id_number ?? "",
    EmployeName: form.employee_name ?? "",
    DepratmentLocation: form.department ?? "",
    DateField: form.date_filed ?? "",
    Postion: form.position ?? "",
    NumberDaysApplied: form.days_applied ?? "",
    From: form.date_from ?? "",
    To: form.date_to ?? "",
    Remarks: form.reasons ?? "",
    date: form.report_back_date ?? "",
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
    // The typed text's second line is appended after render, below.
    others_line: OTHERS_LINE,
    chk_with_pay: form.pay_status === "with_pay" ? "✓" : " ",
    chk_without_pay: form.pay_status === "without_pay" ? "✓" : " ",
  });

  if (typedOthers) {
    const entry = zip.file("word/document.xml");
    let xml = entry ? entry.asText() : "";
    const label = xml.indexOf("Others:");
    const pEnd = label < 0 ? -1 : xml.indexOf("</w:p>", label);
    const tcEnd = label < 0 ? -1 : xml.indexOf("</w:tc>", label);
    if (pEnd >= 0 && (tcEnd < 0 || pEnd < tcEnd)) {
      // Reuse the label run's rPr so the note matches the line's styling.
      const runStart = Math.max(xml.lastIndexOf("<w:r>", label), xml.lastIndexOf("<w:r ", label));
      const rPr =
        /<w:rPr>[\s\S]*<\/w:rPr>/.exec(runStart >= 0 ? xml.slice(runStart, label) : "")?.[0] ?? "";
      const text = typedOthers.replace(/[\r\n]+/g, " ");
      const under =
        `<w:r><w:br/></w:r><w:r>${rPr}` +
        `<w:t xml:space="preserve">${OTHERS_TEXT_INDENT}${xmlEsc(text)}</w:t></w:r>`;
      xml = xml.slice(0, pEnd) + under + xml.slice(pEnd);

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
      zip.file("word/document.xml", xml);
    }
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
