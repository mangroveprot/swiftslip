import { getDb } from "@/server/db/client.server";
import type { LoaOtherFile } from "@/shared/types";

const BUCKET = "swiftslip";
/** Every user's documents live in their own folder: ApprovalSlip/<their id>/. */
const ROOT = "ApprovalSlip";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Accepted uploads. The browser-declared MIME type is only a claim, so every
 * entry also checks the file's first bytes: nothing is stored as a PDF unless
 * it actually starts with `%PDF-`. The list is deliberately narrow — HTML, SVG,
 * scripts and archives are refused because a signed URL would serve them.
 */
function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

/** ZIP container shared by the Open XML formats (.docx / .xlsx / .pptx). */
const ZIP = [0x50, 0x4b, 0x03, 0x04];
/** Legacy Office compound-file header (.doc / .xls / .ppt). */
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const WORD_XML = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SHEET_XML = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SLIDES_XML = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const ALLOWED_TYPES: Record<string, (bytes: Uint8Array) => boolean> = {
  "application/pdf": (bytes) => startsWith(bytes, ascii("%PDF-")),
  "image/png": (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  "image/gif": (bytes) => startsWith(bytes, ascii("GIF8")),
  "image/webp": (bytes) => startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8),
  "image/bmp": (bytes) => startsWith(bytes, ascii("BM")),
  // Plain text has no signature; rejecting NUL bytes keeps obvious binaries out.
  "text/plain": (bytes) => !bytes.includes(0),
  [WORD_XML]: (bytes) => startsWith(bytes, ZIP),
  [SHEET_XML]: (bytes) => startsWith(bytes, ZIP),
  [SLIDES_XML]: (bytes) => startsWith(bytes, ZIP),
  "application/msword": (bytes) => startsWith(bytes, OLE),
  "application/vnd.ms-excel": (bytes) => startsWith(bytes, OLE),
  "application/vnd.ms-powerpoint": (bytes) => startsWith(bytes, OLE),
};

/** Extension → type, used when the browser reports an empty MIME type. */
const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  txt: "text/plain",
  doc: "application/msword",
  docx: WORD_XML,
  xls: "application/vnd.ms-excel",
  xlsx: SHEET_XML,
  ppt: "application/vnd.ms-powerpoint",
  pptx: SLIDES_XML,
};

/** The declared type, or the extension when the browser sent nothing useful. */
function uploadType(declared: string, filename: string): string {
  const type = (declared.split(";")[0] ?? "").trim().toLowerCase();
  if (type && type !== "application/octet-stream") return type;
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? "";
}

/**
 * Types to try, declared type first. Windows sometimes reports an Office file
 * as `application/msword` even when the bytes are a `.docx` ZIP, so the
 * extension is kept as a second opinion — the signature still has to agree
 * with whichever type is finally stored.
 */
function candidateTypes(declared: string, filename: string): string[] {
  const candidates = [uploadType(declared, filename)];
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const fallback = EXTENSION_TYPES[extension] ?? "";
  if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
  return candidates.filter((type) => type !== "" && ALLOWED_TYPES[type]);
}

/**
 * Decode and validate one upload. Returns the bytes plus the confirmed type
 * and filename; throws a user-facing message on anything not accepted.
 */
function readUpload(input: { filename: string; contentType: string; base64: string }) {
  const candidates = candidateTypes(input.contentType, input.filename);
  if (candidates.length === 0) {
    throw new Error("That file type can't be stored here. Attach a PDF, image or Office document.");
  }

  const buffer = Buffer.from(input.base64, "base64");
  if (!buffer.byteLength) throw new Error("That file is empty or could not be read.");
  if (buffer.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new Error("Attachments must be 10 MB or smaller.");
  }

  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const contentType = candidates.find((type) => ALLOWED_TYPES[type]?.(bytes));
  if (!contentType) {
    throw new Error("That file's contents don't match its type. Please pick the original file.");
  }

  return { buffer, contentType, name: safeFilename(input.filename) };
}

/** Signed download links live for an hour — long enough to view or re-download. */
const URL_TTL_SECONDS = 60 * 60;

/** Rows that can hold a document; `(id, owner_id)` always identifies one of them. */
type AttachmentTable = "ob_forms" | "loa_forms" | "cos_forms" | "ot_forms" | "dtr_records";
/** The row's human name, used in error messages ("Form not found." etc.). */
type Entity = "Form" | "LOA form" | "Record" | "Change of Schedule form" | "Overtime form";

