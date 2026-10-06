import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from "docxtemplater-image-module-free";
import { base64ToBytes, fitSignature, naturalSize, toBase64 } from "@/lib/signature";
import { formatMonthDayYear } from "@/shared/period";
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
  const sigSize = fitSignature(sigB64 ? await naturalSize(form.employee_signature) : null);

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
    date_filed: formatMonthDayYear(form.date_filed),
    position: form.position ?? "",
    date_of_ob: formatMonthDayYear(form.date_of_ob),
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
