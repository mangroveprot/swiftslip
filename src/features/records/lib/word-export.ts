import { APP } from "@/config/app";
import { formatPeriodDateRange, formatShortDate } from "@/shared/period";
import type { DtrEntry, DtrHeader, DtrTemplate } from "@/shared/types";

const HEADER_FILL = "#bfbfbf";
const INK = "#1a1a1a";
const BORDER = `0.75pt solid ${INK}`;

function esc(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(content: string, extra = "", attrs = "") {
  return `<td ${attrs} style="border:${BORDER};padding:2pt 4pt;vertical-align:middle;${extra}">${content || "&nbsp;"}</td>`;
}

function th(content: string, extra = "", attrs = "") {
  return `<th ${attrs} bgcolor="${HEADER_FILL}" style="border:${BORDER};padding:4pt 3pt;background:${HEADER_FILL};font-weight:700;${extra}">${esc(content)}</th>`;
}

const spacer = (pt = 8) =>
  `<p style="margin:0;font-size:${pt}pt;line-height:${pt}pt;mso-line-height-rule:exactly;">&nbsp;</p>`;

async function toDataUrl(src: string): Promise<string> {
  if (!src) return "";
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return "";
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    if (!src) return resolve({ w: 0, h: 0 });
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
  });
}

// Word only respects width/height ATTRIBUTES, so compute exact pixel sizes.
function fit(size: { w: number; h: number }, maxW: number, maxH: number) {
  if (!size.w || !size.h) return { w: maxW, h: maxH };
  const scale = Math.min(maxW / size.w, maxH / size.h);
  return { w: Math.round(size.w * scale), h: Math.round(size.h * scale) };
}

export async function downloadDtrWord({
  template,
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
  const previewLogo = document.querySelector<HTMLImageElement>("#dtr-sheet img[src]")?.src ?? "";
  const logoCandidates = [previewLogo, APP.logoPath];

  let logoSrc = "";
  for (const candidate of logoCandidates) {
    logoSrc = await toDataUrl(candidate);
    if (logoSrc) break;
  }
  const signatureSrc = await toDataUrl(header.employee_signature);

  const [logoNat, sigNat] = await Promise.all([naturalSize(logoSrc), naturalSize(signatureSrc)]);
  const logoDim = fit(logoNat, 160, 42);
  const sigDim = fit(sigNat, 200, 50);

  const monthRange = formatPeriodDateRange(header.period, header.month, header.year);

  const headerRows = (
    [
      ["EMP NO.", header.emp_no],
      ["NAME", header.name],
      ["DESIGNATION", header.designation],
      ["AREA", header.area],
    ] as [string, string | undefined][]
  )
    .map(
      ([label, value]) =>
        `<tr>${cell(esc(label), "", 'width="28%"')}${cell(esc(value), "", 'width="72%"')}</tr>`,
    )
    .join("");

  const entryRows = days
    .map((day) => {
      const e = entryFor(day);
      return `<tr>
        ${cell(esc(formatShortDate(day, header.month, header.year)), "text-align:center;", 'width="12%"')}
        ${cell(esc(e.time_in), "text-align:center;", 'width="14%"')}
        ${cell(esc(e.time_out), "text-align:center;", 'width="14%"')}
        ${cell(esc(e.schedule), "text-align:center;", 'width="30%"')}
        ${cell(esc(e.remarks), "text-align:center;", 'width="30%"')}
      </tr>`;
    })
    .join("");

  const logoHtml = logoSrc
    ? `<p style="margin:0;"><img src="${logoSrc}" width="${logoDim.w}" height="${logoDim.h}" alt="" /></p>`
    : template.org_name
      ? `<p style="margin:0;font-size:11pt;font-weight:700;">${esc(template.org_name)}</p>`
      : "";

  const signatureHtml = signatureSrc
    ? `<p style="margin:0;text-align:center;"><img src="${signatureSrc}" width="${sigDim.w}" height="${sigDim.h}" alt="" /></p>`
    : spacer(24);

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page WordSection1 { size: 210mm 297mm; margin: 14mm 14mm 14mm 14mm; mso-page-orientation: portrait; }
  div.WordSection1 { page: WordSection1; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: ${INK}; }
  p { margin: 0; }
  table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; table-layout: fixed; }
  td, th { font-size: 8pt; font-family: Arial, Helvetica, sans-serif; }
</style>
</head>
<body>
<div class="WordSection1">
  ${logoHtml}
  ${spacer(6)}

  <table width="100%" style="width:100%;">
    <tr>
      <td bgcolor="${HEADER_FILL}" style="border:${BORDER};background:${HEADER_FILL};text-align:center;font-size:9pt;font-weight:700;padding:4pt;">
        ${esc(template.title)}
      </td>
    </tr>
  </table>
  ${spacer(6)}

  <table width="50%" style="width:50%;">
    <tbody>${headerRows}</tbody>
  </table>
  ${spacer(6)}

  <table width="100%" style="width:100%;">
    <colgroup>
      <col width="10%" /><col width="66%" /><col width="8%" /><col width="16%" />
    </colgroup>
    <tbody>
      <tr>
        ${cell("MONTH", "", 'width="10%"')}
        ${cell(esc(monthRange), "", 'width="66%"')}
        ${cell("YEAR", "text-align:center;", 'width="8%"')}
        ${cell(esc(String(header.year)), "text-align:center;", 'width="16%"')}
      </tr>
    </tbody>
  </table>
  ${spacer(6)}

  <table width="100%" style="width:100%;text-align:center;">
    <colgroup>
      <col width="12%" /><col width="14%" /><col width="14%" /><col width="30%" /><col width="30%" />
    </colgroup>
    <thead>
      <tr>
        ${th("DATE", "", 'width="12%"')}
        ${th(template.columns.in, "", 'width="14%"')}
        ${th(template.columns.out, "", 'width="14%"')}
        ${th(template.columns.schedule, "", 'width="30%"')}
        ${th(template.columns.remarks, "", 'width="30%"')}
      </tr>
    </thead>
    <tbody>
      ${entryRows}
    </tbody>
  </table>

  ${spacer(20)}

  ${signatureHtml}
  ${header.name ? `<p style="text-align:center;">${esc(header.name)}</p>` : ""}
  <table width="100%" style="width:100%;">
    <tr><td style="border:none;border-top:${BORDER};padding:3pt 0 0;text-align:center;">${esc(template.employee_signature_label)}</td></tr>
  </table>

  ${spacer(14)}

  <p>${esc(template.certified_by_label)}</p>
  ${spacer(20)}
  ${header.certified_by ? `<p style="text-align:center;">${esc(header.certified_by)}</p>` : ""}
  <table width="100%" style="width:100%;">
    <tr><td style="border:none;border-top:${BORDER};padding:3pt 0 0;">${esc(template.certifier_signature_label)}</td></tr>
  </table>
</div>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".doc") ? fileName : `${fileName}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}