/**
 * Rows that carry the extra `other_attachments` list — the "supporting
 * documents" card on LOA and OT. Narrower than `AttachmentTable` because DTR
 * records and OB forms have no such column.
 */
type OtherAttachmentTable = Extract<AttachmentTable, "loa_forms" | "ot_forms">;

/**
 * Never trust the client's filename: drop any path components, keep a readable
 * subset of characters and cap the length so it can't escape the folder.
 */
function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 80);
  return cleaned || "attachment";
}

/** Create the bucket on first upload — private, 10 MB, any MIME type. */
async function ensureBucket() {
  const db = getDb();
  const { error } = await db.storage.getBucket(BUCKET);
  if (!error) return;
  const { error: createError } = await db.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: ATTACHMENT_MAX_BYTES,
  });
  // Someone creating it at the same moment is fine — it's there either way.
  if (createError && !/exists|duplicate/i.test(createError.message)) {
    throw new Error(createError.message);
  }
}

/**
 * Store one of the user's documents at
 * `ApprovalSlip/<owner-id>/<row-id>-<filename>` and point the row at it.
 * A failed row update rolls the fresh upload back so no orphan file is left.
 */
export async function uploadAttachment(
  table: AttachmentTable,
  entity: Entity,
  input: { id: string; filename: string; contentType: string; base64: string },
  ownerId: string,
) {
  const db = getDb();
  const { data: row, error: rowError } = await db
    .from(table)
    .select("id,attachment_path")
    .eq("id", input.id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error(`${entity} not found.`);

  const { buffer, contentType, name } = readUpload(input);
  const path = `${ROOT}/${ownerId}/${row.id}-${name}`;

  await ensureBucket();
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: contentType || "application/octet-stream",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await db
    .from(table)
    .update({
      attachment_path: path,
      attachment_name: name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("owner_id", ownerId)
    .select("id");
  if (updateError) {
    // Roll the fresh upload back so a failed save can't leave an orphan file.
    if (row.attachment_path !== path) await db.storage.from(BUCKET).remove([path]);
    throw new Error(updateError.message);
  }

  // Same file, new content (replaced under the same path) — nothing to clean up.
  if (row.attachment_path && row.attachment_path !== path) {
    await db.storage.from(BUCKET).remove([row.attachment_path]);
  }

  return { name };
}

/**
 * A short-lived signed link to the row's attachment — the bucket is private,
 * so a signed-in owner is the only way anything gets read.
 */
export async function getAttachmentUrl(
  table: AttachmentTable,
  entity: Entity,
  id: string,
  ownerId: string,
): Promise<{ url: string; name: string } | null> {
  const db = getDb();
  const { data: row, error } = await db
    .from(table)
    .select("attachment_path,attachment_name")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error(`${entity} not found.`);
  if (!row.attachment_path) return null;
  const { data, error: signError } = await db.storage
    .from(BUCKET)
    .createSignedUrl(row.attachment_path, URL_TTL_SECONDS);
  if (signError) throw new Error(signError.message);
  return { url: data.signedUrl, name: row.attachment_name ?? "attachment" };
}

/**
 * Detach the attachment; the stored file goes too. OB and LOA forms carry an
 * approval mark along with the file — DTR records have no approval step.
 */
export async function removeAttachment(
  table: AttachmentTable,
  entity: Entity,
  id: string,
  ownerId: string,
) {
  const db = getDb();
  const { data: row, error: rowError } = await db
    .from(table)
    .select("attachment_path,attachment_name")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error(`${entity} not found.`);

  const detach = { attachment_path: null, attachment_name: null };
  const updated_at = new Date().toISOString();
  // OB, LOA, COS and OT tie their approval mark to the file: removing the
  // attachment revokes the approval it carried. DTR records never had a mark.
  const clearApproval =
    table === "ob_forms" || table === "loa_forms" || table === "cos_forms" || table === "ot_forms";
  const { error } = clearApproval
    ? await db
        .from(table)
        .update({ ...detach, attachment_approved: false, updated_at })
        .eq("id", id)
        .eq("owner_id", ownerId)
        .select("id")
    : await db
        .from(table)
        .update({ ...detach, updated_at })
        .eq("id", id)
        .eq("owner_id", ownerId)
        .select("id");
  if (error) throw new Error(error.message);

  if (row.attachment_path) await removeStoredFile(row.attachment_path);
  // The name rides along for the admin activity log.
  return { ok: true as const, name: row.attachment_name ?? "" };
}

/* --------------------------------------------------------------------------
   Additional supporting files (LOA and OT — NOT COS): up to
   OTHER_ATTACHMENTS_MAX files per form beside the single certificate — same
   bucket, same per-file rules, with the stored list living in the row's
   `other_attachments` jsonb column. Add a table here only once it actually has
   the card: the union below has to list every table that carries the column.
   -------------------------------------------------------------------------- */

/** Cap on a form's additional supporting files. */
export const OTHER_ATTACHMENTS_MAX = 8;

/** Read the jsonb file list as a plain array (junk entries are dropped). */
export function readOtherFiles(raw: unknown): LoaOtherFile[] {
  if (!Array.isArray(raw)) return [];
  const out: LoaOtherFile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { path, name } = entry as { path?: unknown; name?: unknown };
    if (typeof path === "string" && typeof name === "string") out.push({ path, name });
  }
  return out;
}

/**
 * Store one more supporting file on a LOA or OT form (a second medical note, lab
 * result, …) next to the single certificate: same bucket and the same empty /
 * 10 MB / blocked-MIME checks, capped at OTHER_ATTACHMENTS_MAX files per form.
 * A random segment in the path means two files that share a name never
 * collide (and a replace can't overwrite a sibling).
 */
export async function uploadOtherAttachment(
  table: OtherAttachmentTable,
  entity: Entity,
  input: { id: string; filename: string; contentType: string; base64: string },
  ownerId: string,
) {
  const db = getDb();
  const { data: row, error: rowError } = await db
    .from(table)
    .select("id,other_attachments")
    .eq("id", input.id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error(`${entity} not found.`);

  const current = readOtherFiles(row.other_attachments);
  if (current.length >= OTHER_ATTACHMENTS_MAX) {
    throw new Error(`A form can hold up to ${OTHER_ATTACHMENTS_MAX} additional files.`);
  }

  const { buffer, contentType, name } = readUpload(input);
  const unique = crypto.randomUUID().slice(0, 8);
  const path = `${ROOT}/${ownerId}/${row.id}-extra-${unique}-${name}`;

  await ensureBucket();
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: contentType || "application/octet-stream",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await db
    .from(table)
    .update({
      other_attachments: [...current, { path, name }],
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("owner_id", ownerId)
    .select("id");
  if (updateError) {
    // Roll the fresh upload back so a failed save can't leave an orphan file.
    await removeStoredFile(path);
    throw new Error(updateError.message);
  }
  return { name };
}

/** Short-lived signed links for every additional file on a form, keyed by path. */
export async function getOtherAttachmentUrls(
  table: OtherAttachmentTable,
  entity: Entity,
  id: string,
  ownerId: string,
): Promise<Record<string, string>> {
  const db = getDb();
  const { data: row, error } = await db
    .from(table)
    .select("other_attachments")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error(`${entity} not found.`);

  const signed = await Promise.all(
    readOtherFiles(row.other_attachments).map(async (file) => {
      const { data, error: signError } = await db.storage
        .from(BUCKET)
        .createSignedUrl(file.path, URL_TTL_SECONDS);
      // A file whose object is already gone simply drops out of the list.
      return signError || !data ? null : ([file.path, data.signedUrl] as const);
    }),
  );
  return Object.fromEntries(
    signed.filter((entry): entry is readonly [string, string] => entry !== null),
  );
}

/** Detach one additional file; the stored object goes with it. */
export async function removeOtherAttachment(
  table: OtherAttachmentTable,
  entity: Entity,
  id: string,
  path: string,
  ownerId: string,
) {
  const db = getDb();
  const { data: row, error: rowError } = await db
    .from(table)
    .select("id,other_attachments")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error(`${entity} not found.`);

  const files = readOtherFiles(row.other_attachments);
  const target = files.find((file) => file.path === path);
  if (!target) throw new Error("File not found.");

  const { error } = await db
    .from(table)
    .update({
      other_attachments: files.filter((file) => file.path !== path),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);

  await removeStoredFile(path);
  return { name: target.name };
}

/** Best-effort cleanup of a stored file whose row is already gone. */
export async function removeStoredFile(path: string) {
  const { error } = await getDb().storage.from(BUCKET).remove([path]);
  // An orphaned file is harmless; throwing here would fail a delete that worked.
  if (error) console.error("Could not remove stored file:", error.message);
}
