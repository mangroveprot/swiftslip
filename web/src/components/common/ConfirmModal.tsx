import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * Plain confirmation modal — the inventory "Delete assets?" warning look
 * (dimmed overlay, centered card, Cancel + red confirm), shared so the
 * sign-out warning is literally the same component: same classes, same
 * layout, same way of showing.
 *
 * Portaled to `<body>` so it's never clipped or offset when opened from
 * inside a transformed / `overflow-hidden` ancestor (the sidebar drawers).
 */
type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  /** Red confirm button label. */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * While the confirm action is in flight, the confirm button shows a spinner
   * and is disabled, and Cancel is disabled too — so the user can't dismiss a
   * slow request and keep poking at the app behind it (e.g. a laggy sign-out).
   */
  busy?: boolean;
  /** Replaces `confirmLabel` on the confirm button while `busy`. */
  busyLabel?: string;
};

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  busy = false,
  busyLabel,
}: ConfirmModalProps) {
  // Nothing to render during SSR or before the first click.
  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      // Block the overlay click while busy so a slow action can't be cancelled
      // out from under itself.
      onClick={busy ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-card text-card-foreground rounded-lg w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            className="px-4 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-70 disabled:cursor-not-allowed"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {busyLabel ?? confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
