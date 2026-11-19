/**
 * One showroom picture slot in the drawer: a stacked card with the label
 * above, the picture (or an upload prompt) inside a bordered box, and the
 * filename, size, Download, Replace and Remove underneath. While a file
 * uploads the box shows a progress bar instead of a spinner.
 *
 * Presentational on purpose: the drawer owns the staged refs, the pending
 * removals, the upload progress and the save, so this only draws the current
 * preview and reports a picked file / a remove press.
 */
import { useRef, useState } from "react";
import { Maximize2, Upload } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/attachment-upload";

import { LABEL } from "../lib/drawer-styles";

/** What the file dialog offers; the server checks the real bytes again. */
const PHOTO_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/bmp";

/** Clamp and round a progress value for display. */
const asPercent = (value: number | null | undefined) =>
  Math.max(0, Math.min(100, Math.round(value ?? 0)));

/**
 * The upload bar used instead of a spinner.
 *
 * A browser upload has no honest percentage, so the bar runs to 90 fast and
 * then waits there (pulsing) until the server has the bytes; only then does
 * the drawer send 100. Nobody stares at a crawler that looks stuck, and the
 * final jump is real.
 */
function UploadBar({
  value,
  label,
  tone = "brand",
  className,
}: {
  value: number | null | undefined;
  label: string;
  tone?: "brand" | "onDark";
  className?: string;
}) {
  const percent = asPercent(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn(
        "h-1.5 overflow-hidden rounded-full",
        tone === "onDark" ? "bg-white/25" : "bg-secondary",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-150 ease-out",
          tone === "onDark" ? "bg-white" : "bg-[#c24a0e]",
          percent >= 90 && "animate-pulse",
        )}
        // A sliver at 0 so the track reads as "starting", not "empty".
        style={{ width: `${Math.max(percent, 3)}%` }}
      />
    </div>
  );
}

export type ShowroomPhotoPreview = {
  url: string;
  /**
   * Signed link that saves the file as an attachment. Drafts carry none; their
   * local object URL downloads directly, so the field falls back to `url`.
   */
  downloadUrl?: string | null;
  /** Display-only facts; null while a staged/loaded row has none. */
  filename: string | null;
  byteSize: number | null;
};

type ShowroomPhotoFieldProps = {
  label: string;
  /** Current preview: an existing signed URL or a local object URL. */
  photo: ShowroomPhotoPreview | null;
  /** The saved slot URLs are still loading. */
  loading?: boolean;
  /** A file for this slot is being prepared/uploaded. */
  busy?: boolean;
  /** 0–100 while this slot uploads, for the bar; null when idle. */
  progress?: number | null;
  /** The saved picture is being deleted; the footer says so. */
  removing?: boolean;
  /** The save is in flight; nothing may change. */
  disabled?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  /** Opens the full-size preview dialog for the current picture. */
  onPreview?: (photo: ShowroomPhotoPreview) => void;
};

