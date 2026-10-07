import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from "docxtemplater-image-module-free";
import { base64ToBytes, fitSignature, naturalSize, toBase64 } from "@/lib/signature";
import { formatClock } from "@/lib/clock";
import { formatMonthDayYear } from "@/shared/period";
import type { OtEntry, OtForm } from "@/shared/types";
import { formatOtHours } from "./ot-line";

// The export fills a tokenized copy of the company's real Word form
// (public/ot_template.docx — tokenized by scripts/ot-template-tokenize.mjs) so
// the output matches the template's exact layout/styling instead of being
// rebuilt in code. Tokens: {id_number} {employee_name} {department}
// {position} {date_filed}, the OT table loop {#entries}{date_of_ot}
// {regular_hours}{actual_hours}{total_hours}{validation}{/entries},
// {reasons}, {viber} (blue note), {approved_by} {received_by} {processed_by},
// and the inline signature image {%employee_signature}.
const TEMPLATE_URL = "/ot_template.docx";

export async function downloadOtWord({
  form,
  entries,
  fileName,
}: {
  form: OtForm;
  entries: OtEntry[];
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

  doc.render({
    id_number: form.id_number ?? "",
    employee_name: form.employee_name ?? "",
    department: form.department ?? "",
    position: form.position ?? "",
    date_filed: form.date_filed ?? "",
    // One entry per OT line — the template repeats its value row over this list.
    entries: entries.length
      ? entries.map((e) => ({
          date_of_ot: formatMonthDayYear(e.date_of_ot),
          // REGULAR SHIFT SCHEDULE is ONE column on the sheet, so its two times
          // compose into a single range.
          regular_hours: formatOtHours(e.regular_from, e.regular_to),
          // ACTUAL OT HOURS is two columns, so the times stay separate.
          actual_from: formatClock(e.actual_from),
          actual_to: formatClock(e.actual_to),
          total_hours: e.total_hours ?? "",
          validation: e.validation ?? "",
        }))
      : [
          {
            date_of_ot: "",
            regular_hours: "",
            actual_from: "",
            actual_to: "",
            total_hours: "",
            validation: "",
          },
        ],
    reasons: form.reasons ?? "",
    viber: form.approved_via_viber ? "Approved via Viber" : "",
    approved_by: form.approved_by ?? "",
    received_by: form.received_by ?? "",
    processed_by: form.processed_by ?? "",
    employee_signature: sigB64,
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
