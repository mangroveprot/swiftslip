import { Download, FileText, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { downloadFromUrl, IMAGE_RE } from "@/lib/attachment-file";

/**
 * Read-only viewer for a file that is **already uploaded** — the modal that
 * replaces opening the signed link in a new browser tab. The whole window is
 * the file: a picture shows on the form's own paper (scaled to fit, never
 * cropped), a PDF shows its pages in the browser's own viewer (the same
 * embedding the print path uses) and anything that cannot render on screen
 * (docx, xlsx, …) says so and offers the download instead.
 *
 * Escape and a click on the backdrop both close it — the same contract as the
 * upload window (`AttachmentFileDialog`), which is the only other thing this
 * card opens. Nothing here uploads, replaces or removes: the file stays put.
 */
export function AttachmentViewerDialog({
  open,
  title,
  fileName,
  url,
  onClose,
}: {
  open: boolean;
  /** The card's own name — "Approval attachment" or "Attachment". */
  title: string;
  fileName: string;
  /** This row's signed link (1 hour). The window refuses to open without one. */
  url: string | null;
  onClose: () => void;
}) {
  // Escape closes the window — there is no upload in flight to protect here.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined" || !url) return null;

  const isImage = IMAGE_RE.test(fileName);
  const isPdf = /\.pdf$/i.test(fileName);

  return createPortal(
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      // A file dragged over the backdrop must never navigate the page away.
      onDragOver={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachment-viewer-title"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="attachment-viewer-title"
              className="truncate text-base font-semibold"
              title={fileName}
            >
              {fileName}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="btn btn-outline size-8 shrink-0 p-0"
              aria-label="Download attachment"
              title="Download attachment"
              onClick={() => void downloadFromUrl(url, fileName)}
            >
              <Download className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-outline size-8 shrink-0 p-0"
              aria-label="Close the attachment"
              title="Close (Esc)"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* The file on the form's own paper — a scan read the way it will be
            filed, in either theme. */}
        <div className="min-h-0 flex-1 overflow-auto bg-paper p-4 text-ink">
          {isImage ? (
            <img
              src={url}
              alt={fileName}
              className="mx-auto max-h-[72vh] w-auto rounded border border-black/10 object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={fileName}
              className="h-[72vh] w-full rounded border border-black/10 bg-white"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileText className="size-8 opacity-60" aria-hidden="true" />
              <p className="max-w-sm text-sm">
                {fileName} has no on-screen preview. Download it to open it in its own program.
              </p>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void downloadFromUrl(url, fileName)}
              >
                <Download className="size-4" aria-hidden="true" />
                Download
              </button>
            </div>
          )}
        </div>

        <footer className="flex justify-end border-t border-border px-5 py-3">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
