/**
 * Preparing a picked attachment before it is sent to the server.
 *
 * A phone photo of a slip is 3–6 MB and 4000 px wide, which is far more than a
 * thumbnail or a printed page ever needs. Sent as-is it takes seconds on a
 * mobile connection, and one ordinary form can only hold a few of them. So a
 * big picture is decoded, scaled down to a sane longest edge and re-encoded
 * before upload; everything else (PDF, Office documents, small pictures) is
 * passed through untouched, byte for byte.
 *
 * The server still checks the real type from the file's first bytes, so a
 * re-encoded picture is judged exactly like any other upload.
 */

/** Same ceiling as the server (`ATTACHMENT_MAX_BYTES`). */
export const MAX_ATTACHMENT_MB = 10;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/**
 * What the picker offers — mirrors the server's accepted list. `accept` is only
 * a hint for the file dialog; the upload itself is checked again on both sides.
 */
export const ATTACHMENT_ACCEPT =
  "application/pdf,image/png,image/jpeg,image/gif,image/webp,image/bmp," +
  ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";

/**
 * The type gate used before a file is queued for upload: PDF, pictures, plain
 * text and Office documents, matching the accepted list above. A file whose
 * type the browser knows is judged by it; Windows often leaves the type empty,
 * so the extension is the fallback. The server still checks the real bytes —
 * this is the first pass, not the last word.
 */
export function isAcceptedAttachment(file: File): boolean {
  if (file.type) {
    return (
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      file.type === "text/plain" ||
      /officedocument|msword|ms-excel|ms-powerpoint/.test(file.type)
    );
  }
  // Empty MIME type (common on Windows): fall back to the extension.
  return /\.(pdf|png|jpe?g|gif|webp|bmp|txt|docx?|xlsx?|pptx?)$/i.test(file.name);
}

/** Pictures smaller than this are already cheap to upload — leave them alone. */
const SHRINK_UNDER_BYTES = 400 * 1024;

/** Longest edge kept after re-encoding: still sharp printed at A4 width. */
const IMAGE_MAX_EDGE = 2200;

/** Re-encode quality — high enough that small print stays readable. */
const IMAGE_QUALITY = 0.9;

/** Types we can decode and draw onto a canvas. */
const SHRINKABLE_MIME = /^image\/(jpeg|png|webp|bmp)$/i;
const SHRINKABLE_EXT = /\.(jpe?g|png|webp|bmp)$/i;

const extensionOf = (name: string): string => name.split(".").pop()?.toLowerCase() ?? "";

const baseName = (name: string): string => name.replace(/\.[^.]+$/, "") || "attachment";

function isShrinkable(file: File): boolean {
  if (SHRINKABLE_MIME.test(file.type)) return true;
  // Windows sometimes reports an empty type; the extension is the fallback.
  return !file.type && SHRINKABLE_EXT.test(file.name);
}

/** Decode a file into something drawable, or null when the browser can't. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> path (older Safari, odd encodings).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    return loaded?.naturalWidth ? loaded : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sizeOf(source: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return source instanceof HTMLImageElement
    ? { w: source.naturalWidth, h: source.naturalHeight }
    : { w: source.width, h: source.height };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Hand back the file that should actually be uploaded.
 *
 * A large picture is scaled so its longest edge is `IMAGE_MAX_EDGE` and encoded
 * as WebP (JPEG when the browser can't produce WebP). If that does not make it
 * smaller — a flat screenshot can re-encode bigger — the original wins. Any
 * failure returns the original too: a broken canvas must never cost the user
 * their attachment.
 */
export async function prepareAttachment(file: File): Promise<File> {
  if (!isShrinkable(file) || file.size <= SHRINK_UNDER_BYTES) return file;
  if (typeof document === "undefined") return file;

  let source: ImageBitmap | HTMLImageElement | null = null;
  try {
    source = await decode(file);
    if (!source) return file;
    const { w, h } = sizeOf(source);
    if (!w || !h) return file;

    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // A JPEG has no alpha, so a transparent PNG would otherwise come out with
    // black where it was see-through. White is what a document's paper is.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source as CanvasImageSource, 0, 0, outW, outH);

    // WebP first (smallest at this quality); JPEG is the universal fallback.
    let blob = await canvasToBlob(canvas, "image/webp", IMAGE_QUALITY);
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_QUALITY);
      ext = "jpg";
    }
    // No gain, no change: upload the original bytes.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${baseName(file.name)}.${ext}`, {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    if (source instanceof ImageBitmap) source.close();
  }
}

/** "2.4 MB" / "840 KB" — short enough for a row of a list. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
