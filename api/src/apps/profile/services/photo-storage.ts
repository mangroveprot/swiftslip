import { PROFILE_PHOTO_MAX_BYTES } from '@swiftslip/shared/schemas';

import { ErrorResponse } from '../../../common/shared';
import FileStorageService from '../../storage/services/file-storage.service';

/**
 * Profile photos in object storage.
 *
 * They live in the SAME private bucket as the form attachments (one bucket,
 * one set of credentials, one cleanup story) but under their own root, so the
 * bucket reads as a filing cabinet rather than one flat pile:
 *
 *   swiftslip/
 *     FormAttachement/<user id>/<uuid>.<ext>   form attachments
 *     ProfilePhoto/<user id>.<ext>             one picture per person,
 *                                              WebP or the GIF as uploaded
 *
 * Routed through `FileStorageService` so the storage layer is a single
 * gateway, but the backend is hard-coded to 'supabase', a profile picture is
 * a few kilobytes that every screen needs and should never end up on B2.
 *
 * The database stores the object PATH, never a URL. Signed links expire, so a
 * stored URL would rot; `photoUrl()` mints a fresh one when the link it last
 * handed out is about to expire.
 */

/** Folder inside the bucket. Change this and existing rows must be migrated. */
export const PROFILE_PHOTO_ROOT = 'ProfilePhoto';

/**
 * The ceiling itself lives in `shared/src/schemas.ts`, next to the zod cap that
 * measures the same limit as a string, so the API, the browser check and the
 * schema cannot drift apart. A still from the cropper is ~15 KB; an animated
 * GIF is stored exactly as picked and is what this number really guards.
 */

/** Only the types the upload menu promises. */
const DATA_URL =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * A stored value is a path unless it predates this change, rows written while
 * the photo lived in the column hold a `data:` URL, and a hand-fixed row could
 * hold a full link. Those are returned untouched so no one's face disappears.
 */
function isPath(stored: string): boolean {
  return (
    Boolean(stored) && !stored.startsWith('data:') && !stored.startsWith('http')
  );
}

/**
 * Signed URLs are minted for an hour (`URL_TTL_SECONDS` in the attachments
 * storage repo), and the browser treats a new token as a new image. Re-signing
 * on every read therefore re-downloads the same face every few minutes — cheap
 * for a 15 KB WebP, expensive for an animated GIF that shows on every page.
 * Holding one link for 50 minutes lets the browser's own cache do the work,
 * and `storePhoto` / `removePhoto` drop the entry so a replacement is never
 * served from the old link.
 */
const SIGNED_URL_TTL_MS = 50 * 60 * 1000;
const signedUrls = new Map<string, { url: string; expiresAt: number }>();

async function signedUrlFor(path: string): Promise<string> {
  const now = Date.now();
  const cached = signedUrls.get(path);
  if (cached && cached.expiresAt > now) return cached.url;

  const url = (await FileStorageService.signedUrl(path, 'supabase')) ?? '';
  if (!url) return '';

  // A long-lived process would otherwise keep an entry per path it ever read.
  if (signedUrls.size > 500) {
    for (const [key, value] of signedUrls) {
      if (value.expiresAt <= now) signedUrls.delete(key);
    }
  }
  signedUrls.set(path, { url, expiresAt: now + SIGNED_URL_TTL_MS });
  return url;
}

/** The object path → a signed URL an `<img>` can load. Empty stays empty. */
export async function photoUrl(stored: string): Promise<string> {
  if (!stored) return '';
  if (!isPath(stored)) return stored;
  return signedUrlFor(stored);
}

/**
 * Store a picked photo and return the path to save on the row.
 *
 * A still arrives as the cropper's 256 px WebP; a GIF arrives as the file the
 * user picked (the cropper would flatten it) and is written byte-for-byte. The
 * object is named after the account, so replacing a photo overwrites in place
 * when the format is unchanged; when the extension moves (png → gif) the old
 * object is removed by `removePhoto`.
 */
export async function storePhoto(
  userId: string,
  dataUrl: string,
): Promise<string> {
  const match = DATA_URL.exec(dataUrl);
  if (!match) {
    throw new ErrorResponse(
      'VALIDATION_ERROR',
      'That photo could not be read. Pick a JPG, PNG, GIF or WebP image.',
    );
  }

  const contentType = (match[1] ?? '').toLowerCase();
  const base64 = match[2] ?? '';
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.byteLength > PROFILE_PHOTO_MAX_BYTES) {
    throw new ErrorResponse('PAYLOAD_TOO_LARGE', 'That photo is too large.');
  }

  const extension = EXTENSIONS[contentType] ?? 'webp';
  const path = `${PROFILE_PHOTO_ROOT}/${userId}.${extension}`;

  await FileStorageService.upload(path, buffer, contentType, 'supabase');
  // The same path now holds new bytes: drop the old link so the next read
  // mints a different one and the browser fetches the new photo.
  signedUrls.delete(path);
  return path;
}

/** Best effort: a photo that is already gone is not an error. */
export async function removePhoto(stored: string): Promise<void> {
  if (!isPath(stored)) return;
  signedUrls.delete(stored);
  await FileStorageService.removeRefQuietly({
    key: stored,
    backend: 'supabase',
  });
}

/** True when a stored value points at an object (rather than inline bytes). */
export function isStoredPath(stored: string): boolean {
  return isPath(stored);
}
