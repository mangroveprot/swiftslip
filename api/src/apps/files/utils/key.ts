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
 * A fresh bucket-root key: `{uuid}.{ext}` (STORAGE_GUIDE.md §4). The client's
 * filename never becomes the key — the database row keeps it as
 * `original_name`, for display only.
 */
export function storageKey(contentType: string, originalName: string): string {
  const fromName = (originalName.split('.').pop() ?? '').toLowerCase();
  const extension =
    EXTENSIONS[contentType] ??
    (/^[a-z0-9]{1,8}$/.test(fromName) ? fromName : 'bin');
  return `${randomUUID()}.${extension}`;
}