export function ShowroomPhotoField({
  label,
  photo,
  loading = false,
  busy = false,
  progress = null,
  removing = false,
  disabled = false,
  onPick,
  onRemove,
  onPreview,
}: ShowroomPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canEdit = !disabled && !busy && !removing;

  const pick = () => {
    if (canEdit) inputRef.current?.click();
  };

  const acceptFile = (file: File | undefined) => {
    if (file && canEdit) onPick(file);
  };

  return (
    <div className="min-w-0">
      <span className={LABEL}>{label}</span>

      <div
        aria-busy={loading || undefined}
        className={cn(
          "relative overflow-hidden rounded-lg border bg-field transition-colors",
          dragging && canEdit ? "border-logo ring-2 ring-logo/20" : "border-input",
        )}
        onDragOver={(event) => {
          if (!canEdit) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!canEdit) return;
          event.preventDefault();
          setDragging(false);
          acceptFile(event.dataTransfer.files[0]);
        }}
      >
        {loading ? (
          /*
           * The drawer is asking the server for this slot's signed link; it
           * cannot know yet whether the slot is empty. A small wireframe of the
           * empty prompt (icon tile, title bar, two caption bars) keeps the
           * card's height and reads as "not answered yet" without a spinner.
           */
          <div
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2.5 px-4"
            aria-hidden="true"
          >
            <Skeleton className="size-7 rounded-lg bg-muted" />
            <Skeleton className="mt-0.5 h-2.5 w-24 rounded-full bg-muted" />
            <Skeleton className="h-2 w-32 max-w-full rounded-full bg-muted/70" />
            <Skeleton className="h-2 w-20 rounded-full bg-muted/70" />
          </div>
        ) : photo ? (
          <button
            type="button"
            className="group relative block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--inv-orange)]"
            onClick={() => onPreview?.(photo)}
            aria-label={`Preview ${label}`}
          >
            <img
              src={photo.url}
              alt={`${label} preview`}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
            <span
              className="pointer-events-none absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden="true"
            >
              <Maximize2 className="size-3.5" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-1.5 px-3 text-center transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={pick}
            disabled={!canEdit}
            aria-label={`Upload ${label}`}
          >
            {busy ? (
              <>
                <UploadBar
                  value={progress}
                  label={`Uploading ${label}`}
                  className="w-full max-w-[132px]"
                />
                <span className="text-xs font-semibold text-foreground">
                  Uploading… {asPercent(progress)}%
                </span>
                <span className="text-[11px] leading-4 text-muted-foreground">
                  JPG, PNG, WebP, GIF or BMP
                </span>
              </>
            ) : (
              <>
                <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs font-semibold text-foreground">Upload photo</span>
                <span className="text-[11px] leading-4 text-muted-foreground">
                  JPG, PNG, WebP, GIF or BMP
                </span>
                <span className="text-[11px] leading-4 text-muted-foreground">up to 10 MB</span>
              </>
            )}
          </button>
        )}

        {busy && photo ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-4">
            <UploadBar
              value={progress}
              label={`Uploading ${label}`}
              tone="onDark"
              className="w-full max-w-[130px]"
            />
            <span className="text-[11px] font-semibold text-white">
              Uploading… {asPercent(progress)}%
            </span>
          </div>
        ) : null}
      </div>

      {photo ? (
        <div className="mt-1.5 min-w-0">
          <p
            className="truncate text-[11px] font-medium text-foreground"
            title={photo.filename ?? label}
          >
            {photo.filename ?? "Photo"}
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            <span>{photo.byteSize != null ? formatFileSize(photo.byteSize) : ""}</span>
            {removing ? (
              <span className="font-semibold" aria-live="polite">
                Removing…
              </span>
            ) : (
              <>
                <a
                  href={photo.downloadUrl ?? photo.url}
                  // Cross-origin signed links ignore this (the API signs
                  // Content-Disposition instead); a draft's blob URL downloads
                  // directly, so the name rides along here.
                  download={photo.filename ?? `${label.toLowerCase().replace(/\s+/g, "-")}.jpg`}
                  className={cn(
                    "rounded-sm font-semibold text-foreground underline underline-offset-2 transition-colors hover:text-[var(--inv-orange)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-orange)]",
                    disabled && "pointer-events-none opacity-50",
                  )}
                  aria-disabled={disabled || undefined}
                  tabIndex={disabled ? -1 : undefined}
                >
                  Download
                </a>
                <button
                  type="button"
                  className="rounded-sm font-semibold text-foreground underline underline-offset-2 transition-colors hover:text-[var(--inv-orange)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-orange)] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={pick}
                  disabled={!canEdit}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="rounded-sm font-semibold text-red-600 underline underline-offset-2 transition-colors hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-red-400"
                  onClick={onRemove}
                  disabled={!canEdit}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        aria-label={`${label} file`}
        className="sr-only"
        tabIndex={-1}
        disabled={!canEdit}
        onChange={(event) => {
          acceptFile(event.target.files?.[0]);
          // Reset so picking the same file again still fires `change`.
          event.target.value = "";
        }}
      />
    </div>
  );
}
