/**
 * Shared helpers for the employee signature image.
 *
 * Two jobs, both browser-only (`Image`, `atob`, `localStorage`) so they belong in
 * client code and not in `@/shared`:
 *
 *  1. measuring and sizing the signature for the Word exports — the Official
 *     Business and Leave of Absence forms fill the same kind of tokenized
 *     template and therefore share one maximum size;
 *  2. keeping a local backup of a signature mid-edit, so a failed save doesn't
 *     throw away what the user drew. Each form namespaces its own key.
 */

/** Signature image is rendered at most this big (pixels); aspect ratio preserved. */
const SIG_MAX_W = 150;
const SIG_MAX_H = 45;

/** Split a data URL / bare base64 into its raw base64 payload (no prefix). */
export function toBase64(src: string): string {
  if (!src) return "";
  const comma = src.indexOf(",");
  return src.startsWith("data:") && comma >= 0 ? src.slice(comma + 1) : src;
}

/** Raw bytes of a base64 payload, for docxtemplater's image module. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Natural pixel size of an image source, or null if it can't be measured. */
export function naturalSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Largest size that fits SIG_MAX_W × SIG_MAX_H, aspect ratio preserved. */
export function fitSignature(size: { w: number; h: number } | null): [number, number] {
  if (!size || !size.w || !size.h) return [SIG_MAX_W, SIG_MAX_H];
  const scale = Math.min(SIG_MAX_W / size.w, SIG_MAX_H / size.h);
  return [Math.round(size.w * scale), Math.round(size.h * scale)];
}

/**
 * Local backup of a signature that hasn't been saved yet. `prefix` ("dtr", "ob",
 * "loa") keeps each form's key separate, and an empty value reads back as "".
 */
export function readSignatureBackup(prefix: string, id: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${prefix}-sig:${id}`) ?? "";
}

/** Write the backup, or clear it once the signature is gone. */
export function saveSignatureBackup(prefix: string, id: string, value: string | undefined): void {
  if (typeof window === "undefined") return;
  const key = `${prefix}-sig:${id}`;
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}
