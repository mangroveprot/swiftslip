import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from "docxtemplater-image-module-free";
import { resolveExitSignoff } from "@/features/official-business/lib/exit-signoff";
import {
  obDepartureDisplay,
  obDepartureRowIndex,
  obDepartureText,
  obReturnDisplay,
  obReturnRowIndex,
  obReturnText,
} from "@/features/official-business/lib/time-of-display";
import { base64ToBytes, naturalSize, toBase64 } from "@/lib/signature";
import { formatMonthDayYear } from "@swiftslip/shared/period";
import type { ObSigners } from "@swiftslip/shared/api-types";
import type { ObHrFields } from "@swiftslip/shared/hr";
import type { ObEntry, ObForm } from "@swiftslip/shared/types";

// The export fills a tokenized copy of the company's real Word form
// (public/ob_form_template.docx, generated from public/ob_template.docx) so the
// output matches the template's exact layout/styling instead of being rebuilt in
// code. Tokens: {id_number} {employee_name} {department} {date_filed} {position}
// {date_of_ob}, itinerary loop {#items}{from_place}{to_place}{purpose}
// {time_departure}{time_return}{/items}, {approved_by}, {viber} (blue note),
// the inline signature image {%employee_signature}, the box HR verifies
// ({%hr_signature} {hr_name} {hr_position}) and the exit-clearance rows
// ({departure_residence} {%departure_signature} {departure_time}
// {departure_date} + the arrival equivalents). Tokens are
// added by scripts/tokenize-ob-template.mjs, which validates the result.
const TEMPLATE_URL = "/ob_form_template.docx";

/**
 * Largest size each signature box gives its image (pixels), the same caps the
 * on-screen preview uses, so the Word file and the sheet look alike.
 */
const IMAGE_MAX = new Map<string, [number, number]>([
  ["employee_signature", [150, 45]],
  ["hr_signature", [136, 36]],
  ["departure_signature", [72, 20]],
  ["arrival_signature", [72, 20]],
]);

/** Fallback box when a token has no cap of its own. */
const DEFAULT_MAX: [number, number] = [150, 45];

/** Natural pixel size of a signature given as a data URL or bare base64. */
function measure(src: string): Promise<{ w: number; h: number } | null> {
  if (!src) return Promise.resolve(null);
  const url =
    src.startsWith("data:") || src.startsWith("http") ? src : `data:image/png;base64,${src}`;
  return naturalSize(url);
}

/** Largest size that fits `max`, aspect ratio preserved. */
function fit(
  size: { w: number; h: number } | null,
  [maxW, maxH]: [number, number],
): [number, number] {
  if (!size || !size.w || !size.h) return [maxW, maxH];
  const scale = Math.min(maxW / size.w, maxH / size.h);
  return [Math.round(size.w * scale), Math.round(size.h * scale)];
}

export async function downloadObWord({
  form,
  rows,
  hr,
  signers,
  fileName,
}: {
  form: ObForm;
  rows: ObEntry[];
  /**
   * HR-owned sign-off columns. Passed the same way `ObPreview` gets them, so
   * the boxes this file prints are the ones the preview prints.
   */
  hr?: Partial<ObHrFields> | null | undefined;
  /** Resolved names, positions + e-signatures for those boxes. */
  signers?: ObSigners | null | undefined;
  fileName: string;
}) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Could not load the Word template.");
  const content = await res.arrayBuffer();

  const details = hr ?? {};
  const exit = resolveExitSignoff(hr, signers);

  // docxtemplater's image module sizes images synchronously during render, so
  // every signature is measured up front, one map keyed by token name.
  const sources = {
    employee_signature: form.employee_signature ?? "",
    hr_signature: exit.verified?.signature ?? "",
    departure_signature: exit.departure.signer?.signature ?? "",
    arrival_signature: exit.arrival.signer?.signature ?? "",
  };
  const sizes = new Map<string, [number, number]>();
  for (const [tag, src] of Object.entries(sources)) {
    sizes.set(tag, fit(await measure(src), IMAGE_MAX.get(tag) ?? DEFAULT_MAX));
  }

  const imageModule = new ImageModule({
    centered: false,
    getImage: (tag: string) => base64ToBytes(tag),
    getSize: (_img, _value, tagName) => (tagName ? sizes.get(tagName) : undefined) ?? DEFAULT_MAX,
  });

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });

  // At least one (possibly blank) itinerary row so the box keeps its data cell.
  // DEPARTURE is time-only. RETURN prints the signed arrival date on a second
  // line only when it differs from the Date of OB: `linebreaks: true` above
  // turns the \n into a real Word break, just like the preview cells.
  const departureRow = obDepartureRowIndex(rows);
  const returnRow = obReturnRowIndex(rows);
  const items = rows.length
    ? rows.map((r, i) => ({
        from_place: r.from_place ?? "",
        to_place: r.to_place ?? "",
        purpose: r.purpose ?? "",
        time_departure: obDepartureText(
          obDepartureDisplay(r, {
            hr,
            isDepartureRow: i === departureRow,
          }),
        ),
        time_return: obReturnText(
          obReturnDisplay(r, {
            hr,
            isReturnRow: i === returnRow,
            dateOfOb: form.date_of_ob,
          }),
        ),
      }))
    : [{ from_place: "", to_place: "", purpose: "", time_departure: "", time_return: "" }];

  // An unsigned box prints nothing at all, never a half-filled line.
  const departure = exit.departure;
  const arrival = exit.arrival;

  doc.render({
    id_number: form.id_number ?? "",
    employee_name: form.employee_name ?? "",
    department: form.department ?? "",
    date_filed: formatMonthDayYear(form.date_filed),
    position: form.position ?? "",
    date_of_ob: formatMonthDayYear(form.date_of_ob),
    approved_by: form.approved_by ?? "",
    viber: form.approved_via_viber ? "Approved via Viber" : "",
    employee_signature: toBase64(sources.employee_signature),
    items,
    // Verified by HRD: signature, printed name, then the position line.
    hr_signature: toBase64(sources.hr_signature),
    hr_name: exit.verified?.name ?? "",
    hr_position: exit.verified?.position ?? "",
    // Exit clearance, the return leg swaps the route, as on the paper form.
    departure_residence: departure.signed ? (details.residence ?? "") : "",
    departure_destination: departure.signed ? (details.destination ?? "") : "",
    departure_signature: toBase64(sources.departure_signature),
    departure_time: departure.signed ? departure.time : "",
    departure_date: departure.signed ? departure.date : "",
    arrival_residence: arrival.signed ? (details.destination ?? "") : "",
    arrival_destination: arrival.signed ? (details.residence ?? "") : "",
    arrival_signature: toBase64(sources.arrival_signature),
    arrival_time: arrival.signed ? arrival.time : "",
    arrival_date: arrival.signed ? arrival.date : "",
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
