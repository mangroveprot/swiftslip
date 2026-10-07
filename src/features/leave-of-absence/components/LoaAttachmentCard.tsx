import { Clock3 } from "lucide-react";

import { ApprovedBadge } from "@/components/common/ApprovedBadge";
import { AttachmentCard } from "@/components/common/AttachmentCard";
import type { LoaForm } from "@/shared/types";

/**
 * The approval attachment for an LOA form — the OB card's behaviour in full:
 * the uploaded file IS the approval, so an upload ticks both marks
 * (`attachment_approved` and the "Approved via Viber" note) and removing the
 * file clears them again. The status badge and the "Approved" toggle live
 * here; the form itself carries no approval widget anymore.
 */
export function LoaAttachmentCard({
  id,
  form,
  setForm,
  canEdit,
  attachment,
  onUploaded,
}: {
  id: string;
  form: LoaForm;
  setForm: (form: LoaForm) => void;
  canEdit: boolean;
  attachment: { name: string } | null;
  /** Called after a successful upload so the editor can lock the form in as kept. */
  onUploaded: () => void;
}) {
  const approved = form.attachment_approved;

  function setChecked(checked: boolean) {
    // This tick is the approval trail: it drives both marks — the card badge
    // and the "Approved via Viber" note on the form, list and printed sheet.
    setForm({ ...form, attachment_approved: checked, approved_via_viber: checked });
  }

  return (
    <AttachmentCard
      kind="loa"
      id={id}
      // Same shell as the LOA's other boxes — the right column keeps its own
      // two pieces (attachment card, then live preview), just restyled.
      cardClassName="form-fill shrink-0 rounded-2xl border bg-card p-4 shadow-sm"
      file={attachment}
      canEdit={canEdit}
      onUploaded={() => {
        // An uploaded approval attachment IS the approval — tick both marks
        // automatically so nobody confirms the same thing twice. The box stays
        // toggleable for the odd file that shouldn't count yet.
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
