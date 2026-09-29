import { SignatureField } from "@/features/records/components/SignaturePad";
import type { ObForm } from "@/shared/types";

export function ObFormFields({
  form,
  setForm,
  canEdit,
}: {
  form: ObForm;
  setForm: (form: ObForm) => void;
  canEdit: boolean;
}) {
  return (
    <section className="shrink-0 rounded-xl border bg-card p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Field
          label="ID Number"
          value={form.id_number}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, id_number: v })}
        />
        <Field
          label="Employee Name"
          value={form.employee_name}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, employee_name: v })}
        />
        <Field
          label="Department / Location"
          value={form.department}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, department: v })}
        />
        <Field
          label="Position"
          value={form.position}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, position: v })}
        />
        <Field
          label="Date Filed"
          type="date"
          value={form.date_filed}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, date_filed: v })}
        />
        <Field
          label="Date of OB"
          type="date"
          value={form.date_of_ob}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, date_of_ob: v })}
        />
        <label className="block sm:col-span-2 xl:col-span-1">
          <span className="lbl">Approved by (Supervisor / Dept. Head)</span>
          <div className="flex items-center gap-2">
            <input
              className="inp flex-1"
              type="text"
              disabled={!canEdit}
              value={form.approved_by}
              onChange={(e) => setForm({ ...form, approved_by: e.target.value })}
            />
            <label
              className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground"
              title='Show "Approved via Viber" on the form'
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                disabled={!canEdit}
                checked={form.approved_via_viber}
                onChange={(e) => setForm({ ...form, approved_via_viber: e.target.checked })}
              />
              Approved via Viber
            </label>
          </div>
        </label>
      </div>

      <SignatureField
        value={form.employee_signature}
        disabled={!canEdit}
        onChange={(v) => setForm({ ...form, employee_signature: v })}
      />
    </section>
  );
}

function Field({
  label,
  value,
  disabled,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <input
        className="inp"
        type={type}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
