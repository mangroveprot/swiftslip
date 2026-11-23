import type { PhotoCrop } from "@swiftslip/shared/types";

/**
 * The profile photo, decoded, framed and exported in the browser.
 *
 * A still image is stored as one 256 × 256 square (the sentence under the
 * cropper says so). The circle the user drags inside is only how it is
 * DISPLAYED: the square is kept whole so the same file can be shown as a
 * circle in the sidebar, a rounded square on a printed form, or a 32 px tile
 * in an admin list without re-cropping.
 *
 * An animated GIF cannot be treated that way: painting it onto a canvas keeps
 * a single frame, so the file is stored exactly as the user picked it and the
 * framing is sent alongside it as three numbers (`PhotoCrop`). `cropStyle`
 * turns those numbers into the same crop for an `<img>`, which is what the
 * cropper previews and what every avatar renders.
 *
 * Preview and export share `drawPhoto`, so for a still what the cropper shows
 * is exactly what gets saved, the only difference is the canvas size; for a
 * GIF the preview and the avatar share `cropStyle` instead.
 */

/** The stored square. */
export const PHOTO_SIZE = 256;

/** How wide the crop circle is drawn, in CSS px. */
export const PHOTO_VIEWPORT = 240;

/** How far the user may zoom past "fills the circle". */
export const PHOTO_MAX_ZOOM = 3;

/**
 * What the menu under the avatar promises. The picker's `accept` narrows the
 * OS dialog, and the size check catches the rest, a 40 MP phone photo is
 * 12 MB and there is no reason to decode it just to throw it away.
 *
 * Five megabytes: an animated GIF is uploaded as-is, so this is both the
 * picked-file limit and the wire size of the largest thing that reaches the
 * API. It is a copy of `PROFILE_PHOTO_MAX_BYTES` in `shared/src/schemas.ts`
 * (the constant is kept out of this module so the shell's avatar does not pull
 * the schemas into the initial bundle); `photo.test.ts` fails if the two
 * disagree.
 */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const MAX_PHOTO_MB = 5;
export const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024;

/**
 * WebP first: a 256 px photo lands around 15 KB. Browsers that cannot encode
 * WebP silently hand back a PNG data URL instead, which is still correct,
 * just bigger, so the type is never checked, only requested.
 */
const PHOTO_TYPE = "image/webp";
const PHOTO_QUALITY = 0.9;

export type PhotoSource = {
  image: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
};

export type PhotoOffset = { x: number; y: number };

/** No zoom, no pan: the picture centred and filling the circle. */
export const IDENTITY_CROP: PhotoCrop = { zoom: 1, x: 0, y: 0 };

/**
 * The cropper's preview-space framing, as the size-independent numbers stored
 * on the profile. `viewport` cancels out, which is the whole point: a pan of 24
 * px in a 240 px circle is the same crop as 9.6 px in the 96 px card.
 */
export function toCrop(viewport: number, zoom: number, offset: PhotoOffset): PhotoCrop {
  return { zoom, x: offset.x / viewport, y: offset.y / viewport };
}

/**
 * The same framing for an `<img>` that fills a circle. `object-cover` is the
 * zoom-1 baseline, and the offsets are fractions of the element's own size, so
 * this reads identically at 20 px and at 240 px. `translate` before `scale`
 * is intentional: CSS applies the right-most function first, so the pan is in
 * unscaled units, matching the cropper's model.
 */
export function cropStyle(crop: PhotoCrop | undefined): { transform: string } | undefined {
  if (!crop) return undefined;
  if (crop.zoom === 1 && crop.x === 0 && crop.y === 0) return undefined;
  return {
    transform: `translate(${crop.x * 100}%, ${crop.y * 100}%) scale(${crop.zoom})`,
  };
}

/** Decode a picked file, or null when the browser cannot read it. */
export async function readPhotoFile(file: File): Promise<PhotoSource | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { image: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through to the <img> path (older Safari, odd encodings).
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
    if (!loaded?.naturalWidth) return null;
    return { image: loaded, width: loaded.naturalWidth, height: loaded.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * True for a GIF, whose frames must never go through `drawPhoto`: one frame on
 * a canvas would be a still. The file is uploaded as picked and the cropper
 * only records where to look (`toCrop`), so it keeps moving everywhere.
 */
export function isAnimatedGif(file: File): boolean {
  return file.type === "image/gif";
}

/** A picked file as the `data:` URL the photo endpoint expects. */
export function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("That file couldn't be read as an image."));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("That file couldn't be read as an image."));
    reader.readAsDataURL(file);
  });
}

/**
 * The scale at which the picture exactly covers the circle, the `zoom = 1`
 * baseline. Using `max` (not `min`) is what guarantees there is never a gap:
 * the short side fills the circle and the long side overhangs, which the drag
 * then decides which part of.
 */
export function coverScale(source: PhotoSource, viewport: number): number {
  return Math.max(viewport / source.width, viewport / source.height);
}

/**
 * Keep the picture covering the circle. At zoom 1 the overhang on one axis is
 * zero, so that axis cannot move at all, which is why a landscape photo only
 * slides horizontally until the user zooms in.
 */
export function clampOffset(
  source: PhotoSource,
  viewport: number,
  zoom: number,
  offset: PhotoOffset,
): PhotoOffset {
  const scale = coverScale(source, viewport) * zoom;
  const maxX = Math.max(0, (source.width * scale - viewport) / 2);
  const maxY = Math.max(0, (source.height * scale - viewport) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/**
 * Paint the framed photo onto `ctx`, whose canvas is `output` px square.
 * `viewport` is in preview px, so the same call renders both the 240 px
 * preview and the 256 px export with identical framing.
 */
export function drawPhoto(
  ctx: CanvasRenderingContext2D,
  source: PhotoSource,
  viewport: number,
  zoom: number,
  offset: PhotoOffset,
  output: number,
): void {
  const scale = coverScale(source, viewport) * zoom;
  // Preview px → output px. At 240 → 256 this is a hair over 1.
  const ratio = output / viewport;
  const width = source.width * scale * ratio;
  const height = source.height * scale * ratio;

  ctx.clearRect(0, 0, output, output);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source.image,
    (output - width) / 2 + offset.x * ratio,
    (output - height) / 2 + offset.y * ratio,
    width,
    height,
  );
}

/**
 * The framed photo as a data URL, ready to PUT with the rest of the profile.
 * Throws only when the canvas itself is unavailable, the caller shows that as
 * "couldn't prepare that photo" and leaves the current one alone.
 */
export function exportPhoto(
  source: PhotoSource,
  viewport: number,
  zoom: number,
  offset: PhotoOffset,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare images.");

  drawPhoto(ctx, source, viewport, zoom, offset, PHOTO_SIZE);
  return canvas.toDataURL(PHOTO_TYPE, PHOTO_QUALITY);
}

/** "Gerald Vilaver" → "GV", the fallback when there is no photo. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}
