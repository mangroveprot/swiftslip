import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { removeObAttachment, uploadObAttachment } from "@/api/official-business.functions";
import { getCosAttachmentUrl, removeCosAttachment, uploadCosAttachment } from "@/api/cos.functions";
import { getOtAttachmentUrl, removeOtAttachment, uploadOtAttachment } from "@/api/ot.functions";
import { removeLoaAttachment, uploadLoaAttachment } from "@/api/loa.functions";
import {
  getRecordAttachmentUrl,
  removeRecordAttachment,
  uploadRecordAttachment,
} from "@/api/records.functions";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  cosAttachmentUrlQueryOptions,
  cosFormQueryOptions,
  cosFormsQueryOptions,
} from "@/features/change-of-schedule/queries";
import {
  otAttachmentUrlQueryOptions,
  otFormQueryOptions,
  otFormsQueryOptions,
} from "@/features/overtime/queries";
import {
  loaAttachmentUrlQueryOptions,
  loaFormQueryOptions,
  loaFormsQueryOptions,
} from "@/features/leave-of-absence/queries";
import {
  obAttachmentUrlQueryOptions,
  obFormQueryOptions,
  obFormsQueryOptions,
} from "@/features/official-business/queries";
import {
  recordAttachmentUrlQueryOptions,
  recordQueryOptions,
  recordsQueryOptions,
} from "@/features/records/queries";
import { fileToBase64 } from "@/lib/file";
import { downloadFromUrl, IMAGE_RE } from "@/lib/attachment-file";
import { toast } from "@/lib/toast";

/** What the document means for this row: the OB slip and the LOA approval
 *  attachment drive an approval mark; the DTR's file is a supporting file. */
type AttachmentKind = "ob" | "loa" | "cos" | "ot" | "record";

const MAX_MB = 10;

const COPY: Record<
  AttachmentKind,
  { title: string; empty: string; removeTitle: string; removeDescription: string }
> = {
  ob: {
    title: "Approval attachment",
    empty: "Attach approval slip PDF, image or document, up to 10 MB",
    removeTitle: "Remove this attachment?",
    removeDescription:
      "The uploaded file is deleted and the approval mark is cleared. This can't be undone.",
  },
  loa: {
    title: "Approval Attachment",
    empty: "Attach approval file PDF, image or document, up to 10 MB",
    removeTitle: "Remove this attachment?",
    removeDescription:
      "The uploaded file is deleted and the approval mark is cleared. This can't be undone.",
  },
  cos: {
    title: "Approval attachment",
    empty: "Attach approval slip PDF, image or document, up to 10 MB",
    removeTitle: "Remove this attachment?",
    removeDescription:
      "The uploaded file is deleted and the approval mark is cleared. This can't be undone.",
  },
  ot: {
    title: "Approval attachment",
    empty: "Attach approval slip PDF, image or document, up to 10 MB",
    removeTitle: "Remove this attachment?",
    removeDescription:
      "The uploaded file is deleted and the approval mark is cleared. This can't be undone.",
  },
  record: {
    title: "Attachment",
    empty: "Attach a supporting document PDF, image or document, up to 10 MB",
    removeTitle: "Remove this attachment?",
    removeDescription: "The uploaded file is deleted. This can't be undone.",
  },
};
/** Per-kind signed-URL query options — one lookup instead of ternaries. */
const URL_QUERY = {
  ob: obAttachmentUrlQueryOptions,
  loa: loaAttachmentUrlQueryOptions,
  cos: cosAttachmentUrlQueryOptions,
  ot: otAttachmentUrlQueryOptions,
  record: recordAttachmentUrlQueryOptions,
};

/**
 * Upload / view / remove card for the document attached to an OB form or a DTR
 * record: ≤ 10 MB, any document type (stored-XSS MIME types refused), kept in
 * the private `swiftslip` bucket under `ApprovalSlip/<owner-id>/<row-id>-<file>`
 * and shown through 1-hour signed links. The approval badge and "Approved"
 * checkbox are passed in by `ObAttachmentCard` / `LoaAttachmentCard` via
 * `badge` / `children`.
 */
