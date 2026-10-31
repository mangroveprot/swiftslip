import { ClipboardPaste, FileText, Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  formatFileSize,
  isAcceptedAttachment,
} from "@/lib/attachment-upload";
import { toast } from "@/lib/toast";

/** How a picked file can be shown whole on screen — or not at all. */
function previewKind(file: File): "image" | "pdf" | null {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  // Windows sometimes reports an empty type; the extension is the fallback.
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
    return "image";
  }
  return null;
}

/**
 * The one-file attachment window — where a form's approval slip (or a DTR's
 * supporting document) is picked, dropped or pasted, and nowhere else.
 *
 * Structured exactly like `BiometricImportDialog`: a drop zone until a file
 * is picked, then the file's own card with "Choose a different file". What it
 * adds is a FULL preview of the file — the whole picture scaled to fit, never
 * cropped and never stretched, with the window itself adapting to the
 * orientation it receives: a portrait phone shot keeps the narrow column, a
 * landscape scan opens the window wide. PDFs show their pages in the
 * browser's own viewer.
 *
 * Ctrl+V, drag-drop and the picker are read only while this window is open,
 * so a paste can never reach the page behind it (the DTR biometric import,
 * another modal — or nothing at all). One file per window: a second pick
 * replaces the first instead of queueing.
 */
export function AttachmentFileDialog({
  open,
  title,
  busy,
  onClose,
  onAttach,
}: {
  open: boolean;
  /** The card's own name — "Approval attachment" or "Attachment". */
  title: string;
  /** The upload is in flight — every control is locked and labelled. */
  busy: boolean;
  onClose: () => void;
  onAttach: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** The picture's natural size — decides how wide the window opens. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Each open starts clean — the last pick must not linger.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setNatural(null);
    setDragging(false);
  }, [open]);

  // Object URLs for the preview, revoked when the file is replaced or closed.
  useEffect(() => {
    if (!file || !previewKind(file)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** Shared by the picker, the drop and the paste — one set of checks. */
  function accept(picked: File | null | undefined) {
    if (!picked) return;
    if (!isAcceptedAttachment(picked)) {
      toast.error("Use a PDF, picture or document (PNG, JPG, Word, Excel).");
      return;
    }
    if (picked.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`Attachments must be ${MAX_ATTACHMENT_MB} MB or smaller.`);
      return;
    }
    setFile(picked);
    setNatural(null); // the next preview measures itself again
  }

  // Ctrl+V while the window is open — a screenshot lands as an image file on
  // the clipboard. Read through a ref so the listener never goes stale.
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    if (!open) return;
    function onPaste(event: ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) => i.kind === "file");
      const pasted = item?.getAsFile() ?? null;
      if (!pasted) return;
      event.preventDefault();
      acceptRef.current(pasted);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open]);

  // Escape closes the window, but never out from under an upload in flight.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Portrait pictures keep the narrow column; landscape ones open the window
  // wide so the preview gets real width — either way nothing is cropped.
  const wide = natural !== null && natural.w > natural.h;

  return createPortal(
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={busy ? undefined : onClose}
      // A file dropped outside the zone must never navigate the page away.
      onDragOver={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachment-file-title"
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-xl border border-border bg-card text-card-foreground shadow-xl transition-[max-width] ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="attachment-file-title" className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The file is uploaded and kept with this document.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline size-8 shrink-0 p-0"
            aria-label="Close the attachment window"
            title="Close (Esc)"
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = ""; // re-picking the same file must work again
              accept(picked);
            }}
          />

          {file ? (
            <>
              {/* The picked file keeps its own paper: a scan shown on white is
                  the way it will be read, in either theme. */}
              <div className="flex items-center gap-3 rounded-lg border border-border bg-paper p-3 text-ink">
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    className="size-16 shrink-0 rounded border border-black/10 object-contain"
                  />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded border border-black/10 bg-white">
                    <FileText className="size-7" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs opacity-70">{formatFileSize(file.size)}</p>
                  {busy ? null : (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium underline underline-offset-2"
                      onClick={() => inputRef.current?.click()}
                    >
                      Choose a different file
                    </button>
                  )}
                </div>
                {busy ? null : (
                  <button
                    type="button"
                    className="btn btn-outline size-7 shrink-0 p-0"
                    aria-label="Remove this file"
                    title="Remove this file"
                    onClick={() => {
                      setFile(null);
                      setNatural(null);
                    }}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* The full preview: the whole file on its paper — a picture is
                  scaled to fit (portrait stays tall, landscape opens wide) and
                  a PDF shows its pages in the browser's own viewer. */}
              {preview ? (
                <div className="flex items-center justify-center rounded-lg border border-border bg-paper p-3">
                  {previewKind(file) === "pdf" ? (
                    <iframe
                      src={preview}
                      title={file.name}
                      className="h-[50vh] w-full rounded border border-black/10 bg-white"
                    />
                  ) : (
                    <img
                      src={preview}
                      alt={file.name}
                      onLoad={(e) =>
                        setNatural({
                          w: e.currentTarget.naturalWidth,
                          h: e.currentTarget.naturalHeight,
                        })
                      }
                      className="max-h-[50vh] w-auto max-w-full rounded border border-black/10 object-contain"
                    />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This file type has no on-screen preview — it is stored as-is.
                </p>
              )}
            </>
          ) : (
            // The drop zone follows the theme (it is chrome, not a document), so
            // it stays readable on a dark card instead of flashing white.
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                accept(e.dataTransfer.files[0]);
              }}
              className={`rounded-lg border-2 border-dashed bg-background px-4 py-6 text-center transition ${
                dragging ? "border-primary" : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <Upload className="mx-auto size-6 text-dashboard-accent" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Drag the file here, or</p>
              <button
                type="button"
                className="btn btn-outline mt-2 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ClipboardPaste className="size-3.5" aria-hidden="true" />
                Press Ctrl+V to paste a screenshot
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            A PDF, image, document or a pasted screenshot, up to {MAX_ATTACHMENT_MB} MB.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy}
            aria-busy={busy}
            onClick={() => {
              if (file) onAttach(file);
            }}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Uploading…
              </>
            ) : (
              "Attach file"
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
