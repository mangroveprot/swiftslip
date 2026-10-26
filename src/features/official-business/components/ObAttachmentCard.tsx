import { ApprovedStamp } from "@/components/common/ApprovedStamp";
import { AttachmentCard } from "@/components/common/AttachmentCard";
import type { ObForm } from "@/shared/types";

/**
 * The approval-slip attachment for an OB form: the shared upload/view/remove
 * card plus the approval bits the DTR doesn't have — the seal and the single
 * "Approved" checkbox (auto-ticked when a slip is uploaded). Ticking it also
 * drives the form's "Approved via Viber" note; the separate form checkbox was
 * removed as a duplicate. The seal follows the DTR treatment: it sits *on* the
 * card, in the quiet top-right corner, and beside the uploader when there is
 * no slip yet.
 */
export function ObAttachmentCard({
  id,
  form,
  setForm,
  canEdit,
  attachment,
  onUploaded,
  onEnsureRow,
}: {
  id: string;
  form: ObForm;
  setForm: (form: ObForm) => void;
  canEdit: boolean;
  attachment: { name: string } | null;
  /** Called after a successful upload so the editor can lock the form in as kept. */
  onUploaded?: (() => void) | undefined;
  /** A draft has no id until it holds real content; resolve one before uploading. */
  onEnsureRow?: (() => Promise<string>) | undefined;
}) {
  const approved = form.attachment_approved;

  function setChecked(checked: boolean) {
    // This tick is the approval trail now: it drives both the seal on this
    // card and the "Approved via Viber" note on the form/preview.
    setForm({ ...form, attachment_approved: checked, approved_via_viber: checked });
  }

  return (
    <div>
      <AttachmentCard
        kind="ob"
        onEnsureRow={onEnsureRow}
        id={id}
        file={attachment}
        canEdit={canEdit}
        onUploaded={() => {
          // An uploaded slip IS the approval — tick both marks automatically so
          // nobody confirms the same thing twice. The box stays toggleable for
          // the odd slip that shouldn't count yet.
          setForm({ ...form, attachment_approved: true, approved_via_viber: true });
          onUploaded?.();
        }}
        onRemoved={() => {
          // The server cleared the approval along with the file — keep local
          // state in step so the next auto-save can't resurrect it (or the
          // "Approved via Viber" note that now follows it).
          if (form.attachment_approved || form.approved_via_viber) {
            setForm({ ...form, attachment_approved: false, approved_via_viber: false });
          }
        }}
        // The seal carries the whole status: green once approved, red when the
        // slip (or the tick) is still missing. It is a mark *on* the card, so it
        // is lifted out of the header into the top-right corner; the file row
        // gives that corner up so the mark never covers the action buttons.
        stamp={<ApprovedStamp approved={Boolean(attachment) && approved} />}
      />

      {/* Below the card, as on the paper form: the tick is part of the Approval
          section, not another line inside the upload box. */}
      {attachment && canEdit ? (
        <label
          className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground print:hidden"
          title='Marking this approved also checks "Approved via Viber" on the form'
        >
          <input
            type="checkbox"
            className="size-4 accent-[#2f9e44]"
            checked={approved}
            onChange={(e) => setChecked(e.target.checked)}
          />
          Approved
        </label>
      ) : null}
    </div>
  );
}
