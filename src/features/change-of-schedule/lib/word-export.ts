import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from "docxtemplater-image-module-free";
import { base64ToBytes, fitSignature, naturalSize, toBase64 } from "@/lib/signature";
import { formatMonthDayYear } from "@/shared/period";
import type { CosForm, CosSchedule } from "@/shared/types";
import { formatScheduleLine } from "./schedule-line";

// The export fills a tokenized copy of the company's real Word form
// (public/cos_template.docx — tokenized by scripts/cos-template-tokenize.mjs) so
// the output matches the template's exact layout/styling instead of being
// rebuilt in code. Tokens: {id_number} {employee_name} {date_filed}
// {plant_location} {position} {chk_shift} {chk_rest_day} {effectivity_date}
// {schedule_from} {schedule_to} {reasons} {approved_by} {received_by}
// {processed_by}, and the inline signature image {%employee_signature}.
const TEMPLATE_URL = "/cos_template.docx";

/** The template's own box glyphs — a ticked box is the filled variant. */
const BOX_ON = "☒";
const BOX_OFF = "☐";

export async function downloadCosWord({
  form,
  rows,
  fileName,
}: {
  form: CosForm;
  rows: CosSchedule[];
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
    date_filed: formatMonthDayYear(form.date_filed),
    plant_location: form.plant_location ?? "",
    position: form.position ?? "",
    // Exactly one box gets the filled glyph — the form's single choice.
    chk_shift: form.change_type === "shift" ? BOX_ON : BOX_OFF,
    chk_rest_day: form.change_type === "rest_day" ? BOX_ON : BOX_OFF,
    // One entry per schedule line — the template repeats its schedule row over
    // this list. Always at least one (possibly blank) entry so the block keeps
    // its value row.
    schedules: rows.length
      ? rows.map((r) => ({
          effectivity_date: formatMonthDayYear(r.effectivity_date),
          schedule_from: formatScheduleLine(r.from_date, r.from_start, r.from_end),
          schedule_to: formatScheduleLine(r.to_date, r.to_start, r.to_end),
        }))
      : [{ effectivity_date: "", schedule_from: "", schedule_to: "" }],
    reasons: form.reasons ?? "",
    // The blue approval note the OB sheet prints above the approver's name.
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
