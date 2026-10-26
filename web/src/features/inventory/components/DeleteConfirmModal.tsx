import { ConfirmModal } from "@/components/common/ConfirmModal";

/**
 * Delete confirmation modal — port of `DeleteConfirmModal.razor`
 * (single vs bulk copy). Thin wrapper over the shared `ConfirmModal` so the
 * asset-delete warning and the sign-out warning are the exact same look.
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
  return (
    <ConfirmModal
      isOpen={isOpen}
      title={`Delete asset${count > 1 ? "s" : ""}?`}
      message={
        count > 1
          ? `This will permanently remove ${count} selected assets. This can't be undone.`
          : "This will permanently remove this asset. This can't be undone."
      }
      confirmLabel="Delete"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
