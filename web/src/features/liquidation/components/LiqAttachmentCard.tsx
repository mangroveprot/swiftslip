import { ApprovedStamp } from "@/components/common/ApprovedStamp";
import { AttachmentCard } from "@/components/common/AttachmentCard";
import type { LiqForm } from "@swiftslip/shared/types";

/**
 * The approval-slip attachment for a Statement of Liquidation: the shared
 * upload/view/remove card, the approval seal and the single "Approved" tick.
 * Uploading a slip IS the approval, it ticks itself and turns on the sheet's
 * blue "Approved via Viber" note, exactly like the OB form.
 */
export function LiqAttachmentCard({
  id,
  form,
  setForm,
  canEdit,
  attachment,
  onUploaded,
  onEnsureRow,
}: {
  id: string;
  form: LiqForm;
  setForm: (form: LiqForm) => void;
  canEdit: boolean;
  attachment: { name: string } | null;
  /** Ran after a successful upload so the editor can refresh the row. */
  onUploaded?: (() => void) | undefined;
  /** A draft has no id until it holds real content; resolve one before uploading. */
  onEnsureRow?: (() => Promise<string>) | undefined;
}) {
  const approved = form.attachment_approved;

  function setChecked(checked: boolean) {
    setForm({ ...form, attachment_approved: checked, approved_via_viber: checked });
  }

  return (
    <div>
      <AttachmentCard
        kind="liq"
        id={id}
        file={attachment}
        canEdit={canEdit}
        onEnsureRow={onEnsureRow}
        onUploaded={() => {
          setForm({ ...form, attachment_approved: true, approved_via_viber: true });
          onUploaded?.();
        }}
        onRemoved={() => {
          if (form.attachment_approved || form.approved_via_viber) {
            setForm({ ...form, attachment_approved: false, approved_via_viber: false });
          }
        }}
        stamp={<ApprovedStamp approved={Boolean(attachment) && approved} />}
      />

      {attachment && canEdit ? (
        <label
          className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground print:hidden"
          title='Marking this approved also checks "Approved via Viber" on the form'
        >
          <input
            type="checkbox"
            className="size-4 accent-dashboard-accent"
            checked={approved}
            onChange={(e) => setChecked(e.target.checked)}
          />
          Approved
        </label>
      ) : null}
    </div>
  );
}
