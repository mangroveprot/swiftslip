import { randomUUID } from 'crypto';

/**
 * The extension stored with a confirmed MIME type. The upload checker has
 * already matched the bytes to one of these types, so the map can't be fooled
 * by a misleading client filename.
 */
const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
};

/**
 * Root for files owned by the RGC inventory app (showroom photos).
 *
 * They share the bucket and the admin's storage rule, but the *references*
 * live in the RGC Postgres database, not in SwiftSlip's tables. The orphan
 * scan therefore treats this whole prefix as foreign: never counted as an
 * orphan and never deleted by SwiftSlip's cleanup (the inventory module
 * removes its own objects when a photo or showroom goes).
 */
export const INVENTORY_MEDIA_ROOT = 'InventoryMedia';

/**
 * A fresh bucket-root key: `{uuid}.{ext}` (STORAGE_GUIDE.md §4). The client's
 * filename never becomes the key, the database row keeps it as
 * `original_name`, for display only.
 */
export function storageKey(contentType: string, originalName: string): string {
  const fromName = (originalName.split('.').pop() ?? '').toLowerCase();
  const extension =
    EXTENSIONS[contentType] ??
    (/^[a-z0-9]{1,8}$/.test(fromName) ? fromName : 'bin');
  return `${randomUUID()}.${extension}`;
}

/**
 * Same rule as `storageKey`, but with a prefix (e.g.
 * `FormAttachement/<uid>/`). The prefix is the caller's responsibility; the
 * filename is always a server-generated UUID.
 */
export function prefixedStorageKey(
  prefix: string,
  contentType: string,
  originalName: string,
): string {
  const key = storageKey(contentType, originalName);
  return prefix.endsWith('/') ? `${prefix}${key}` : `${prefix}/${key}`;
}
