import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from "docxtemplater-image-module-free";
import { formatTime12h } from "@/shared/time";
import type { ObEntry, ObForm } from "@/shared/types";

// The export fills a tokenized copy of the company's real Word form
// (public/ob_form_template.docx, generated from public/ob_template.docx) so the
// output matches the template's exact layout/styling instead of being rebuilt in
// code. Tokens: {id_number} {employee_name} {department} {date_filed} {position}
// {date_of_ob}, itinerary loop {#items}{from_place}{to_place}{purpose}
// {time_departure}{time_return}{/items}, {approved_by}, {viber} (blue note),
// and the inline signature image {%employee_signature}.
const TEMPLATE_URL = "/ob_form_template.docx";

// Signature image is rendered at most this big (pixels); aspect ratio preserved.
const SIG_MAX_W = 150;
const SIG_MAX_H = 45;

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

export async function downloadObWord({
  form,
  rows,
  fileName,
}: {
  form: ObForm;
  rows: ObEntry[];
  fileName: string;
}) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Could not load the Word template.");
  const content = await res.arrayBuffer();

  const sigB64 = toBase64(form.employee_signature ?? "");
  const sigSize = fit(sigB64 ? await naturalSize(form.employee_signature) : null);

  const imageModule = new ImageModule({
    centered: false,
    getImage: (tag: string) => base64ToBytes(tag),
    getSize: () => sigSize,
  });

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });

  // At least one (possibly blank) itinerary row so the box keeps its data cell.
  const items = rows.length
    ? rows.map((r) => ({
        from_place: r.from_place ?? "",
        to_place: r.to_place ?? "",
        purpose: r.purpose ?? "",
        time_departure: formatTime12h(r.time_departure ?? ""),
        time_return: formatTime12h(r.time_return ?? ""),
      }))
    : [{ from_place: "", to_place: "", purpose: "", time_departure: "", time_return: "" }];

  doc.render({
    id_number: form.id_number ?? "",
    employee_name: form.employee_name ?? "",
    department: form.department ?? "",
    date_filed: form.date_filed ?? "",
    position: form.position ?? "",
    date_of_ob: form.date_of_ob ?? "",
    approved_by: form.approved_by ?? "",
    viber: form.approved_via_viber ? "Approved via Viber" : "",
    employee_signature: sigB64,
    items,
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
