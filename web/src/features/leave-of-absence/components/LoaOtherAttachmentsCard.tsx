import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { removeLoaOtherAttachment, uploadLoaOtherAttachment } from "@/api/loa.functions";
import { AttachmentUploadDialog } from "@/components/common/AttachmentUploadDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { downloadFromUrl, IMAGE_RE } from "@/lib/attachment-file";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  prepareAttachment,
} from "@/lib/attachment-upload";
import { fileToBase64 } from "@/lib/file";
import { toast } from "@/lib/toast";
import type { LoaOtherFile } from "@swiftslip/shared/types";
import { loaFormQueryOptions, loaFormsQueryOptions, loaOtherUrlsQueryOptions } from "../queries";

const MAX_FILES = 8;

/**
 * The LOA form's extra supporting documents (medical notes, lab results, …):
 * up to 8 files of 10 MB each, optional for approval. Unlike the single
 * certificate above it, this card never carries approval. Uploads run one
 * request per file so every body stays at the single-file 10 MB limit, and go
 * through `AttachmentUploadDialog` so a batch can be queued, checked and
 * pasted in one go.
 *
 * This is the on-screen manager ONLY — it stores, lists and removes files and
 * never prints. The printable copies are a separate element the editor mounts
 * in the preview column (`OtherAttachmentsPrint`), because this card sits in the
 * form column, which is `.no-print`: `display: none !important` on paper would
 * take any print page rendered inside this subtree with it.
 */
export function LoaOtherAttachmentsCard({
  id,
  canEdit,
  others,
  onEnsureRow,
  onUploaded,
}: {
  id: string;
  canEdit: boolean;
  /** The form's current extra files, straight from the form query. */
  others: LoaOtherFile[];
  /** Resolves a real row id, creating the draft's row when there is none yet. */
  onEnsureRow?: (() => Promise<string>) | undefined;
  /** Called the moment the first file lands — a stored file is content, so the
   *  form must be kept (never scaffold-discarded) from then on. */
  onUploaded?: (() => void) | undefined;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<LoaOtherFile | null>(null);
  const { data: urls, isLoading: signing } = useQuery({
    ...loaOtherUrlsQueryOptions(id),
    enabled: others.length > 0,
  });

  async function refresh(target = id) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: loaFormQueryOptions(target).queryKey }),
      qc.invalidateQueries({ queryKey: loaOtherUrlsQueryOptions(target).queryKey }),
      // The list shows name + "Updated" time — mark stale without re-fetching now.
      qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey, refetchType: "none" }),
    ]);
  }

  /**
   * Send one queued file. Big pictures are scaled down first, so a phone photo
   * of a medical certificate arrives as a fraction of its original size. The
   * caller (the upload window) owns the queue, the progress rows and the
   * summary toast, so this only reports its own failure by throwing.
   */
  async function uploadOne(picked: File) {
    const prepared = await prepareAttachment(picked);
    if (prepared.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Must be ${MAX_ATTACHMENT_MB} MB or smaller.`);
    }
    // A draft has no row to attach to yet, so it is stored first. Without this
    // the upload targets the placeholder id and the server rejects it.
    const target = onEnsureRow ? await onEnsureRow() : id;
    const base64 = await fileToBase64(prepared);
    await uploadLoaOtherAttachment({
      data: {
        id: target,
        filename: prepared.name,
        contentType: prepared.type || "application/octet-stream",
        base64,
      },
    });
    await refresh(target);
  }

  async function confirmRemove() {
    const target = removing;
    if (!target) return;
    setBusy(true);
    try {
      await removeLoaOtherAttachment({ data: { id, path: target.path } });
      await refresh();
      setRemoving(null);
      toast.success("Attachment removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that attachment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Screen-only, whatever is attached: the printable copies are mounted in the
    // preview column instead (see the note above).
    <section className="form-fill shrink-0 rounded-xl border bg-card p-3 shadow-sm print:hidden">
      {/* The on-screen manager: header, rows and the upload button. */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="lbl flex items-center gap-1.5">
            <Paperclip className="size-3.5" aria-hidden="true" />
            Other attachments
          </p>
          <span className="text-xs text-muted-foreground">
            {others.length} / {MAX_FILES}
          </span>
        </div>

        {others.length ? (
          <ul className="mt-2 space-y-1.5">
            {others.map((file) => {
              const url = urls?.[file.path];
              // Previewed exactly like the approval attachment: an image shows
              // inline under its name, anything else is opened from the row.
              // No print variants — this card is screen-only.
              const isImage = IMAGE_RE.test(file.name);
              return (
                <li key={file.path} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={file.name}>
                      {file.name}
                    </p>
                    {isImage && url ? (
                      <img
                        src={url}
                        alt={file.name}
                        loading="lazy"
                        className="mt-1.5 max-h-28 w-auto rounded border"
                      />
                    ) : signing ? (
                      <p className="text-xs text-muted-foreground">Preparing link…</p>
                    ) : null}
                  </div>
                  {url ? (
                    <button
                      type="button"
                      className="btn btn-outline size-7 shrink-0 p-0"
                      aria-label={`Download ${file.name}`}
                      title="Download attachment"
                      onClick={() => void downloadFromUrl(url, file.name)}
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline size-7 shrink-0 p-0"
                      aria-label={`Open ${file.name}`}
                      title="Open attachment"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-outline size-7 shrink-0 p-0 text-destructive hover:text-destructive"
                      aria-label={`Remove ${file.name}`}
                      title="Remove attachment"
                      disabled={busy}
                      onClick={() => setRemoving(file)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {canEdit ? (
          <button
            type="button"
            className="btn btn-outline mt-2 w-full justify-start"
            disabled={busy || others.length >= MAX_FILES}
            onClick={() => setUploading(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            {others.length >= MAX_FILES
              ? `All ${MAX_FILES} files added — remove one to add another`
              : `Add files: medical, PDF, image… (up to ${MAX_FILES}, ${MAX_ATTACHMENT_MB} MB each)`}
          </button>
        ) : others.length ? null : (
          <p className="mt-2 text-sm text-muted-foreground">No supporting files yet.</p>
        )}
      </div>

      <AttachmentUploadDialog
        open={uploading}
        title="Other attachments"
        remaining={MAX_FILES - others.length}
        onClose={() => setUploading(false)}
        onUpload={uploadOne}
        onUploaded={onUploaded}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && !busy && setRemoving(null)}
        title="Remove this attachment?"
        description="The uploaded file is deleted. This can't be undone."
        confirmLabel="Remove"
        busy={busy}
        onConfirm={confirmRemove}
      />
    </section>
  );
}
