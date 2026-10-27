/**
 * Shared helpers for the employee signature image.
 *
 * Two jobs, both browser-only (`Image`, `atob`, `localStorage`) so they belong in
 * client code and not in `@swiftslip/shared`:
 *
 *  1. measuring and sizing the signature for the Word exports — the Official
 *     Business and Leave of Absence forms fill the same kind of tokenized
 *     template and therefore share one maximum size; tidying a freshly drawn or
 *     uploaded signature into that same consistent shape;
 *  2. keeping a local backup of a signature mid-edit, so a failed save doesn't
 *     throw away what the user drew. Each form namespaces its own key.
 */

/** Signature image is rendered at most this big (pixels); aspect ratio preserved. */
const SIG_MAX_W = 150;
const SIG_MAX_H = 45;

/**
 * Box every stored signature is tidied into (pixels). Big enough to stay crisp at
 * the largest place a form shows one (the DTR's 68px line) on a 2× screen, small
 * enough that the stored base64 stays modest.
 */
const SIG_STORE_MAX_W = 480;
const SIG_STORE_MAX_H = 120;

/** Luma (0-255) at or above this counts as paper, not ink. */
const SIG_INK_LUMA = 200;

/** Never blow a small image up further than this — past it only blur grows. */
const SIG_MAX_UPSCALE = 2;

/**
 * Tidy a signature picture into a consistent shape.
 *
 * An upload arrives at whatever size the picture happened to be — a phone photo
 * is thousands of pixels wide, a cropped scan is tiny — and a drawn signature is
 * a wide canvas that is mostly empty paper. Dropped into a form unchanged, the
 * same signature looks huge on one record and nearly invisible on the next.
 *
 * So: find the ink (any pixel clearly darker than paper), crop to just around it,
 * then scale the crop into one standard box. The result is a signature that looks
 * the same size on every form, whatever was uploaded.
 *
 * Transparency is preserved, so a cut-out scan stays a cut-out. The paper itself
 * is left alone — the previews hide it with `mix-blend-multiply` and the Word
 * export strips it with `signatureWithoutPaper`.
 */
export async function normalizeSignature(dataUrl: string): Promise<string> {
  if (!dataUrl || typeof document === "undefined") return dataUrl;
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = dataUrl;
  });
  if (!img?.naturalWidth) return dataUrl;

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  try {
    const full = document.createElement("canvas");
    full.width = w;
    full.height = h;
    const ctx = full.getContext("2d", { willReadFrequently: true });
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Grow a box around every pixel that is ink: opaque enough to see, dark
    // enough not to be paper. Blue and red ink pass this too (both are dark by
    // luma), so a coloured signature keeps working.
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3]! <= 8) continue;
        const luma = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
        if (luma >= SIG_INK_LUMA) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    // Nothing dark anywhere: a blank sheet. Hand it back untouched rather than
    // crop to an empty rectangle.
    if (maxX < 0 || maxY < 0) return dataUrl;

    // A hair of breathing room so strokes never touch the edge of the picture.
    const pad = Math.max(1, Math.round(Math.max(maxX - minX, maxY - minY) * 0.02));
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    const right = Math.min(w - 1, maxX + pad);
    const bottom = Math.min(h - 1, maxY + pad);
    const cropW = right - left + 1;
    const cropH = bottom - top + 1;

    const scale = Math.min(SIG_STORE_MAX_W / cropW, SIG_STORE_MAX_H / cropH, SIG_MAX_UPSCALE);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cropW * scale));
    out.height = Math.max(1, Math.round(cropH * scale));
    const octx = out.getContext("2d");
    if (!octx) return dataUrl;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(img, left, top, cropW, cropH, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } catch {
    // A tainted canvas must never lose the user's signature.
    return dataUrl;
  }
}

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

/** Maximum age of a signature backup before it is treated as stale. */
const SIG_BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Largest backup payload we will try to store in localStorage. */
const SIG_BACKUP_MAX_CHARS = 1_500_000;

/** Target size for the backup image so it stays well under quota. */
const SIG_BACKUP_MAX_W = 320;
const SIG_BACKUP_MAX_H = 120;

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

export function backupKey(prefix: string, id: string): string {
  return `${prefix}-sig:${id}`;
}

/** Try to write a value to localStorage; return whether it succeeded. */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Try to remove a value from localStorage; ignore failures. */
export function safeRemoveItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore — the entry will age out eventually anyway.
  }
}

