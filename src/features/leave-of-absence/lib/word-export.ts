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
    others_line: form.leave_type_other || OTHERS_LINE,
    chk_with_pay: form.pay_status === "with_pay" ? "✓" : " ",
    chk_without_pay: form.pay_status === "without_pay" ? "✓" : " ",
  });

  const blob = doc.getZip().generate({
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
