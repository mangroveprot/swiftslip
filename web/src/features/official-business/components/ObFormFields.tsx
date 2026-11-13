import { useId } from "react";

import type { ObForm } from "@swiftslip/shared/types";

import { cn } from "@/lib/utils";
import { ObField, ObHint, Req } from "./ObSection";

/**
 * The top of the OB sheet: the employee identity block and the three dated /
 * approval fields. All four identity values, ID number, name, department and
 * position, are editable: the profile only seeds a new form, and an employee
 * correcting a stale ID or a moved office must be able to fix it on the sheet.
 */
export function ObFormFields({
  form,
  setForm,
  canEdit,
  invalid,
  hints,
}: {
  form: ObForm;
  setForm: (form: ObForm) => void;
  canEdit: boolean;
  /** Required cells the submit check found empty (from shared `ob-required`). */
  invalid?: ReadonlySet<string> | undefined;
  /** `key → instruction` for the red line under each of those cells. */
  hints?: Readonly<Record<string, string>> | undefined;
}) {
  const patch = (next: Partial<ObForm>) => setForm({ ...form, ...next });
  const hintFor = (key: string) => hints?.[key];

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
        <Identity
          required
          label="ID number"
          value={form.id_number}
          disabled={!canEdit}
          invalid={invalid?.has("id_number")}
          hint={hintFor("id_number")}
          onChange={(v) => patch({ id_number: v })}
        />
        <Identity
          required
          label="Employee name"
          value={form.employee_name}
          disabled={!canEdit}
          invalid={invalid?.has("employee_name")}
          hint={hintFor("employee_name")}
          onChange={(v) => patch({ employee_name: v })}
        />
        <Identity
          required
          label="Department / location"
          value={form.department}
          disabled={!canEdit}
          invalid={invalid?.has("department")}
          hint={hintFor("department")}
          onChange={(v) => patch({ department: v })}
        />
        <Identity
          required
          label="Position"
          value={form.position}
          disabled={!canEdit}
          invalid={invalid?.has("position")}
          hint={hintFor("position")}
          onChange={(v) => patch({ position: v })}
        />
      </div>

      <div className="mt-6 border-t pt-5">
        {/* items-start, not items-end: the red hint under one field must not
            lift that column above its neighbours. */}
        <div className="grid items-start gap-4 @md:grid-cols-3">
          <ObField
            required
            label="Date filed"
            type="date"
            value={form.date_filed}
            disabled={!canEdit}
            invalid={invalid?.has("date_filed")}
            hint={hintFor("date_filed")}
            onChange={(v) => patch({ date_filed: v })}
          />
          <ObField
            required
            label="Date of OB"
            type="date"
            value={form.date_of_ob}
            disabled={!canEdit}
            invalid={invalid?.has("date_of_ob")}
            hint={hintFor("date_of_ob")}
            onChange={(v) => patch({ date_of_ob: v })}
          />
          <ObField
            required
            label="Approved by (supervisor / dept. head)"
            value={form.approved_by}
            disabled={!canEdit}
            invalid={invalid?.has("approved_by")}
            hint={hintFor("approved_by")}
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
  invalid = false,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  /** The submit check found this required cell empty. */
  invalid?: boolean | undefined;
  /** What to do about it, shown in red under the input once it is empty. */
  hint?: string | undefined;
  onChange: (value: string) => void;
}) {
  const hintId = useId();
  return (
    <div className="block min-w-0">
      <label className="block">
        <span className="block text-[13px] font-medium text-foreground/70">
          {label}
          {required ? <Req /> : null}
        </span>
        <input
          type="text"
          className={cn(
            "mt-1.5 w-full border-0 border-b bg-transparent p-0 text-[15px] leading-snug font-semibold text-foreground outline-none transition-colors hover:border-border focus:border-primary/60 disabled:cursor-not-allowed disabled:text-muted-foreground",
            invalid ? "border-destructive/70" : "border-transparent",
          )}
          disabled={disabled}
          value={value}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <ObHint text={hint} id={hintId} />
    </div>
  );
}
