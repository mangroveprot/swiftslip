import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { removeLoaOtherAttachment, uploadLoaOtherAttachment } from "@/api/loa.functions";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { downloadFromUrl, IMAGE_RE } from "@/lib/attachment-file";
import { fileToBase64 } from "@/lib/file";
import { toast } from "@/lib/toast";
import type { LoaOtherFile } from "@/shared/types";
import { loaFormQueryOptions, loaFormsQueryOptions, loaOtherUrlsQueryOptions } from "../queries";

const MAX_FILES = 8;
const MAX_MB = 10;

/**
 * The LOA form's extra supporting documents (medical notes, lab results, …):
 * up to 8 files of 10 MB each, optional for approval. Unlike the single
 * certificate above it, this card never carries approval. Uploads run one
 * request per file so every body stays at the single-file 10 MB limit.
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
  onUploaded,
}: {
  id: string;
  canEdit: boolean;
  /** The form's current extra files, straight from the form query. */
  others: LoaOtherFile[];
  /** Called the moment the first file lands — a stored file is content, so the
   *  form must be kept (never scaffold-discarded) from then on. */
  onUploaded?: (() => void) | undefined;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<LoaOtherFile | null>(null);
  const { data: urls, isLoading: signing } = useQuery({
    ...loaOtherUrlsQueryOptions(id),
    enabled: others.length > 0,
  });

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: loaFormQueryOptions(id).queryKey }),
      qc.invalidateQueries({ queryKey: loaOtherUrlsQueryOptions(id).queryKey }),
      // The list shows name + "Updated" time — mark stale without re-fetching now.
      qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey, refetchType: "none" }),
    ]);
  }

  async function uploadPicked(list: FileList | File[]) {
    const picked = Array.from(list);
    if (!picked.length) return;
    const oversized = picked.find((file) => file.size > MAX_MB * 1024 * 1024);
    if (oversized) {
      toast.error(
        `"${oversized.name}" is over ${MAX_MB} MB — each file must be ${MAX_MB} MB or smaller.`,
      );
      return;
    }
    const empty = picked.find((file) => !file.size);
    if (empty) {
      toast.error(`"${empty.name}" is empty.`);
      return;
    }
    const room = MAX_FILES - others.length;
    if (picked.length > room) {
      toast.error(
        room <= 0
          ? `This form already has ${MAX_FILES} files — remove one before adding another.`
          : `You can add ${room} more file${room === 1 ? "" : "s"} (up to ${MAX_FILES} total).`,
      );
      return;
    }

    setBusy(true);
    let stored = 0;
    try {
      for (const file of picked) {
        const base64 = await fileToBase64(file);
        await uploadLoaOtherAttachment({
          data: {
            id,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            base64,
          },
        });
        if (stored === 0) onUploaded?.();
        stored += 1;
      }
      await refresh();
      toast.success(stored === 1 ? "Attachment added" : `${stored} attachments added`);
    } catch (err) {
      // Whatever did land has to show up before the error toast.
      if (stored) await refresh().catch(() => {});
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
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
    <section className="form-fill shrink-0 rounded-2xl border bg-card p-4 shadow-sm print:hidden">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.webp"
        disabled={!canEdit || busy}
        onChange={(e) => {
          // `input.files` is a LIVE FileList — clearing `input.value` below
          // empties that very list, so a reference to it would always read
          // length 0 and nothing would ever upload. Copy the files out first.
          const list = Array.from(e.target.files ?? []);
          e.target.value = ""; // re-picking the same files has to work again
          if (list.length) void uploadPicked(list);
        }}
      />

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
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {busy
              ? "Uploading…"
              : `Add files — medical, PDF, image… (up to ${MAX_FILES}, ${MAX_MB} MB each)`}
          </button>
        ) : others.length ? null : (
          <p className="mt-2 text-sm text-muted-foreground">No supporting files yet.</p>
        )}
      </div>

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
