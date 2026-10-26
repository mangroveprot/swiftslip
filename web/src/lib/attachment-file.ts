/**
 * Shared helpers for the uploaded attachment files (the OB / LOA / COS approval
 * slip, the DTR's supporting document, and the LOA's extra files).
 */

/** What Chromium and friends can show inline — and therefore what can print. */
export const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const PDF_RE = /\.pdf$/i;

/** Whether the browser can render this file inline, i.e. whether it can print. */
export function isPrintableFile(name: string): boolean {
  return IMAGE_RE.test(name) || PDF_RE.test(name);
}

/**
 * Download a file from its signed URL.
 *
 * A bare `<a download>` is not enough: these links point at Supabase storage, so
 * `download` is ignored cross-origin and the browser navigates to the file
 * instead of saving it. Fetching the bytes first and saving the blob works
 * regardless of origin.
 */
export async function downloadFromUrl(url: string, fileName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not download that file.");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
