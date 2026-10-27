import {
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Loader2,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  formatFileSize,
} from "@/lib/attachment-upload";
import { toast } from "@/lib/toast";

/** One file in the queue and where it has got to. */
type Job = {
  /** Stable key — the same file picked twice is still two rows. */
  key: string;
  file: File;
  status: "ready" | "uploading" | "done" | "failed";
  /** Server message when it failed, so the row can say why. */
  error?: string | undefined;
};

let jobSeq = 0;

function isAccepted(file: File): boolean {
  if (file.type) {
    return (
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      /^text\/plain$/.test(file.type) ||
      /officedocument|msword|ms-excel|ms-powerpoint/.test(file.type)
    );
  }
  // Empty MIME type (common on Windows): fall back to the extension.
  return /\.(pdf|png|jpe?g|gif|webp|bmp|txt|docx?|xlsx?|pptx?)$/i.test(file.name);
}

/**
 * The upload window for a form's additional attachments.
 *
 * The plain file picker made every upload a single surprise: one dialog, one
 * file, no idea what was picked until it was already on the server. This window
 * shows the queue first — pick, drop or paste several files, see each one's size,
 * drop the ones you changed your mind about — and only sends them when
 * "Upload" is pressed. Files go one at a time so each request stays inside the
 * server's single-file limit, and a row turns green as its own file lands.
 */
