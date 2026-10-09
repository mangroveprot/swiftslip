import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from "docxtemplater-image-module-free";
import {
  base64ToBytes,
  fitSignature,
  naturalSize,
  signatureWithoutPaper,
  toBase64,
} from "@/lib/signature";
import { formatPeriodDateRange, formatShortDate } from "@/shared/period";
import type { DtrEntry, DtrHeader, DtrTemplate } from "@/shared/types";

// The export fills a tokenized copy of the company's real Word form
// (public/dtr_template.docx — tokenized by scripts/dtr-template-tokenize.mjs) so
// the output matches the template's exact layout/styling instead of being
// rebuilt in code. Tokens: {emp_no} {name} {designation} {area} {month} {year},
// the daily-entries table loop {#entries}{date}{time_in}{time_out}
// {schedule}{remarks}{/entries}, {certified_by}, and the signature image
// {%employee_signature}.
//
// After docxtemplater renders, a post-process converts the inline signature
// drawing to a floating/anchored drawing (wp:anchor with wrapNone) so the
// signature strokes overlay the printed name — matching the on-screen preview.
const TEMPLATE_URL = "/dtr_template.docx";

/** EMU per twip — page geometry in the template is measured in twips. */
const EMU_PER_TWIP = 635;
/** EMU per point. */
const EMU_PER_PT = 12700;
/**
 * A line box as a multiple of the point size. Calibri's ascent + descent + gap
 * come to 1.2207 em, which is what Word uses for single spacing.
 */
const LINE_HEIGHT_EM = 1.2207;
/** Breathing room left between the entries table and the signature block (twips). */
const SPACE_GAP_TWIPS = 300;

/**
 * Default line height of the template, read from its own styles so the overlay
 * tracks whatever font the document uses rather than a hard-coded guess.
 */
function templateLineHeightEmu(zip: PizZip): number {
  const styles = zip.file("word/styles.xml")?.asText() ?? "";
  const halfPoints = Number(
    styles.match(/<w:docDefaults>[\s\S]*?<w:sz w:val="(\d+)"\/>/)?.[1] ?? "22",
  );
  return Math.round((halfPoints / 2) * LINE_HEIGHT_EM * EMU_PER_PT);
}

/**
 * Turn the inline signature drawing into a floating one so the signature strokes
 * land over the printed name — image in front, text showing through its
 * transparent background, which is what the on-screen preview does.
 *
 * Two things matter here, and both are easy to get wrong:
 *
 *  - **Child order is fixed by the schema.** `CT_Anchor` requires
 *    simplePos → positionH → positionV → extent → (effectExtent) → wrap* →
 *    docPr → cNvGraphicFramePr → graphic. Emitting `wrapNone` before `extent`
 *    makes Word reject the file with a repair prompt, so the anchor is rebuilt
 *    from the original parts instead of patched in place.
 *  - **The geometry is measured, not assumed.** The name is centred in the text
 *    column, so the image has to be centred on that same column — which means
 *    deriving the centre from the page's margins and the paragraph's right
 *    indent rather than hardcoding the numbers the current template happens to
 *    use. Vertically the image's bottom is aligned with the bottom of the text
 *    line, which lets it extend upward over the name.
 */
