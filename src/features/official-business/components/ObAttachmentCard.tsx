import { CheckCircle2, Clock3 } from "lucide-react";

import { AttachmentCard } from "@/components/common/AttachmentCard";
import type { ObForm } from "@/shared/types";

/**
 * The approval-slip attachment for an OB form: the shared upload/view/remove
 * card plus the approval bits the DTR doesn't have — a status badge and an
 * "Approved" checkbox that also ticks "Approved via Viber" on the form.
 */
export function ObAttachmentCard({
  id,
  form,
  setForm,
  canEdit,
  attachment,
  onUploaded,
}: {
  id: string;
  form: ObForm;
  setForm: (form: ObForm) => void;
  canEdit: boolean;
  attachment: { name: string } | null;
  /** Called after a successful upload so the editor can lock the form in as kept. */
  onUploaded: () => void;
}) {
  const approved = form.attachment_approved;

  function setChecked(checked: boolean) {
    // Approving the attachment also ticks "Approved via Viber" — that is exactly
    // the approval trail the note describes.
    setForm({
      ...form,
      attachment_approved: checked,
      ...(checked ? { approved_via_viber: true } : {}),
    });
  }

  return (
    <AttachmentCard
      kind="ob"
      id={id}
      file={attachment}
      canEdit={canEdit}
      onUploaded={onUploaded}
      onRemoved={() => {
        // The server cleared the approval along with the file — keep local state
        // in step so the next auto-save can't resurrect it.
        if (form.attachment_approved) setForm({ ...form, attachment_approved: false });
      }}
      badge={
        attachment ? (
          approved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Approved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Clock3 className="size-3.5" aria-hidden="true" />
              Not approved
            </span>
          )
        ) : null
      }
    >
      {attachment && canEdit ? (
        <label
          className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
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
