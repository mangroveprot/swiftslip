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

/**
 * Strip the paper out of a signature so it can be laid over other content.
 *
 * A saved signature is a scan: overwhelmingly opaque white with no alpha channel
 * at all (measured on a real one — 97% pure white, every pixel alpha 255). On
 * screen the preview hides that with `mix-blend-multiply`, which makes white
 * multiply away to nothing and leaves only the ink. A picture inside a Word
 * document has no blend mode, so the same image drops an opaque white box over
 * whatever it is placed on — in the DTR export that meant burying the printed
 * name under the signature.
 *
 * Turning luminance into alpha reproduces what multiply was doing: ink stays
 * opaque, paper disappears, and anti-aliased stroke edges keep their soft ramp.
 * The ink colour is left untouched, so a blue signature still comes out blue.
 */
export async function signatureWithoutPaper(dataUrl: string): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = dataUrl;
  });
  if (!img?.naturalWidth) return dataUrl;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      // Rec. 601 luma — the same weighting the eye uses, so pale strokes fade
      // out evenly rather than leaving a grey box.
      const luma = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      const opaque = Math.round(255 - luma);
      // Respect any alpha the scan already had (a cropped signature, say).
      data[i + 3] = Math.round((opaque * data[i + 3]!) / 255);
    }
    ctx.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    // A tainted canvas or an unexpected failure must not lose the signature —
    // the caller gets the original image instead.
    return dataUrl;
  }
}

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
