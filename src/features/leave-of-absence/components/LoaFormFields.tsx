import { useLayoutEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Wand2, X } from "lucide-react";

import { writeLoaReason } from "@/api/loa.functions";
import { SignatureField } from "@/features/records/components/SignaturePad";
import { toast } from "@/lib/toast";
import type { LoaForm } from "@/shared/types";
import { recomputeDerived } from "../lib/dates";

/** The boxes on the template, in template order. */
const LEAVE_TYPES = [
  "Vacation Leave",
  "Maternity Leave",
  "Emergency Leave",
  "Sick Leave",
  "Paternity Leave",
  "Bereavement Leave",
  "Others",
] as const;

export function LoaFormFields({
  form,
  setForm,
  canEdit,
  savedSignature,
}: {
  form: LoaForm;
  setForm: (form: LoaForm) => void;
  canEdit: boolean;
  /** Profile signature, offered in the signature dialog as a one-click re-use. */
  savedSignature?: string | undefined;
}) {
  // Both dates present and From after To — the preview keeps showing what is
  // typed (no silent swap); the fields just refuse to compute from the bad range.
  const rangeInvalid = Boolean(form.date_from && form.date_to && form.date_from > form.date_to);

  /**
   * A date edit re-derives the computed prefill: Number of Days Applied
   * (inclusive, Sundays out) and the report-back day. An inverted range keeps
   * the previous values (with the warning below); a half-cleared range clears
   * them — they had no anchor left.
   */
  function updateDates(patch: Partial<Pick<LoaForm, "date_from" | "date_to">>) {
    setForm(recomputeDerived({ ...form, ...patch }));
  }

  return (
    <section className="loa-card shrink-0 rounded-2xl border bg-card p-4 shadow-sm">
      {/* Title row — every box on this form carries one, in the same style the
          other cards on the page use, so the form reads as a labelled box
          rather than a bare field grid. */}
      <div className="mb-2.5">
        <p className="lbl">Leave details</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

        {/* Inclusive dates + the computed-but-editable day count. */}
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
          <Field
            label="Inclusive Dates — From"
            type="date"
            value={form.date_from}
            disabled={!canEdit}
            onChange={(v) => updateDates({ date_from: v })}
          />
          <Field
            label="Inclusive Dates — To"
            type="date"
            value={form.date_to}
            disabled={!canEdit}
            onChange={(v) => updateDates({ date_to: v })}
          />
        </div>
        <label className="block">
          <span className="lbl">Number of Days Applied</span>
          <input
            className="inp"
            type="text"
            disabled={!canEdit}
            placeholder="e.g. 2 or 4 hours"
            value={form.days_applied}
            onChange={(e) => setForm({ ...form, days_applied: e.target.value })}
          />
          {rangeInvalid ? (
            <span className="mt-1 block text-xs text-destructive">
              The From date is after the To date — check the range.
            </span>
          ) : null}
        </label>

        {/* KINDLY MARK APPROPRIATE BOX — single choice. */}
        <fieldset className="sm:col-span-2 xl:col-span-3">
          <legend className="lbl">Kindly mark appropriate box</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {LEAVE_TYPES.map((type) => (
              <label key={type} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="loa-leave-type"
                  className="size-3.5 accent-primary"
                  disabled={!canEdit}
                  checked={form.leave_type === type}
                  onChange={() => setForm({ ...form, leave_type: type })}
                />
                {type}
              </label>
            ))}
          </div>
          {form.leave_type === "Others" ? (
            <input
              className="inp mt-2"
              type="text"
              disabled={!canEdit}
              placeholder="Specify the leave type"
              aria-label="Others — specify the leave type"
              value={form.leave_type_other}
              onChange={(e) => setForm({ ...form, leave_type_other: e.target.value })}
            />
          ) : null}
        </fieldset>

        {/* ( ) w/ PAY  ( ) w/o PAY — single choice. */}
        <fieldset>
          <legend className="lbl">Pay</legend>
          <div className="flex flex-wrap gap-x-10 gap-y-1.5">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="loa-pay-status"
                className="size-3.5 accent-primary"
                disabled={!canEdit}
                checked={form.pay_status === "with_pay"}
                onChange={() => setForm({ ...form, pay_status: "with_pay" })}
              />
              w/ PAY
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="loa-pay-status"
                className="size-3.5 accent-primary"
                disabled={!canEdit}
                checked={form.pay_status === "without_pay"}
                onChange={() => setForm({ ...form, pay_status: "without_pay" })}
              />
              w/o PAY
            </label>
          </div>
        </fieldset>

        <Field
          label="To report back for work on"
          type="date"
          value={form.report_back_date}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, report_back_date: v })}
        />
        <Field
          label="Approved by (Supervisor / Dept. Head)"
          value={form.approved_by}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, approved_by: v })}
        />

        {/* Approval lives on the approval attachment, OB-style (upload ticks
            it, removal clears it) — the form carries no widget for it. */}
        <ReasonField
          value={form.reasons}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, reasons: v })}
        />
      </div>

      <SignatureField
        value={form.employee_signature}
        disabled={!canEdit}
        savedSignature={savedSignature}
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

/**
 * The Reasons / Remarks field with two AI helpers:
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
      const { reason } = await writeLoaReason({
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
      toast.error("Write a rough reason first, or use Generate.");
      return;
    }
    setBusy("enhance");
    try {
      const { reason } = await writeLoaReason({
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
    <div className="sm:col-span-2 xl:col-span-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="lbl mb-0">Reasons / Remarks</span>
        {!disabled ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`btn btn-outline h-6 gap-1 px-2 text-[11px] ${genOpen ? "bg-primary/10 text-primary" : ""}`}
              disabled={busy !== null}
              title="Let AI write a reason from a few notes"
              onClick={() => setGenOpen((v) => !v)}
            >
              {busy === "generate" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-3.5" aria-hidden="true" />
              )}
              Generate
            </button>
            <button
              type="button"
              className="btn btn-outline h-6 gap-1 px-2 text-[11px]"
              disabled={busy !== null}
              title="Let AI polish the current reason"
              onClick={runEnhance}
            >
              {busy === "enhance" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="size-3.5" aria-hidden="true" />
              )}
              Enhance
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
            placeholder="e.g. flu for two days, already saw a doctor and was advised to rest"
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
                <Sparkles className="size-3.5" aria-hidden="true" />
              )}
              Generate
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
        aria-label="Reasons / Remarks"
        onChange={(ev) => onChange(ev.target.value)}
      />
    </div>
  );
}
