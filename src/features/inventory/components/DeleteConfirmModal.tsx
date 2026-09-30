/**
 * Delete confirmation modal — port of `DeleteConfirmModal.razor`
 * (single vs bulk copy).
 */
type DeleteConfirmModalProps = {
  isOpen: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmModal({
  isOpen,
  count,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold">Delete asset{count > 1 ? "s" : ""}?</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-600">
            {count > 1
              ? `This will permanently remove ${count} selected assets. This can't be undone.`
              : "This will permanently remove this asset. This can't be undone."}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button
            type="button"
            className="px-4 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-1.5 rounded-md text-sm bg-red-600 text-white font-medium hover:bg-red-700"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
