import { CheckCircle2, Clock3 } from "lucide-react";

import { AttachmentCard } from "@/components/common/AttachmentCard";
import type { ObForm } from "@/shared/types";

/**
 * The approval-slip attachment for an OB form: the shared upload/view/remove
 * card plus the approval bits the DTR doesn't have — a status badge and the
 * single "Approved" checkbox (auto-ticked when a slip is uploaded). Ticking
 * it also drives the form's "Approved via Viber" note; the separate form
 * checkbox was removed as a duplicate.
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
    // This tick is the approval trail now: it drives both marks — the card
    // badge and the "Approved via Viber" note on the form/preview.
    setForm({ ...form, attachment_approved: checked, approved_via_viber: checked });
  }

  return (
    <AttachmentCard
      kind="ob"
      id={id}
      file={attachment}
      canEdit={canEdit}
      onUploaded={() => {
        // An uploaded slip IS the approval — tick both marks automatically so
        // nobody confirms the same thing twice. The box stays toggleable for
        // the odd slip that shouldn't count yet.
        setForm({ ...form, attachment_approved: true, approved_via_viber: true });
        onUploaded();
      }}
      onRemoved={() => {
        // The server cleared the approval along with the file — keep local
        // state in step so the next auto-save can't resurrect it (or the
        // "Approved via Viber" note that now follows it).
        if (form.attachment_approved || form.approved_via_viber) {
          setForm({ ...form, attachment_approved: false, approved_via_viber: false });
        }
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
