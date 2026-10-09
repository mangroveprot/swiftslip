import { Clock3 } from "lucide-react";

import { ApprovedBadge } from "@/components/common/ApprovedBadge";
import { AttachmentCard } from "@/components/common/AttachmentCard";
import type { OtForm } from "@/shared/types";

/**
 * The approval-slip attachment for an Overtime form — the COS/OB card's twin:
 * an uploaded slip IS the approval, so an upload ticks both marks
 * (`attachment_approved` and the "Approved via Viber" note) and removing the
 * file clears them again.
 */
export function OtAttachmentCard({
  id,
  form,
  setForm,
  canEdit,
  attachment,
  onUploaded,
  onEnsureRow,
}: {
  id: string;
  form: OtForm;
  setForm: (form: OtForm) => void;
  canEdit: boolean;
  attachment: { name: string } | null;
  onUploaded?: (() => void) | undefined;
  /** A draft has no id until it holds real content; resolve one before uploading. */
  onEnsureRow?: (() => Promise<string>) | undefined;
}) {
  const approved = form.attachment_approved;

  function setChecked(checked: boolean) {
    setForm({ ...form, attachment_approved: checked, approved_via_viber: checked });
  }

  return (
    <AttachmentCard
      kind="ot"
      onEnsureRow={onEnsureRow}
      id={id}
      file={attachment}
      canEdit={canEdit}
      onUploaded={() => {
        setForm({ ...form, attachment_approved: true, approved_via_viber: true });
        onUploaded?.();
      }}
      onRemoved={() => {
        // The server cleared the approval along with the file — keep local state
        // in step so the next auto-save can't resurrect it.
        if (form.attachment_approved || form.approved_via_viber) {
          setForm({ ...form, attachment_approved: false, approved_via_viber: false });
        }
      }}
      badge={
        attachment ? (
          approved ? (
            <ApprovedBadge approved />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Clock3 className="size-3.5" aria-hidden="true" />
              Not approved
            </span>
          )
        ) : (
          <ApprovedBadge approved={false} />
        )
      }
    >
      {attachment && canEdit ? (
        <label
          className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground print:hidden"
          title='Marking this approved also checks "Approved via Viber" on the form'
        >
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={approved}
            onChange={(e) => setChecked(e.target.checked)}
          />
          Approved
        </label>
      ) : null}
    </AttachmentCard>
  );
}
