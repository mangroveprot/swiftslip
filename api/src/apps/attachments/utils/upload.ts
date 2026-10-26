import { ErrorResponse } from '../../../common/shared';

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Accepted uploads. The browser-declared MIME type is only a claim, so every
 * entry also checks the file's first bytes: nothing is stored as a PDF unless
 * it actually starts with `%PDF-`. The list is deliberately narrow — HTML, SVG,
 * scripts and archives are refused because a signed URL would serve them.
 */
function startsWith(
  bytes: Uint8Array,
  signature: number[],
  offset = 0,
): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

/** ZIP container shared by the Open XML formats (.docx / .xlsx / .pptx). */
const ZIP = [0x50, 0x4b, 0x03, 0x04];
/** Legacy Office compound-file header (.doc / .xls / .ppt). */
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const WORD_XML =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SHEET_XML =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SLIDES_XML =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const ALLOWED_TYPES: Record<string, (bytes: Uint8Array) => boolean> = {
  'application/pdf': (bytes) => startsWith(bytes, ascii('%PDF-')),
  'image/png': (bytes) =>
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  'image/gif': (bytes) => startsWith(bytes, ascii('GIF8')),
  'image/webp': (bytes) =>
    startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8),
  'image/bmp': (bytes) => startsWith(bytes, ascii('BM')),
  'text/plain': (bytes) => !bytes.includes(0),
  [WORD_XML]: (bytes) => startsWith(bytes, ZIP),
  [SHEET_XML]: (bytes) => startsWith(bytes, ZIP),
  [SLIDES_XML]: (bytes) => startsWith(bytes, ZIP),
  'application/msword': (bytes) => startsWith(bytes, OLE),
  'application/vnd.ms-excel': (bytes) => startsWith(bytes, OLE),
  'application/vnd.ms-powerpoint': (bytes) => startsWith(bytes, OLE),
};

/** Extension → type, used when the browser reports an empty MIME type. */
const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: WORD_XML,
  xls: 'application/vnd.ms-excel',
  xlsx: SHEET_XML,
  ppt: 'application/vnd.ms-powerpoint',
  pptx: SLIDES_XML,
};

const extensionOf = (filename: string): string =>
  filename.split('.').pop()?.toLowerCase() ?? '';

/** The declared type, or the extension when the browser sent nothing useful. */
function uploadType(declared: string, filename: string): string {
  const type = (declared.split(';')[0] ?? '').trim().toLowerCase();
  if (type && type !== 'application/octet-stream') return type;
  return EXTENSION_TYPES[extensionOf(filename)] ?? '';
}

/**
 * Types to try, declared type first. Windows sometimes reports an Office file
 * as `application/msword` even when the bytes are a `.docx` ZIP, so the
 * extension is kept as a second opinion — the signature still has to agree
 * with whichever type is finally stored.
 */
function candidateTypes(declared: string, filename: string): string[] {
  const candidates = [uploadType(declared, filename)];
  const fallback = EXTENSION_TYPES[extensionOf(filename)] ?? '';
  if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
  return candidates.filter((type) => type !== '' && ALLOWED_TYPES[type]);
}

/**
 * Never trust the client's filename: drop any path components, keep a readable
 * subset of characters and cap the length so it can't escape the folder.
 */
export function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKC')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 80);
  return cleaned || 'attachment';
}

/**
 * Decode and validate one upload. Returns the bytes plus the confirmed type
 * and filename; throws an ErrorResponse with a user-facing message on anything
 * not accepted.
 */
export function readUpload(input: {
  filename: string;
  contentType: string;
  base64: string;
}) {
  const candidates = candidateTypes(input.contentType, input.filename);
  if (candidates.length === 0) {
    throw new ErrorResponse(
      'UNSUPPORTED_MEDIA_TYPE',
      "That file type can't be stored here. Attach a PDF, image or Office document.",
    );
  }

  const buffer = Buffer.from(input.base64, 'base64');
  if (!buffer.byteLength) {
    throw new ErrorResponse(
      'BAD_REQUEST',
      'That file is empty or could not be read.',
    );
  }
  if (buffer.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new ErrorResponse(
      'PAYLOAD_TOO_LARGE',
      'Attachments must be 10 MB or smaller.',
    );
  }

  const bytes = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const contentType = candidates.find((type) => ALLOWED_TYPES[type]?.(bytes));
  if (!contentType) {
    throw new ErrorResponse(
      'UNSUPPORTED_MEDIA_TYPE',
      "That file's contents don't match its type. Please pick the original file.",
    );
  }

  return { buffer, contentType, name: safeFilename(input.filename) };
}
