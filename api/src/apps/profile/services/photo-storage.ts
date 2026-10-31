import { ErrorResponse } from '../../../common/shared';
import { StorageRepository } from '../../attachments/repositories';

/**
 * Profile photos in object storage.
 *
 * They live in the SAME private bucket as the form attachments (one bucket,
 * one set of credentials, one cleanup story) but under their own root, so the
 * bucket reads as a filing cabinet rather than one flat pile:
 *
 *   swiftslip/
 *     FormAttachement/<user id>/<row id>-<file>   form attachments
 *     ProfilePhoto/<user id>.<ext>             one square per person
 *
 * Deliberately NOT routed through `FileStorageService`: that service applies
 * the admin's Supabase-vs-B2 rule, and a profile picture is a few kilobytes
 * that every screen needs — it should never end up on B2 and never need a
 * backend decision.
 *
 * The database stores the object PATH, never a URL. Signed links expire, so a
 * stored URL would rot; `photoUrl()` mints a fresh one on every read.
 */

/** Folder inside the bucket. Change this and existing rows must be migrated. */
export const PROFILE_PHOTO_ROOT = 'ProfilePhoto';

/**
 * The cropper exports a 256 × 256 WebP at ~15 KB. This ceiling is a guard
 * against a client that is not our cropper, not a target.
 */
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Only the three types the upload menu promises. */
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const storage = new StorageRepository();

/**
 * A stored value is a path unless it predates this change — rows written while
 * the photo lived in the column hold a `data:` URL, and a hand-fixed row could
 * hold a full link. Those are returned untouched so no one's face disappears.
 */
function isPath(stored: string): boolean {
  return Boolean(stored) && !stored.startsWith('data:') && !stored.startsWith('http');
}

/** The object path → a signed URL an `<img>` can load. Empty stays empty. */
export async function photoUrl(stored: string): Promise<string> {
  if (!stored) return '';
  if (!isPath(stored)) return stored;
  return (await storage.signedUrl(stored)) ?? '';
}

/**
 * Store a cropped photo and return the path to save on the row.
 *
 * The object is named after the account, so replacing a photo overwrites in
 * place when the format is unchanged; when the extension moves (png → webp)
 * the old object is removed by `removePhoto`.
 */
export async function storePhoto(userId: string, dataUrl: string): Promise<string> {
  const match = DATA_URL.exec(dataUrl);
  if (!match) {
    throw new ErrorResponse(
      'VALIDATION_ERROR',
      'That photo could not be read. Pick a JPG, PNG or WebP image.',
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

  await storage.ensureBucket();
  await storage.upload(path, buffer, contentType);
  return path;
}

/** Best effort: a photo that is already gone is not an error. */
export async function removePhoto(stored: string): Promise<void> {
  if (!isPath(stored)) return;
  await storage.removeQuietly([stored]);
}

/** True when a stored value points at an object (rather than inline bytes). */
export function isStoredPath(stored: string): boolean {
  return isPath(stored);
}
