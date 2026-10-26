import { ApprovedStamp } from "@/components/common/ApprovedStamp";
import { AttachmentCard } from "@/components/common/AttachmentCard";
import type { OtForm } from "@swiftslip/shared/types";

/**
 * The approval-slip attachment for an Overtime form — the COS/OB card's twin:
 * an uploaded slip IS the approval, so an upload ticks both marks
 * (`attachment_approved` and the "Approved via Viber" note) and removing the
 * file clears them again. The seal follows the OB treatment: it sits on the
 * card's quiet corner, and beside the uploader while there is no slip.
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
      // Green once approved, red while the slip (or the tick) is still missing.
      // Laid on the card rather than in the header, with the file row leaving
      // that corner free so the mark never covers the action buttons.
      stamp={<ApprovedStamp approved={Boolean(attachment) && approved} />}
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