/** Try to read a value from localStorage; return null on failure. */
function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Reduce a signature data URL to a smaller JPEG so localStorage quota is not
 * exhausted. Falls back to the original if image processing fails.
 */
export async function compressSignatureBackup(dataUrl: string): Promise<string> {
  if (!dataUrl || typeof document === "undefined") return dataUrl;
  if (!dataUrl.startsWith("data:image")) return dataUrl;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = dataUrl;
  });
  if (!img?.naturalWidth) return dataUrl;

  try {
    const scale = Math.min(
      SIG_BACKUP_MAX_W / img.naturalWidth,
      SIG_BACKUP_MAX_H / img.naturalHeight,
      1,
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return dataUrl;
  }
}

type StoredBackup = { data: string; savedAt: number };

function isStoredBackup(value: unknown): value is StoredBackup {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof (value as StoredBackup).data === "string" &&
    "savedAt" in value &&
    typeof (value as StoredBackup).savedAt === "number"
  );
}

/**
 * Local backup of a signature that hasn't been saved yet. `prefix` ("dtr", "ob",
 * "loa") keeps each form's key separate, and an empty value reads back as "".
 *
 * Backups are stored as `{ data, savedAt }`. Old plain-string entries and corrupt
 * entries are tolerated and cleaned up.
 */
export function readSignatureBackup(prefix: string, id: string): string {
  const raw = safeGetItem(backupKey(prefix, id));
  if (!raw) return "";

  // Legacy plain-string backup.
  if (raw.startsWith("data:")) return raw;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredBackup(parsed)) return parsed.data;
  } catch {
    // Corrupt entry — drop it so it does not keep returning garbage.
  }
  safeRemoveItem(backupKey(prefix, id));
  return "";
}

/** Write the backup, or clear it once the signature is gone. */
export async function saveSignatureBackup(
  prefix: string,
  id: string,
  value: string | undefined,
): Promise<void> {
  if (typeof window === "undefined") return;
  const key = backupKey(prefix, id);

  if (!value) {
    safeRemoveItem(key);
    return;
  }

  const compressed = await compressSignatureBackup(value);
  const payload = JSON.stringify({ data: compressed, savedAt: Date.now() });

  // If the backup is still huge, prefer losing the backup to crashing the page.
  if (payload.length > SIG_BACKUP_MAX_CHARS) {
    console.warn(`Signature backup for ${prefix}:${id} is too large; skipping local backup.`);
    return;
  }

  if (safeSetItem(key, payload)) return;

  // Quota exceeded: free every signature backup (they are only unsaved-draft
  // fallbacks, and the profile copy can refill the field) and try once more.
  pruneSignatureBackups();
  if (safeSetItem(key, payload)) return;

  console.warn(`Unable to save signature backup for ${prefix}:${id}: storage quota exceeded.`);
}

/** Delete a single signature backup. */
export function deleteSignatureBackup(prefix: string, id: string): void {
  safeRemoveItem(backupKey(prefix, id));
}

/** Collect localStorage keys matching a signature-backup pattern. */
function signatureKeys(pattern: RegExp): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && pattern.test(key)) keys.push(key);
    }
  } catch {
    // Storage unreadable (private mode / blocked) — nothing to prune.
  }
  return keys;
}

/** Remove every signature backup for a given prefix, or all prefixes if omitted. */
export function pruneSignatureBackups(prefix?: string): void {
  if (typeof window === "undefined") return;
  const pattern = prefix ? new RegExp(`^${prefix}-sig:`) : /^(dtr|ob|loa|ot|cos)-sig:/;
  for (const key of signatureKeys(pattern)) safeRemoveItem(key);
}

/** Remove stale or corrupt signature backups across all prefixes. */
export function pruneExpiredBackups(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();

  for (const key of signatureKeys(/^(dtr|ob|loa|ot|cos)-sig:/)) {
    const raw = safeGetItem(key);
    if (!raw) continue;

    // Legacy plain strings are kept but re-checked; we can't age them, so we
    // leave them alone unless they are corrupt.
    if (raw.startsWith("data:")) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isStoredBackup(parsed) && now - parsed.savedAt < SIG_BACKUP_MAX_AGE_MS) continue;
    } catch {
      // Corrupt — drop below.
    }
    safeRemoveItem(key);
  }
}
