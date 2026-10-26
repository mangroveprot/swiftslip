import { useLayoutEffect, useRef, useState } from "react";
import { Loader2, PencilLine, Sparkles, X } from "lucide-react";

import { writeCosReason } from "@/api/cos.functions";
import { AiMascot } from "@/components/common/AiMascot";
import { toast } from "@/lib/toast";
import type { CosForm } from "@/shared/types";

/** The two boxes on the template, in template order. */
const CHANGE_TYPES = [
  { value: "shift", label: "Shift Schedule" },
  { value: "rest_day", label: "Rest Day" },
] as const;

/**
 * The red asterisk on a label the printed sheet needs. Purely a mark: the form
 * still saves a half-filled draft (the sheet prints what's there), so this says
 * what the paper form expects without blocking anything.
 */
function Req() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

/**
 * The top of the COS sheet: the employee identity block and the two header
 * boxes — Date Filed and the change type. The four identity values are the
 * paper form's header boxes as underline inputs, the way the OB sheet draws
 * them, and each one stays editable (`canEdit` gates it): the profile only
 * seeds a new form. The editor supplies the sheet around this and the rules
 * between its blocks.
 */
export function CosFormFields({
  form,
  setForm,
  canEdit,
}: {
  form: CosForm;
  setForm: (form: CosForm) => void;
  canEdit: boolean;
}) {
  const patch = (next: Partial<CosForm>) => setForm({ ...form, ...next });

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
        <Identity
          required
          label="ID Number"
          value={form.id_number}
          disabled={!canEdit}
          onChange={(v) => patch({ id_number: v })}
        />
        <Identity
          required
          label="Employee Name"
          value={form.employee_name}
          disabled={!canEdit}
          onChange={(v) => patch({ employee_name: v })}
        />
        <Identity
          required
          label="Plant / Location"
          value={form.plant_location}
          disabled={!canEdit}
          onChange={(v) => patch({ plant_location: v })}
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
        <div className="grid items-end gap-4 @md:grid-cols-2">
          <Field
            required
            label="Date Filed"
            type="date"
            value={form.date_filed}
            disabled={!canEdit}
            onChange={(v) => patch({ date_filed: v })}
          />

          {/* ☐ Shift Schedule   ☐ Rest Day — single choice. */}
          <fieldset>
            <legend className="lbl">
              Change of Work Schedule
              <Req />
            </legend>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 pt-0.5">
              {CHANGE_TYPES.map((type) => (
                <label
                  key={type.value}
                  className="flex cursor-pointer items-center gap-1.5 text-sm"
                >
                  <input
                    type="radio"
                    name="cos-change-type"
                    className="size-3.5 accent-primary"
                    disabled={!canEdit}
                    checked={form.change_type === type.value}
                    onChange={() => patch({ change_type: type.value })}
                  />
                  {type.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}

/**
 * The lower half of the COS sheet — the reason and the three sign-off boxes
 * the paper form prints under it. The editor puts the schedule block between
 * this and the header block, then the employee signature below it.
 */
export function CosReasonAndApprovals({
  form,
  setForm,
  canEdit,
}: {
  form: CosForm;
  setForm: (form: CosForm) => void;
  canEdit: boolean;
}) {
  const patch = (next: Partial<CosForm>) => setForm({ ...form, ...next });

  return (
    <div>
      <ReasonField
        value={form.reasons}
        disabled={!canEdit}
        onChange={(v) => patch({ reasons: v })}
      />

      {/* The three sign-off blocks the sheet prints under the reason. */}
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <Field
          label="Approved by"
          placeholder="Immediate Superior"
          value={form.approved_by}
          disabled={!canEdit}
          onChange={(v) => patch({ approved_by: v })}
        />
        <Field
          label="Received by"
          value={form.received_by}
          disabled={!canEdit}
          onChange={(v) => patch({ received_by: v })}
        />
        <Field
          label="Processed by"
          placeholder="Payroll Team"
          value={form.processed_by}
          disabled={!canEdit}
          onChange={(v) => patch({ processed_by: v })}
        />
      </div>
    </div>
  );
}

/**
 * One identity value: the label with an underline input beneath it, so a filled
 * and an empty cell read like the paper sheet's header instead of a box dropped
 * into the form.
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
  onChange: (v: string) => void;
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
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Field({
  label,
  value,
  disabled,
  required = false,
  type = "text",
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  type?: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="lbl">
        {label}
        {required ? <Req /> : null}
      </span>
      <input
        className="inp"
        type={type}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * The Reason/s for Change of Schedule field with the same two AI helpers the OB
 * Purpose field has:
 *  - Generate: the user types a few notes/instructions and the AI writes a short,
 *    professional reason from them.
 *  - Enhance: the AI rewrites whatever is already in the field, keeping the facts.
 * Both fall back to a clear toast if AI isn't configured or the request fails.
 */
function ReasonField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [genOpen, setGenOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | "generate" | "enhance">(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow to fit the saved text whenever the value changes (load, AI, typing).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  async function runGenerate() {
    if (!notes.trim() || busy) return;
    setBusy("generate");
    try {
      const { reason } = await writeCosReason({
        data: { mode: "generate", context: notes, current: value },
      });
      onChange(reason);
      setGenOpen(false);
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the reason.");
    } finally {
      setBusy(null);
    }
  }

  async function runEnhance() {
    if (busy) return;
    if (!value.trim()) {
      toast.error("Write a rough reason first, or use Write for me.");
      return;
    }
    setBusy("enhance");
    try {
      const { reason } = await writeCosReason({
        data: { mode: "enhance", context: "", current: value },
      });
      onChange(reason);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enhance the reason.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground/70">
          Reason/s for Change of Schedule
          <Req />
        </span>
        {!disabled ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                genOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              disabled={busy !== null}
              title="Let AI write a reason from a few notes"
              onClick={() => setGenOpen((v) => !v)}
            >
              {busy === "generate" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-3.5" aria-hidden="true" />
              )}
              Write for me
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              disabled={busy !== null}
              title="Let AI polish the current reason"
              onClick={runEnhance}
            >
              {busy === "enhance" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <PencilLine className="size-3.5" aria-hidden="true" />
              )}
              Improve wording
            </button>
          </div>
        ) : null}
      </div>

      {genOpen && !disabled ? (
        <div className="mb-2 rounded-md border border-primary/30 bg-primary/5 p-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-primary">Tell the AI what happened</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
              onClick={() => setGenOpen(false)}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <textarea
            className="inp min-h-[3.5rem] resize-none whitespace-pre-wrap"
            placeholder="e.g. holiday on Oct 7 in Dipolog City, so I need to move my shift"
            value={notes}
            autoFocus
            onChange={(ev) => setNotes(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
                ev.preventDefault();
                void runGenerate();
              }
            }}
          />
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline h-7 px-2.5 text-xs"
              onClick={() => setGenOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary h-7 gap-1 px-2.5 text-xs"
              disabled={busy !== null || !notes.trim()}
              onClick={runGenerate}
            >
              {busy === "generate" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <AiMascot size="xs" />
              )}
              Write it
            </button>
          </div>
        </div>
      ) : null}

      <textarea
        ref={ref}
        rows={1}
        className="inp resize-none overflow-hidden whitespace-pre-wrap break-words"
        style={{ minHeight: "calc(3 * 1.25rem + 0.75rem)" }}
        disabled={disabled || busy !== null}
        value={value}
        aria-label="Reason/s for Change of Schedule"
        onChange={(ev) => onChange(ev.target.value)}
      />
    </div>
  );
}
