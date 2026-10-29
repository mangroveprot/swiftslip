import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { RetentionPreview } from "@swiftslip/shared/schemas";

import { FORM_TYPE_LABELS } from "./form-types";

/**
 * The last "are you sure?" before rows and files disappear for good. It
 * repeats exactly what the preview counted — same numbers, one more time at
 * the point of no return — and says the two things that matter: approval is
 * still respected, and deletion cannot be undone.
 */
export function RetentionConfirmDialog({
  open,
  onOpenChange,
  preview,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: RetentionPreview;
  busy?: boolean;
  onConfirm: () => void;
}) {
  // `types` carries every type; only the ticked ones are actually going.
  const perType = preview.types
    .filter((entry) => entry.forms > 0 && preview.chosen.includes(entry.type))
    .map((entry) => `${FORM_TYPE_LABELS[entry.type]}: ${entry.forms}`)
    .join(" · ");

  const description = [
    `This permanently deletes ${preview.totalForms} form${preview.totalForms === 1 ? "" : "s"} and ${preview.totalFiles} attached file${preview.totalFiles === 1 ? "" : "s"} kept for more than ${preview.days} day${preview.days === 1 ? "" : "s"}.`,
    perType ? `By type — ${perType}.` : null,
    "Forms still waiting for approval are never touched. This cannot be undone.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Run the cleanup now?"
      description={description}
      confirmLabel="Delete permanently"
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
