/**
 * Full-size preview of one showroom picture.
 *
 * Opened from the board thumbnail and from the drawer's photo card. The board
 * only carries the signed *thumb* URL, so when a `showroomId` is given the
 * dialog asks for the full-size link once it opens and swaps it in; the thumb
 * stays as the instant placeholder.
 *
 * Portaled to `<body>` and above the drawer (`z-[60]`) so it is never clipped
 * and the drawer's own Escape handler can stand down while it is open.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

import { getShowroomPhotos } from "@/api/showrooms.functions";

type ShowroomPhotoDialogProps = {
  isOpen: boolean;
  /** Showroom name, shown above the picture. */
  title: string;
  /** "Showroom photo" / "CCTV photo" / … */
  subtitle?: string | undefined;
  /** Instant picture: a thumb URL or a local object URL. */
  src: string | null;
  /** When set, the full-size signed URL is fetched on open. */
  showroomId?: number | undefined;
  onClose: () => void;
};

export function ShowroomPhotoDialog({
  isOpen,
  title,
  subtitle,
  src,
  showroomId,
  onClose,
}: ShowroomPhotoDialogProps) {
  const [fullSrc, setFullSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The caller's handler is an inline arrow; keep the key listener stable so a
  // background re-render cannot steal focus back to Close.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Load the full-size link once per open; the thumb is already on screen.
  useEffect(() => {
    if (!isOpen || showroomId == null) {
      setFullSrc(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getShowroomPhotos({ showroomId })
      .then((photos) => {
        if (!cancelled) setFullSrc(photos.showroom?.url ?? null);
      })
      .catch(() => {
        if (!cancelled) setFullSrc(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, showroomId]);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Keep the key away from the drawer underneath.
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const shown = fullSrc ?? src;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/80 p-4 backdrop-blur-sm animate-[fadeIn_.15s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title}${subtitle ? ` — ${subtitle}` : ""}`}
    >
      <div
        className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3 text-white">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            {subtitle ? <p className="text-xs text-white/70">{subtitle}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={onClose}
            aria-label="Close photo preview"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 place-items-center overflow-hidden rounded-xl bg-black/30">
          {shown ? (
            <img
              src={shown}
              alt={`${title} — ${subtitle ?? "photo"}`}
              className="max-h-[78vh] w-auto max-w-full object-contain"
            />
          ) : (
            <div className="grid h-64 w-full place-items-center text-white/70">
              {loading ? (
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              ) : (
                <span className="text-sm">This photo could not be loaded.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