export function AttachmentCard({
  kind,
  id,
  file,
  canEdit,
  onUploaded,
  onRemoved,
  badge,
  children,
  cardClassName = "shrink-0 rounded-xl border bg-card p-3 shadow-sm",
}: {
  kind: AttachmentKind;
  id: string;
  file: { name: string } | null;
  canEdit: boolean;
  /** Called after a successful upload so the editor can lock the row in as kept. */
  onUploaded: () => void;
  /** Called after a successful removal (the OB editor clears its approval mark). */
  onRemoved?: () => void;
  /** Status chip shown next to the title (the OB approved / not-approved badge). */
  badge?: ReactNode;
  /** Extra controls under the file row (the OB "Approved" checkbox). */
  children?: ReactNode;
  /** Shell classes for the card itself. Overridable so a form can match its
   *  own boxed layout without restyling the other screens that share this card. */
  cardClassName?: string;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const copy = COPY[kind];
  const { data: signed, isLoading: signing } = useQuery({
    ...URL_QUERY[kind](id),
    enabled: Boolean(file),
  });
  const isImage = file ? IMAGE_RE.test(file.name) : false;
  /** PDFs don't preview inline on screen, but they can be embedded for print. */
  const isPdf = file ? /\.pdf$/i.test(file.name) : false;
  // What prints is the file alone — a centered image or the PDF pages. The
  // card title, badge and filename are screen-only, and file types that can't
  // render inline (docx, xlsx, …) print nothing instead of a blank page.
  const printable = Boolean(file) && (isImage || isPdf);

  async function refresh() {
    const urlKey = URL_QUERY[kind](id).queryKey;
    const detailKey = (
      kind === "record"
        ? recordQueryOptions(id)
        : kind === "loa"
          ? loaFormQueryOptions(id)
          : kind === "cos"
            ? cosFormQueryOptions(id)
            : kind === "ot"
              ? otFormQueryOptions(id)
              : obFormQueryOptions(id)
    ).queryKey;
    const listKey = (
      kind === "record"
        ? recordsQueryOptions()
        : kind === "loa"
          ? loaFormsQueryOptions()
          : kind === "cos"
            ? cosFormsQueryOptions()
            : kind === "ot"
              ? otFormsQueryOptions()
              : obFormsQueryOptions()
    ).queryKey;
    await Promise.all([
      qc.invalidateQueries({ queryKey: urlKey }),
      qc.invalidateQueries({ queryKey: detailKey }),
      // The list shows name + "Updated" time — mark stale without re-fetching now.
      qc.invalidateQueries({ queryKey: listKey, refetchType: "none" }),
    ]);
  }

  /** Shared by the file button and Ctrl+V: same checks, same upload path. */
  async function uploadFile(picked: File) {
    if (!picked.size) {
      toast.error("That file is empty.");
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      toast.error(`Attachments must be ${MAX_MB} MB or smaller.`);
      return;
    }
    setBusy(true);
    try {
      const base64 = await fileToBase64(picked);
      const payload = {
        data: {
          id,
          filename: picked.name,
          contentType: picked.type || "application/octet-stream",
          base64,
        },
      };
      if (kind === "ob") await uploadObAttachment(payload);
      else if (kind === "loa") await uploadLoaAttachment(payload);
      else if (kind === "cos") await uploadCosAttachment(payload);
      else if (kind === "ot") await uploadOtAttachment(payload);
      else await uploadRecordAttachment(payload);
      // A file on the row is content — it must never be scaffold-deleted.
      onUploaded();
      await refresh();
      toast.success("Attachment uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // re-picking the same file has to work again
    if (picked) await uploadFile(picked);
  }

  // Ctrl+V pastes a screenshot straight in as the attachment — approval slips
  // often arrive as a clipboard image. Only a real image file on the clipboard
  // is taken (then the browser's own insert is suppressed); ordinary text and
  // HTML pastes, and pastes while a dialog is open, go through untouched.
  // Latest state, read by the handler without re-subscribing it.
  const pasteRef = useRef({ canEdit, busy, confirming, uploadFile });
  pasteRef.current = { canEdit, busy, confirming, uploadFile };
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const { canEdit, busy, confirming, uploadFile } = pasteRef.current;
      if (!canEdit || busy || confirming) return;
      const image = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .find((f): f is File => f !== null);
      if (!image) return;
      event.preventDefault();
      void uploadFile(image);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  async function confirmRemove() {
    setBusy(true);
    try {
      if (kind === "ob") await removeObAttachment({ data: { id } });
      else if (kind === "loa") await removeLoaAttachment({ data: { id } });
      else if (kind === "cos") await removeCosAttachment({ data: { id } });
      else if (kind === "ot") await removeOtAttachment({ data: { id } });
      else await removeRecordAttachment({ data: { id } });
      onRemoved?.();
      await refresh();
      setConfirming(false);
      toast.success("Attachment removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that attachment.");
    } finally {
      setBusy(false);
    }
  }

  // The card joins the printout only when its file can actually be shown, and
  // then it always starts on a fresh page — the attachment never shares a
  // sheet with the document. Everything except the file itself (title, badge,
  // filename, buttons) is screen-only.
  return (
    <section
      className={`${cardClassName}${
        printable
          ? " print:break-before-page print:border-0 print:rounded-none print:bg-transparent print:p-0 print:shadow-none"
          : " print:hidden"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.webp"
        disabled={!canEdit || busy}
        onChange={pickFile}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="lbl flex items-center gap-1.5">
          <Paperclip className="size-3.5" aria-hidden="true" />
          {copy.title}
        </p>
        {badge}
      </div>

      {file ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2 print:rounded-none print:border-0 print:px-0 print:py-0">
            <div className="min-w-0 flex-1 print:text-center">
              <p className="truncate text-sm font-medium print:hidden" title={file.name}>
                {file.name}
              </p>
              {signing ? (
                <p className="text-xs text-muted-foreground print:hidden">Preparing link…</p>
              ) : isImage && signed?.url ? (
                <img
                  src={signed.url}
                  alt={file.name}
                  loading="lazy"
                  className="mt-1.5 max-h-28 w-auto rounded border print:max-h-[24cm] print:max-w-full print:rounded-none"
                />
              ) : null}
            </div>
            {signed?.url ? (
              <button
                type="button"
                className="btn btn-outline size-7 shrink-0 p-0 print:hidden"
                aria-label="Download attachment"
                title="Download attachment"
                onClick={() => {
                  if (signed?.url) void downloadFromUrl(signed.url, file.name);
                }}
              >
                <Download className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {signed?.url ? (
              <a
                href={signed.url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline size-7 shrink-0 p-0 print:hidden"
                aria-label="Open attachment"
                title="Open attachment"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline size-7 shrink-0 p-0 print:hidden"
                  aria-label="Replace attachment"
                  title="Replace attachment"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-outline size-7 shrink-0 p-0 text-destructive hover:text-destructive print:hidden"
                  aria-label="Remove attachment"
                  title="Remove attachment"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>

          {/* Print-only PDF embed: the filename above always prints, and in a
              Chromium printout the attachment's pages follow the document
              below it (other file types print as name + image where possible). */}
          {isPdf && signed?.url ? (
            <iframe
              src={signed.url}
              title={file.name}
              loading="lazy"
              className="hidden h-40 w-full border print:block print:h-[24cm]"
            />
          ) : null}

          {children}
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-outline mt-2 w-full justify-start"
          disabled={!canEdit || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-4" aria-hidden="true" />
          )}
          {busy ? "Uploading…" : canEdit ? copy.empty : "No attachment yet"}
        </button>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !open && !busy && setConfirming(false)}
        title={copy.removeTitle}
        description={copy.removeDescription}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={confirmRemove}
      />
    </section>
  );
}
