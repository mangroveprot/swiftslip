import type { ObForm } from "@/shared/types";

import { ObField, Req } from "./ObSection";

/**
 * The top of the OB sheet: the employee identity block and the three dated /
 * approval fields. All four identity values — ID number, name, department and
 * position — are editable: the profile only seeds a new form, and an employee
 * correcting a stale ID or a moved office must be able to fix it on the sheet.
 */
export function ObFormFields({
  form,
  setForm,
  canEdit,
}: {
  form: ObForm;
  setForm: (form: ObForm) => void;
  canEdit: boolean;
}) {
  const patch = (next: Partial<ObForm>) => setForm({ ...form, ...next });

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
        <Identity
          required
          label="ID number"
          value={form.id_number}
          disabled={!canEdit}
          onChange={(v) => patch({ id_number: v })}
        />
        <Identity
          required
          label="Employee name"
          value={form.employee_name}
          disabled={!canEdit}
          onChange={(v) => patch({ employee_name: v })}
        />
        <Identity
          required
          label="Department / location"
          value={form.department}
          disabled={!canEdit}
          onChange={(v) => patch({ department: v })}
        />
        <Identity
          required
          label="Position"
          value={form.position}
          disabled={!canEdit}
          onChange={(v) => patch({ position: v })}
        />
      </div>

      <div className="mt-6 border-t pt-5">
        <div className="grid items-end gap-4 @md:grid-cols-3">
          <ObField
            required
            label="Date filed"
            type="date"
            value={form.date_filed}
            disabled={!canEdit}
            onChange={(v) => patch({ date_filed: v })}
          />
          <ObField
            required
            label="Date of OB"
            type="date"
            value={form.date_of_ob}
            disabled={!canEdit}
            onChange={(v) => patch({ date_of_ob: v })}
          />
          <ObField
            required
            label="Approved by (supervisor / dept. head)"
            value={form.approved_by}
            disabled={!canEdit}
            onChange={(v) => patch({ approved_by: v })}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One identity value: the label with an underline input beneath it, so a filled
 * and an empty cell look the same as on the paper sheet instead of like a box
 * dropped into the header.
 */
function Identity({
  label,
  value,
  disabled,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[13px] font-medium text-foreground/70">
        {label}
        {required ? <Req /> : null}
      </span>
      <input
        type="text"
        className="mt-1.5 w-full border-0 border-b border-transparent bg-transparent p-0 text-[15px] leading-snug font-semibold text-foreground outline-none transition-colors hover:border-border focus:border-primary/60 disabled:cursor-not-allowed disabled:text-muted-foreground"
        disabled={disabled}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
