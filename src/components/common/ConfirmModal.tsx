import { createPortal } from "react-dom";

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
};

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Nothing to render during SSR or before the first click.
  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-lg w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-600">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button
            type="button"
            className="px-4 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-50"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="px-4 py-1.5 rounded-md text-sm bg-red-600 text-white font-medium hover:bg-red-700"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
