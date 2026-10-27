import { ClipboardPaste, FileText, Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { toast } from "@/lib/toast";

/** Same ceiling as every other upload in the app (base64 field cap = 10 MB file). */
const MAX_MB = 10;

/**
 * The "Import from biometric record" overlay.
 *
 * A scanned or photographed time log is usually a screenshot sitting on the
 * clipboard, so the button opens a real drop zone instead of calling the
 * browser's bare file picker: the user can drag a PDF in, choose a file, or
 * just press Ctrl+V (⌘V on a Mac) anywhere while this is open. Nothing is read
 * until "Read this file" is pressed, so a wrong pick costs one click.
 *
 * One file per import — a biometric log is one sheet, and a second pick
 * replaces the first instead of queueing two reads.
 */
export function BiometricImportDialog({
  open,
  busy,
  onClose,
  onImport,
}: {
  open: boolean;
  /** The AI read is in flight — every control is locked and labelled. */
  busy: boolean;
  onClose: () => void;
  onImport: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Each open starts clean — the last import's file must not linger.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDragging(false);
  }, [open]);

  // Object URLs for the picture preview, revoked when it is replaced or closed.
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
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
    const isPdf = picked.type === "application/pdf" || /\.pdf$/i.test(picked.name);
    const isImage = picked.type.startsWith("image/");
    if (!isPdf && !isImage) {
      toast.error("Use a PDF or a picture (PNG, JPG) of the biometric log.");
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      toast.error(`Files must be ${MAX_MB} MB or smaller.`);
      return;
    }
    setFile(picked);
  }

  // Ctrl+V while the overlay is open — a screenshot lands as an image file on
  // the clipboard. Read through a ref so the listener never goes stale.
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    if (!open) return;
    function onPaste(event: ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find(
        (i) => i.kind === "file" && (i.type.startsWith("image/") || i.type === "application/pdf"),
      );
      const pasted = item?.getAsFile() ?? null;
      if (!pasted) return;
      event.preventDefault();
      acceptRef.current(pasted);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open]);

  // Escape closes the overlay, but never out from under a read in flight.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="biometric-import-title"
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="biometric-import-title" className="text-base font-semibold">
              Import from biometric record
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The times are read from the file and fill the daily entries below.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline size-8 shrink-0 p-0"
            aria-label="Close the import window"
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
            accept="application/pdf,image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = ""; // re-picking the same file must work again
              accept(picked);
            }}
          />

          {file ? (
            // The picked file keeps its own paper: a scan shown on white is the
            // way it will be read, in either theme.
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
                <p className="text-xs opacity-70">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
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
                  onClick={() => setFile(null)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
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
            A PDF, PNG, JPG or a pasted screenshot, up to {MAX_MB} MB.
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
              if (file) onImport(file);
            }}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Reading…
              </>
            ) : (
              "Read this file"
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