function overlaySignature(xml: string, lineHeightEmu: number): string {
  // The last inline drawing that isn't the logo is the signature.
  const inlines = [...xml.matchAll(/<wp:inline\b[\s\S]*?<\/wp:inline>/g)].filter(
    (m) => !m[0].includes('name="logo"'),
  );
  const last = inlines.at(-1);
  if (!last) return xml;
  const inline = last[0];
  const extent = inline.match(/<wp:extent\b[^>]*\/>/)?.[0];
  const docPr = inline.match(/<wp:docPr\b[^>]*\/>/);
  const cNvFrame = inline.match(
    /<wp:cNvGraphicFramePr\b[\s\S]*?<\/wp:cNvGraphicFramePr>|<wp:cNvGraphicFramePr\b[^>]*\/>/,
  );
  const graphic = inline.match(/<a:graphic\b[\s\S]*?<\/a:graphic>/)?.[0];
  const cx = Number(extent?.match(/cx="(\d+)"/)?.[1] ?? 0);
  const cy = Number(extent?.match(/cy="(\d+)"/)?.[1] ?? 0);
  if (!extent || !docPr || !graphic || !cx || !cy) return xml;

  // The paragraph holding the drawing defines the column the name is centred in.
  const drawStart = last.index;
  const paraStart = xml.lastIndexOf("<w:p ", drawStart);
  const paraEnd = xml.indexOf("</w:p>", drawStart);
  const para = xml.slice(paraStart === -1 ? 0 : paraStart, paraEnd === -1 ? xml.length : paraEnd);
  const indRight = Number(para.match(/<w:ind\b[^>]*w:right="(\d+)"/)?.[1] ?? 0);

  // Page geometry, read rather than assumed.
  const sect = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";
  const pageWidth = Number(sect.match(/<w:pgSz\b[^>]*w:w="(\d+)"/)?.[1] ?? 11906);
  const marginLeft = Number(sect.match(/<w:pgMar\b[^>]*w:left="(\d+)"/)?.[1] ?? 0);
  const marginRight = Number(sect.match(/<w:pgMar\b[^>]*w:right="(\d+)"/)?.[1] ?? 0);

  // Centre the image on the paragraph's text column.
  const columnCentreTwips = marginLeft + (pageWidth - marginLeft - marginRight - indRight) / 2;
  const posOffsetH = Math.round(columnCentreTwips * EMU_PER_TWIP - cx / 2);

  // Image bottom sits on the bottom of the name's text line; the rest reaches up.
  const posOffsetV = Math.round(lineHeightEmu - cy);

  // A floating drawing reserves no space, so the room it needs above the name
  // lives in its own empty, exact-height paragraph. The name's paragraph gets NO
  // space-before: Word measures a "line"-relative offset from before that spacing,
  // which pushed the signature up into the table.
  const aboveTwips = Math.max(0, Math.round((cy - lineHeightEmu) / EMU_PER_TWIP)) + SPACE_GAP_TWIPS;
  const spacer = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${aboveTwips}" w:lineRule="exact"/></w:pPr></w:p>`;

  const anchor =
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${posOffsetH}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="line"><wp:posOffset>${posOffsetV}</wp:posOffset></wp:positionV>` +
    extent +
    `<wp:wrapNone/>` +
    docPr[0] +
    (cNvFrame ? cNvFrame[0] : "") +
    graphic +
    `</wp:anchor>`;

  const withAnchor = xml.slice(0, drawStart) + anchor + xml.slice(drawStart + inline.length);
  // paraStart is before the drawing, so inserting here doesn't shift it.
  return paraStart === -1
    ? withAnchor
    : withAnchor.slice(0, paraStart) + spacer + withAnchor.slice(paraStart);
}

/**
 * Add space above a paragraph, keeping whatever spacing it already declares.
 * Falls back to inserting `<w:spacing>` straight after `<w:pPr>`.
 */
function withSpaceBefore(para: string, twips: number): string {
  const existing = para.match(/<w:spacing\b[^>]*\/>/);
  if (existing) {
    // Rebuild so the old attributes (notably `w:after`) survive.
    const carried = existing[0]
      .replace(/^<w:spacing\b/, "")
      .replace(/\/>$/, "")
      .replace(/\s*w:before="[^"]*"/, "");
    return para.replace(existing[0], `<w:spacing w:before="${twips}"${carried}/>`);
  }
  if (para.includes("<w:pPr>")) {
    return para.replace("<w:pPr>", `<w:pPr><w:spacing w:before="${twips}"/>`);
  }
  return para.replace(/<w:p\b([^>]*)>/, `<w:p$1><w:pPr><w:spacing w:before="${twips}"/></w:pPr>`);
}

export async function downloadDtrWord({
  // `template` (title / column names / labels) lives in the tokenized template
  // itself, so the export doesn't reference it — but it's kept in the signature
  // so callers don't have to change.
  template: _template,
  header,
  days,
  entryFor,
  fileName,
}: {
  template: DtrTemplate;
  header: DtrHeader;
  days: number[];
  entryFor: (day: number) => DtrEntry;
  fileName: string;
}) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Could not load the Word template.");
  const content = await res.arrayBuffer();

  // Saved signatures are opaque scans, so the paper has to come off before the
  // image can sit over the printed name — Word has no multiply blend to hide it.
  const rawSig = header.employee_signature ?? "";
  const sigB64 = rawSig ? toBase64(await signatureWithoutPaper(rawSig)) : "";
  // When there's no signature the image module still expects valid bytes and a
  // positive size — handing it an empty string throws "image not found". A
  // 1×1 transparent PNG occupies no visible space and keeps the printed-name
  // line landing directly on the signature rule below.
  const TRANSPARENT_PX =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const sigSize: [number, number] = sigB64 ? fitSignature(await naturalSize(rawSig)) : [1, 1];

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

  doc.render({
    emp_no: header.emp_no ?? "",
    name: header.name ?? "",
    designation: header.designation ?? "",
    area: header.area ?? "",
    month: formatPeriodDateRange(header.period, header.month, header.year),
    year: String(header.year ?? ""),
    // One entry per day — the template repeats its value row over this list.
    entries: days.length
      ? days.map((d) => {
          const e = entryFor(d);
          return {
            date: formatShortDate(d, header.month, header.year),
            time_in: e.time_in ?? "",
            time_out: e.time_out ?? "",
            schedule: e.schedule ?? "",
            remarks: e.remarks ?? "",
          };
        })
      : [{ date: "", time_in: "", time_out: "", schedule: "", remarks: "" }],
    employee_signature: sigB64,
    certified_by: header.certified_by ?? "",
  });

  // Convert the inline signature to a floating overlay so it sits on top of the
  // printed name. Skipped when there is no signature: the placeholder is a 1×1
  // transparent pixel, and floating it would leave an invisible object anchored
  // over the name for no benefit.
  if (sigB64) {
    const zip = doc.getZip();
    const renderedXml = zip.file("word/document.xml")!.asText();
    zip.file("word/document.xml", overlaySignature(renderedXml, templateLineHeightEmu(zip)));
  }

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
