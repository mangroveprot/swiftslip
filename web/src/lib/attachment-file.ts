/**
 * Shared helpers for the uploaded attachment files (the OB / LOA / COS approval
 * slip, the DTR's supporting document, and the LOA's extra files).
 */
import { apiStreamUrl } from "@/lib/api-client";

/** What Chromium and friends can show inline, and therefore what can print. */
export const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const PDF_RE = /\.pdf$/i;

/** Whether the browser can render this file inline, i.e. whether it can print. */
export function isPrintableFile(name: string): boolean {
  return IMAGE_RE.test(name) || PDF_RE.test(name);
}

/**
 * Turn a storage link into a same-origin one that `fetch` can actually read.
 *
 * A signed link is fine for `<img>` / `<iframe>`, the browser shows it without
 * needing CORS. Reading the *bytes* is different: Backblaze B2 presigned URLs
 * answer `Access-Control-Allow-Origin: null`, so `fetch()` is blocked (and in
 * production the CSP `connect-src` list does not include B2 either). The API
 * re-checks that the link is one of our own signed storage links, then relays
 * the bytes back from `/api/files/attachment`.
 */
export function attachmentBytesUrl(url: string): string {
  // Already same-origin, or an in-memory object/data URL, nothing to relay.
  if (/^(?:data|blob):/i.test(url) || url.startsWith("/")) return url;
  return apiStreamUrl(`/files/attachment?url=${encodeURIComponent(url)}`);
}

/**
 * Read an attachment's bytes through the same-origin relay.
 *
 * `credentials` is explicit because `VITE_API_URL` can point at a different
 * origin in production; the relay sits behind the same session-cookie auth as
 * the rest of the API, so dropping the cookie would turn every PDF export into
 * a 401.
 */
export function fetchAttachmentBytes(url: string): Promise<Response> {
  return fetch(attachmentBytesUrl(url), { credentials: "include" });
}

/**
 * Download a file from its signed URL.
 *
 * A bare `<a download>` is not enough: these links point at private storage, so
 * `download` is ignored cross-origin and the browser navigates to the file
 * instead of saving it. Fetching the bytes first and saving the blob works,
 * through our own origin, so no CORS header is required.
 */
export async function downloadFromUrl(url: string, fileName: string): Promise<void> {
  const res = await fetchAttachmentBytes(url);
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
