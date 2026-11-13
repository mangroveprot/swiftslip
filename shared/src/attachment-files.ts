/**
 * Where an attachment's small preview lives.
 *
 * Every attachment is stored once and never rewritten, so the preview is kept
 * beside the original under a key derived from it instead of in a second
 * database column:
 *
 *   FormAttachement/<uid>/<uuid>.jpg  ->  FormAttachement/<uid>/<uuid>.thumb.webp
 *
 * The API writes it at upload time and the web app asks for it by the same
 * rule, which is why this lives here rather than on either side. Only pictures
 * get one; a PDF or an Office file has no preview.
 *
 * Previews are always WebP. The browser produces them, and a browser that
 * cannot encode WebP simply sends none, so the extension never varies.
 */

/** `THUMB_SUFFIX` replaces the original extension rather than being appended. */
export const THUMB_SUFFIX = ".thumb.webp";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

/** The lowercase extension of a stored path, or `''` when it has none. */
export function attachmentExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** True for the picture types that get a preview. PDF and Office return false. */
export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(attachmentExtension(path));
}

/**
 * The preview's key: same folder, same UUID, `.thumb.webp` instead of the
 * original extension. A path with no extension just gets the suffix appended.
 */
export function thumbPathOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  return dot > slash ? `${path.slice(0, dot)}${THUMB_SUFFIX}` : `${path}${THUMB_SUFFIX}`;
}
