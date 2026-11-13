import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";

import { removeObAttachment, uploadObAttachment } from "@/api/official-business.functions";
import { removeCosAttachment, uploadCosAttachment } from "@/api/cos.functions";
import { removeOtAttachment, uploadOtAttachment } from "@/api/ot.functions";
import { removeLoaAttachment, uploadLoaAttachment } from "@/api/loa.functions";
import { removeLiqAttachment, uploadLiqAttachment } from "@/api/liquidation.functions";
import { removeRecordAttachment, uploadRecordAttachment } from "@/api/records.functions";
import { AttachmentFileDialog } from "@/components/common/AttachmentFileDialog";
import { AttachmentViewerDialog } from "@/components/common/AttachmentViewerDialog";
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
  liqAttachmentUrlQueryOptions,
  liqFormQueryOptions,
  liqFormsQueryOptions,
} from "@/features/liquidation/queries";
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
type AttachmentKind = "ob" | "loa" | "cos" | "ot" | "liq" | "record";

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
  liq: {
    title: "Approval attachment",
    empty: "Attach the approval slip PDF, image or document, up to 10 MB",
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
/** Per-kind signed-URL query options, one lookup instead of ternaries. */
const URL_QUERY = {
  ob: obAttachmentUrlQueryOptions,
  loa: loaAttachmentUrlQueryOptions,
  cos: cosAttachmentUrlQueryOptions,
  ot: otAttachmentUrlQueryOptions,
  liq: liqAttachmentUrlQueryOptions,
  record: recordAttachmentUrlQueryOptions,
};

/**
 * Upload / view / remove card for the document attached to a form or a DTR
 * record: ≤ 10 MB, any document type (stored-XSS MIME types refused), kept in
 * the private `swiftslip` bucket under `FormAttachement/<owner-id>/<row-id>-<file>`
 * and shown through 1-hour signed links. The approval seal is passed in by the
 * editor via `stamp`, and any extra controls (the "Approved" tick) via
 * `children`.
 */
export function AttachmentCard({
  kind,
  id,
  file,
  canEdit,
  onUploaded,
  onRemoved,
  onEnsureRow,
  stamp,
  children,
  signedUrl,
  signedUrlLoading = false,
  cardClassName = "relative shrink-0 rounded-xl border bg-card p-3 shadow-sm",
}: {
  kind: AttachmentKind;
  id: string;
  file: { name: string } | null;
  canEdit: boolean;
  /** Called after a successful upload. Editors use it to re-read the row. */
  onUploaded?: (() => void) | undefined;
  /** Called after a successful removal (the OB editor clears its approval mark). */
  onRemoved?: () => void;
  /** A draft row has no id until it holds something the user typed, and an
   *  attachment is that something. The editor resolves a real id here before the
   *  upload goes out; omitted for editors that always pass a persisted id. */
  onEnsureRow?: (() => Promise<string>) | undefined;
  /** A mark that belongs *on* the card rather than next to the title, the
   *  approval seal. It is lifted out of the flow into the top-right corner, and
   *  the file row gives up that corner so the mark never sits on the action
   *  buttons. With no file it stands beside the uploader instead. */
  stamp?: ReactNode;
  /** Extra controls under the file row (the OB "Approved" checkbox). */
  children?: ReactNode;
  /** A caller-scoped signed link. HR reviewers are not the row's owner, so the
   *  employee attachment endpoint cannot serve them; when this is set (even to
   *  `null`) the card skips its own owner-scoped URL query. */
  signedUrl?: string | null;
  /** Loading state for a caller-supplied `signedUrl`. */
  signedUrlLoading?: boolean;
  /** Shell classes for the card itself. Overridable so a form can match its
   *  own boxed layout without restyling the other screens that share this card. */
  cardClassName?: string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** The upload window, the ONLY place files are picked, dropped or pasted.
   *  Ctrl+V used to sit on the whole document and fired behind whatever modal
   *  was open (the DTR biometric import, the other-attachments window…); it
   *  now lives inside this window, exactly like the biometric one. */
  const [uploading, setUploading] = useState(false);
  /** The uploaded file open in the modal viewer, never a new browser tab. */
  const [viewing, setViewing] = useState(false);
  const copy = COPY[kind];
  const usesCallerLink = signedUrl !== undefined;
  const { data: ownerSigned, isLoading: ownerSigning } = useQuery({
    ...URL_QUERY[kind](id),
    enabled: !usesCallerLink && Boolean(file),
  });
  const signed = usesCallerLink ? (signedUrl ? { url: signedUrl } : null) : ownerSigned;
  const signing = usesCallerLink ? signedUrlLoading : ownerSigning;
  const isImage = file ? IMAGE_RE.test(file.name) : false;
  /** PDFs don't preview inline on screen, but they can be embedded for print. */
  const isPdf = file ? /\.pdf$/i.test(file.name) : false;
  // What prints is the file alone, a centered image or the PDF pages. The
  // card title, badge and filename are screen-only, and file types that can't
  // render inline (docx, xlsx, …) print nothing instead of a blank page.
  const printable = Boolean(file) && (isImage || isPdf);

  async function refresh(rowId: string) {
    const urlKey = URL_QUERY[kind](rowId).queryKey;
    const detailKey = (
      kind === "record"
        ? recordQueryOptions(rowId)
        : kind === "loa"
          ? loaFormQueryOptions(rowId)
          : kind === "cos"
            ? cosFormQueryOptions(rowId)
            : kind === "ot"
              ? otFormQueryOptions(rowId)
              : kind === "liq"
                ? liqFormQueryOptions(rowId)
                : obFormQueryOptions(rowId)
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
              : kind === "liq"
                ? liqFormsQueryOptions()
                : obFormsQueryOptions()
    ).queryKey;
    await Promise.all([
      qc.invalidateQueries({ queryKey: urlKey }),
      qc.invalidateQueries({ queryKey: detailKey }),
      // The list shows name + "Updated" time, mark stale without re-fetching now.
      qc.invalidateQueries({ queryKey: listKey, refetchType: "none" }),
    ]);
  }

  /**
   * One file, sent by the attachment window. It THROWS on failure so the
   * caller can toast the reason and leave the window open on the picked
   * file, pressing Attach again is the retry. The empty and oversize
   * guards are belt and braces: the window already refuses both.
   */
  async function sendFile(picked: File) {
    if (!picked.size) throw new Error("That file is empty.");
    if (picked.size > MAX_MB * 1024 * 1024) {
      throw new Error(`Attachments must be ${MAX_MB} MB or smaller.`);
    }
    // A draft has no id yet, and a file is real content, so this upload is
    // what forces the row to be created. Resolve the id before reading the file
    // so the created row and the stored file agree.
    const rowId = onEnsureRow ? await onEnsureRow() : id;
    const base64 = await fileToBase64(picked);
    const payload = {
      data: {
        id: rowId,
        filename: picked.name,
        contentType: picked.type || "application/octet-stream",
        base64,
      },
    };
    if (kind === "ob") await uploadObAttachment(payload);
    else if (kind === "loa") await uploadLoaAttachment(payload);
    else if (kind === "cos") await uploadCosAttachment(payload);
    else if (kind === "ot") await uploadOtAttachment(payload);
    else if (kind === "liq") await uploadLiqAttachment(payload);
    else await uploadRecordAttachment(payload);
    onUploaded?.();
    await refresh(rowId);
  }

  /** The window's Attach button: send, then close on success. A failure toasts
   *  and keeps the window, and the file, in place, so the retry is one click. */
  async function attachFile(picked: File) {
    setBusy(true);
    try {
      await sendFile(picked);
      setUploading(false);
      toast.success("Attachment uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    setBusy(true);
    try {
      // Only reachable once a file exists, which means the row is already real.
      if (kind === "ob") await removeObAttachment({ data: { id } });
      else if (kind === "loa") await removeLoaAttachment({ data: { id } });
      else if (kind === "cos") await removeCosAttachment({ data: { id } });
      else if (kind === "ot") await removeOtAttachment({ data: { id } });
      else if (kind === "liq") await removeLiqAttachment({ data: { id } });
      else await removeRecordAttachment({ data: { id } });
      onRemoved?.();
      await refresh(id);
      setConfirming(false);
      toast.success("Attachment removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that attachment.");
    } finally {
      setBusy(false);
    }
  }

  // The uploader is built once and placed two ways: full width when the card
  // carries no mark, and sharing the row with the mark when it does. A stamp
  // laid over the only control in an empty card reads as damage, not approval.
  // It opens the upload window, pick, drop or Ctrl+V there, never on the page.
  const uploadButton = (
    <button
      type="button"
      className="btn btn-outline w-full justify-start"
      disabled={!canEdit || busy}
      onClick={() => setUploading(true)}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Upload className="size-4" aria-hidden="true" />
      )}
      {busy ? "Uploading…" : canEdit ? copy.empty : "No attachment yet"}
    </button>
  );

  // The card joins the printout only when its file can actually be shown, and
  // then it always starts on a fresh page, the attachment never shares a
  // sheet with the document. Everything except the file itself (title, seal,
  // filename, buttons) is screen-only.
  return (
    <section
      className={`${cardClassName}${
        printable
          ? " print:break-before-page print:border-0 print:rounded-none print:bg-transparent print:p-0 print:shadow-none"
          : " print:hidden"
      }`}
    >
      <div className="print:hidden">
        <p className="lbl flex items-center gap-1.5">
          <Paperclip className="size-3.5" aria-hidden="true" />
          {copy.title}
        </p>
      </div>

      {file && stamp ? (
        <div className="pointer-events-none absolute top-3 right-3 z-10 print:hidden">{stamp}</div>
      ) : null}

      {file ? (
        <div className="mt-2 space-y-2">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 print:rounded-none print:border-0 print:px-0 print:py-0${
              stamp ? " pr-20 print:pr-0" : ""
            }`}
          >
            <div className="min-w-0 flex-1 print:text-center">
              <p className="truncate text-sm font-medium print:hidden" title={file.name}>
                {file.name}
              </p>
              {signing ? (
                <p className="text-xs text-muted-foreground print:hidden">Preparing link…</p>
              ) : isImage && signed?.url ? (
                // The thumbnail itself is the button, one click on the
                // picture opens it whole in the modal below.
                <button
                  type="button"
                  className="mt-1.5 block cursor-zoom-in text-left"
                  aria-label={`Open ${file.name}`}
                  title="Open the full attachment"
                  onClick={() => setViewing(true)}
                >
                  <img
                    src={signed.url}
                    alt={file.name}
                    loading="lazy"
                    className="max-h-28 w-auto rounded border print:max-h-[24cm] print:max-w-full print:rounded-none"
                  />
                </button>
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
              // Opens in the modal below, this card never sends a file to a
              // new browser tab any more.
              <button
                type="button"
                className="btn btn-outline size-7 shrink-0 p-0 print:hidden"
                aria-label="Open attachment"
                title="Open attachment"
                onClick={() => setViewing(true)}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline size-7 shrink-0 p-0 print:hidden"
                  aria-label="Replace attachment"
                  title="Replace attachment"
                  disabled={busy}
                  onClick={() => setUploading(true)}
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
      ) : stamp ? (
        // No file yet: the mark stands beside the uploader instead of on top of
        // it, so the button keeps its full label and its border stays unbroken.
        <div className="mt-2 flex items-center gap-3 print:hidden">
          <div className="min-w-0 flex-1">{uploadButton}</div>
          <div className="shrink-0">{stamp}</div>
        </div>
      ) : (
        <div className="mt-2">{uploadButton}</div>
      )}

      {/* The one-file attachment window, pick, drop or Ctrl+V HERE, never on
          the page. It mirrors the biometric import window: its paste listener
          exists only while it is open, so it can never collide with another
          modal, and the full preview shows the file whole in either
          orientation (portrait keeps the narrow column, landscape opens wide). */}
      <AttachmentFileDialog
        open={uploading}
        title={copy.title}
        busy={busy}
        onClose={() => setUploading(false)}
        onAttach={attachFile}
      />

      {/* The already-uploaded file, read in place: images and PDFs open in
          this window instead of a new browser tab. */}
      <AttachmentViewerDialog
        open={viewing && Boolean(signed?.url)}
        title={copy.title}
        fileName={file?.name ?? ""}
        url={signed?.url ?? null}
        onClose={() => setViewing(false)}
      />

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