export function AttachmentUploadDialog({
  open,
  title,
  remaining,
  onClose,
  onUpload,
  onUploaded,
}: {
  open: boolean;
  /** Headline of the window — the card's own name ("Other attachments"). */
  title: string;
  /** How many more files this form can take right now. */
  remaining: number;
  onClose: () => void;
  /** One file, ready to send. Throws to report a failure for that row. */
  onUpload: (file: File) => Promise<void>;
  /** Called once when the window closes, if anything was actually stored. */
  onUploaded?: (() => void) | undefined;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Read inside async work without re-subscribing the paste handler.
  const stateRef = useRef({ open, busy, jobs });
  stateRef.current = { open, busy, jobs };

  // Every open starts empty — last batch must not linger.
  useEffect(() => {
    if (!open) return;
    setJobs([]);
    setDragging(false);
    setBusy(false);
  }, [open]);

  const pending = jobs.filter((job) => job.status === "ready");
  const readyCount = pending.length;
  const seats = Math.max(0, remaining);

  /** Shared by the picker, the drop and the paste — one set of checks. */
  function add(files: File[]) {
    if (!files.length) return;
    const { busy: locked, jobs: current } = stateRef.current;
    if (locked) return;

    const usable = current.filter((job) => job.status !== "failed").length;
    const room = Math.max(0, remaining - usable);

    const bad = files.filter((file) => !isAccepted(file));
    const big = files.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
    const empty = files.filter((file) => !file.size);
    const good = files.filter(
      (file) => file.size > 0 && file.size <= MAX_ATTACHMENT_BYTES && isAccepted(file),
    );

    if (bad.length) {
      toast.error(
        bad.length === 1
          ? `"${bad[0]!.name}" is not a PDF, image or Office document.`
          : `${bad.length} of those files are not a PDF, image or Office document.`,
      );
    }
    if (big.length) {
      toast.error(
        big.length === 1
          ? `"${big[0]!.name}" is over ${MAX_ATTACHMENT_MB} MB.`
          : `${big.length} of those files are over ${MAX_ATTACHMENT_MB} MB.`,
      );
    }
    if (empty.length) toast.error("An empty file can't be attached.");

    if (!room) {
      if (good.length) {
        toast.error(
          remaining <= 0
            ? "This form already has all its files, so remove one before adding another."
            : `You can add ${remaining} more file${remaining === 1 ? "" : "s"} here.`,
        );
      }
      return;
    }
    if (good.length > room) {
      toast.error(`Only ${room} more file${room === 1 ? " fits" : "s fit"} on this form.`);
    }

    const taken = good.slice(0, room);
    if (!taken.length) return;
    setJobs((prev) => [
      ...prev,
      ...taken.map((file) => ({
        key: `job-${(jobSeq += 1)}`,
        file,
        status: "ready" as const,
      })),
    ]);
  }

  // Ctrl+V while the window is open — a screenshot lands as an image file.
  useEffect(() => {
    if (!open) return;
    function onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (!files.length) return;
      event.preventDefault();
      // A pasted screenshot has no name — give it one that says what it is.
      add(
        files.map((file) =>
          file.name && file.name !== "image.png"
            ? file
            : new File([file], `pasted-image-${Date.now()}.png`, { type: file.type }),
        ),
      );
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // `add` reads the live state through a ref, so this binds once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remaining]);

  // Escape closes the window, but never out from under a batch in flight.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !stateRef.current.busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function remove(key: string) {
    setJobs((prev) => prev.filter((job) => job.key !== key));
  }

  async function start() {
    const queue = stateRef.current.jobs.filter((job) => job.status === "ready");
    if (!queue.length) return;
    setBusy(true);
    let stored = 0;

    for (const job of queue) {
      setJobs((prev) =>
        prev.map((row) => (row.key === job.key ? { ...row, status: "uploading" } : row)),
      );
      try {
        await onUpload(job.file);
        stored += 1;
        setJobs((prev) =>
          prev.map((row) => (row.key === job.key ? { ...row, status: "done" } : row)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        setJobs((prev) =>
          prev.map((row) =>
            row.key === job.key ? { ...row, status: "failed", error: message } : row,
          ),
        );
      }
    }

    setBusy(false);
    if (stored) {
      onUploaded?.();
      toast.success(stored === 1 ? "Attachment added" : `${stored} attachments added`);
    }
    // Everything landed — nothing left to look at, so the window closes itself.
    const failedLeft = stateRef.current.jobs.some((row) => row.status === "failed");
    if (!failedLeft) onClose();
  }

  /** A failed row goes back in the queue so one retry can fix it. */
  function retry(key: string) {
    setJobs((prev) =>
      prev.map((row) => (row.key === key ? { ...row, status: "ready", error: undefined } : row)),
    );
  }

  if (!open || typeof document === "undefined") return null;

  const failed = jobs.filter((job) => job.status === "failed");
  const canStart = readyCount > 0 && !busy;

  return createPortal(
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachment-upload-title"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="attachment-upload-title" className="text-base font-semibold">
              Upload files
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {title} — {seats} more file{seats === 1 ? "" : "s"} can be added to this form.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline size-8 shrink-0 p-0"
            aria-label="Close the upload window"
            title="Close (Esc)"
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            disabled={busy || seats === 0}
            onChange={(e) => {
              // `input.files` is a live list; copy it before clearing the value.
              const picked = Array.from(e.target.files ?? []);
              e.target.value = ""; // re-picking the same files has to work
              add(picked);
            }}
          />

          {/*
            A soft green paper zone in both themes: the dashboard's own soft
            tint, which is pale mint on light and deep green on dark, so the zone
            reads as "drop here" without turning into a white block at night.
          */}
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy && seats > 0) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              add(Array.from(e.dataTransfer.files ?? []));
            }}
            onClick={() => !busy && seats > 0 && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !busy && seats > 0) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={`cursor-pointer rounded-lg border-2 border-dashed bg-dashboard-soft px-4 py-6 text-center transition ${
              dragging
                ? "border-dashboard-accent"
                : "border-dashboard-rule/40 hover:border-dashboard-accent"
            } ${busy || seats === 0 ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <UploadCloud className="mx-auto size-7 text-dashboard-accent" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">Drag &amp; drop your files here, or</p>
            <span
              className="btn btn-outline mt-2 bg-card text-card-foreground"
              // The zone itself opens the picker; this is the visible affordance.
              aria-hidden="true"
            >
              Choose files
            </span>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ClipboardPaste className="size-3.5" aria-hidden="true" />
              Press Ctrl+V to paste a screenshot
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            PDF, image or Office document, up to {MAX_ATTACHMENT_MB} MB each. Pictures bigger than a
            phone screen are scaled down before upload, so they send quickly.
          </p>

          {jobs.length ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="lbl">Selected files</p>
                <span className="text-xs text-muted-foreground">
                  {jobs.length} file{jobs.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {jobs.map((job) => (
                  <li
                    key={job.key}
                    className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
                  >
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={job.file.name}>
                        {job.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(job.file.size)}
                        {job.status === "uploading" ? " · uploading…" : ""}
                        {job.status === "done" ? " · added" : ""}
                        {job.status === "failed" ? ` · ${job.error ?? "failed"}` : ""}
                      </p>
                    </div>
                    {job.status === "done" ? (
                      <CheckCircle2
                        className="size-4 shrink-0 text-dashboard-accent"
                        aria-label="Added"
                      />
                    ) : null}
                    {job.status === "uploading" ? (
                      <Loader2
                        className="size-4 shrink-0 animate-spin text-muted-foreground"
                        aria-label="Uploading"
                      />
                    ) : null}
                    {job.status === "failed" ? (
                      <button
                        type="button"
                        className="btn btn-outline size-7 shrink-0 p-0"
                        aria-label={`Retry ${job.file.name}`}
                        title="Retry"
                        disabled={busy}
                        onClick={() => retry(job.key)}
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                    {job.status === "ready" ? (
                      <button
                        type="button"
                        className="btn btn-outline size-7 shrink-0 p-0 text-destructive hover:text-destructive"
                        aria-label={`Remove ${job.file.name} from the list`}
                        title="Remove from the list"
                        disabled={busy}
                        onClick={() => remove(job.key)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {failed.length ? (
                <p className="mt-2 text-xs text-destructive">
                  {failed.length === 1 ? "One file" : `${failed.length} files`} did not upload.
                  Press the retry arrow to send {failed.length === 1 ? "it" : "them"} again, or
                  remove {failed.length === 1 ? "it" : "them"} from the list.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy || seats === 0}
            onClick={() => inputRef.current?.click()}
          >
            Add more
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canStart}
              aria-busy={busy}
              onClick={() => void start()}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Uploading…
                </>
              ) : (
                `Upload ${readyCount || ""}`.trim()
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
