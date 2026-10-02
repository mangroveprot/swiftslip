import { getDb } from "@/server/db/client.server";

const BUCKET = "swiftslip";
/** Every user's documents live in their own folder: ApprovalSlip/<their id>/. */
const ROOT = "ApprovalSlip";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/**
 * The bucket accepts any MIME type (PDF, images, Word, Excel, …) by design —
 * only stored-XSS vectors are turned away, since signed URLs serve whatever is
 * stored with the declared content type.
 */
const BLOCKED_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/javascript",
  "application/javascript",
]);

/** Signed download links live for an hour — long enough to view or re-download. */
const URL_TTL_SECONDS = 60 * 60;

/** Rows that can hold a document; `(id, owner_id)` always identifies one of them. */
type AttachmentTable = "ob_forms" | "dtr_records";
/** The row's human name, used in error messages ("Form not found." etc.). */
type Entity = "Form" | "Record";

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

  const contentType = (input.contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (BLOCKED_TYPES.has(contentType)) {
    throw new Error("That file type can't be stored here. Use a PDF, image or Office document.");
  }

  const buffer = Buffer.from(input.base64, "base64");
  if (!buffer.byteLength) throw new Error("That file is empty or could not be read.");
  if (buffer.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new Error("Attachments must be 10 MB or smaller.");
  }

  const name = safeFilename(input.filename);
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
 * Detach the attachment; the stored file goes too. Only OB forms carry an
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
    .select("attachment_path")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error(`${entity} not found.`);

  const detach = { attachment_path: null, attachment_name: null };
  const updated_at = new Date().toISOString();
  const { error } =
    table === "ob_forms"
      ? await db
          .from("ob_forms")
          .update({ ...detach, attachment_approved: false, updated_at })
          .eq("id", id)
          .eq("owner_id", ownerId)
          .select("id")
      : await db
          .from("dtr_records")
          .update({ ...detach, updated_at })
          .eq("id", id)
          .eq("owner_id", ownerId)
          .select("id");
  if (error) throw new Error(error.message);

  if (row.attachment_path) await removeStoredFile(row.attachment_path);
  return { ok: true as const };
}

/** Best-effort cleanup of a stored file whose row is already gone. */
export async function removeStoredFile(path: string) {
  const { error } = await getDb().storage.from(BUCKET).remove([path]);
  // An orphaned file is harmless; throwing here would fail a delete that worked.
  if (error) console.error("Could not remove stored file:", error.message);
}
