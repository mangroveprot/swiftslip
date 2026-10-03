import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { removeLoaOtherAttachment, uploadLoaOtherAttachment } from "@/api/loa.functions";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { fileToBase64 } from "@/lib/file";
import { toast } from "@/lib/toast";
import type { LoaOtherFile } from "@/shared/types";
import { loaFormQueryOptions, loaFormsQueryOptions, loaOtherUrlsQueryOptions } from "../queries";

const MAX_FILES = 8;
const MAX_MB = 10;

/**
 * The LOA form's extra supporting documents (medical notes, lab results, …):
 * up to 8 files of 10 MB each, optional for approval. Unlike the single
 * certificate above it, this card never carries approval and never prints —
 * it only stores, lists and removes files (kept screen-only on purpose: the
 * certificate is the document that follows the form on paper). Uploads run
 * one request per file so every body stays at the single-file 10 MB limit.
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
  onUploaded: () => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<LoaOtherFile | null>(null);
  const { data: urls } = useQuery({ ...loaOtherUrlsQueryOptions(id), enabled: others.length > 0 });

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
        if (stored === 0) onUploaded();
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
    <section className="shrink-0 rounded-xl border bg-card p-3 shadow-sm print:hidden">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.webp"
        disabled={!canEdit || busy}
        onChange={(e) => {
          const list = e.target.files;
          e.target.value = ""; // re-picking the same files has to work again
          if (list?.length) void uploadPicked(list);
        }}
      />

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
            return (
              <li key={file.path} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium" title={file.name}>
                  {file.name}
                </p>
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
