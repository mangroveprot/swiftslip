import { useLayoutEffect, useRef, useState } from "react";
import { Check, Loader2, Wand2, X } from "lucide-react";

import { writeLoaReason } from "@/api/loa.functions";
import { AiMascot } from "@/components/common/AiMascot";
import { SignatureField } from "@/features/records/components/SignaturePad";
import { toast } from "@/lib/toast";
import { formatMonthDayYear } from "@/shared/period";
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

/**
 * The red asterisk on a label that has to be filled in. Purely a mark: the form
 * still saves a half-filled draft (the sheet just prints what's there), so this
 * says what the paper form needs without blocking anything.
 */
function Req() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

/**
 * The boxes the printed sheet can't do without, in form order. The heading line
 * lists the empty ones so the red asterisks say something actionable instead of
 * just decorating: click a name and the caret lands in that box.
 *
 * "Number of Days Applied" and "To report back for work on" are left out — they
 * are computed from the dates, so they're filled (or listed) through the range.
 */
const REQUIRED_BOXES: { label: string; id: string; filled: (form: LoaForm) => boolean }[] = [
  { label: "ID Number", id: "loa-id_number", filled: (f) => !!f.id_number.trim() },
  { label: "Employee Name", id: "loa-employee_name", filled: (f) => !!f.employee_name.trim() },
  { label: "Department / Location", id: "loa-department", filled: (f) => !!f.department.trim() },
  { label: "Position", id: "loa-position", filled: (f) => !!f.position.trim() },
  { label: "Date Filed", id: "loa-date_filed", filled: (f) => !!f.date_filed },
  {
    label: "Inclusive Dates",
    id: "loa-date_from",
    filled: (f) => !!f.date_from && !!f.date_to,
  },
  {
    label: "Leave type",
    id: "loa-leave_type",
    filled: (f) => !!f.leave_type && (f.leave_type !== "Others" || !!f.leave_type_other.trim()),
  },
  { label: "Pay", id: "loa-pay", filled: (f) => !!f.pay_status },
  { label: "Return date", id: "loa-report_back_date", filled: (f) => !!f.report_back_date },
  { label: "Approved by", id: "loa-approved_by", filled: (f) => !!f.approved_by.trim() },
  { label: "Reasons / Remarks", id: "loa-reasons", filled: (f) => !!f.reasons.trim() },
  { label: "Employee signature", id: "loa-signature", filled: (f) => !!f.employee_signature },
];

/** Put the caret in a box the heading line names, scrolling it into view. */
function focusBox(id: string) {
  const box = document.getElementById(id);
  if (!box) return;
  box.scrollIntoView({ block: "center" });
  const first = box.matches("input, textarea, button")
    ? box
    : box.querySelector<HTMLElement>("input, textarea, button");
  first?.focus();
}

/**
 * The leave in one line: what kind, when, how long, paid or not, and the day
 * back at work. Only the parts that are actually filled in, so a blank form
 * shows nothing at all.
 */
function leaveSummary(form: LoaForm): string[] {
  const others = form.leave_type_other.trim();
  const type =
    form.leave_type === "Others"
      ? [form.leave_type, others].filter(Boolean).join(" — ")
      : form.leave_type;

  const period =
    form.date_from && form.date_to
      ? `${formatMonthDayYear(form.date_from)} – ${formatMonthDayYear(form.date_to)}`
      : formatMonthDayYear(form.date_from || form.date_to);

  const applied = form.days_applied.trim();
  const days = /^\d+$/.test(applied) ? `${applied} day${applied === "1" ? "" : "s"}` : applied;

  const pay =
    form.pay_status === "with_pay"
      ? "with pay"
      : form.pay_status === "without_pay"
        ? "without pay"
        : "";

  const back = form.report_back_date ? `back ${formatMonthDayYear(form.report_back_date)}` : "";

  return [type, period, days, pay, back].filter(Boolean);
}

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
  const needs = REQUIRED_BOXES.filter((box) => !box.filled(form));
  const summary = leaveSummary(form);

  /**
   * A date edit re-derives the computed prefill: Number of Days Applied
   * (inclusive, Sundays out) and the report-back day. An inverted range keeps
   * the previous values (with the warning below); a half-cleared range clears
   * them — they had no anchor left.
   *
   * Filling in the first date of a range that has no end date yet treats it as
   * a same-day leave, so the day count and the return date settle immediately
   * instead of staying blank until a second date is typed. Clearing the end
   * date afterwards still leaves it empty — only a fresh first date does this.
   */
  function updateDates(patch: Partial<Pick<LoaForm, "date_from" | "date_to">>) {
    const next = { ...form, ...patch };
    if (patch.date_from && !form.date_from && !next.date_to) next.date_to = patch.date_from;
    setForm(recomputeDerived(next));
  }

  return (
    <section className="form-fill shrink-0 rounded-2xl border bg-card p-4 shadow-sm">
      {/* Title row — every box on this form carries one, in the same style the
          other cards on the page use, so the form reads as a labelled box
          rather than a bare field grid. The right half is the form's status:
          which boxes are still empty, or that none are. */}
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="lbl">Leave details</p>
        {needs.length ? (
          <p className="text-xs text-muted-foreground">
            Still needed:{" "}
            {needs.map((box, i) => (
              <span key={box.id}>
                {i > 0 ? ", " : ""}
                <button
                  type="button"
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  onClick={() => focusBox(box.id)}
                >
                  {box.label}
                </button>
              </span>
            ))}
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" aria-hidden="true" />
            Every box the sheet needs is filled in
          </p>
        )}
      </div>

      {/* The leave in one line, for reading instead of hunting: type, dates,
          length, pay, and the day back at work. */}
      {summary.length ? (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 border-y py-1.5 text-xs text-muted-foreground">
          {summary.map((part, i) => (
            <span key={part} className={i === 0 ? "font-medium text-foreground" : undefined}>
              {i > 0 ? (
                <span aria-hidden="true" className="mr-2 opacity-40">
                  |
                </span>
              ) : null}
              {part}
            </span>
          ))}
        </p>
      ) : null}
      {/* Four columns in the sheet's own order — row 1 is ID / Name / Department
          (double width), row 2 the filing context and the inclusive range, row
          3 the remaining boxes. The column count follows THIS panel's width, not
          the window's: the live preview keeps a fixed slice of the screen, so a
          viewport breakpoint would squeeze four fields into a narrow strip. */}
      <div className="grid gap-3 @min-[26rem]:grid-cols-2 @min-[44rem]:grid-cols-4">
        <Field
          required
          id="loa-id_number"
          label="ID Number"
          value={form.id_number}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, id_number: v })}
        />
        <Field
          required
          id="loa-employee_name"
          label="Employee Name"
          value={form.employee_name}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, employee_name: v })}
        />
        <Field
          required
          id="loa-department"
          className="@min-[26rem]:col-span-2"
          label="Department / Location"
          value={form.department}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, department: v })}
        />
        <Field
          required
          id="loa-position"
          label="Position"
          value={form.position}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, position: v })}
        />
        <Field
          required
          id="loa-date_filed"
          label="Date Filed"
          type="date"
          value={form.date_filed}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, date_filed: v })}
        />

        {/* Inclusive dates; the computed-but-editable day count follows. */}
        <Field
          required
          id="loa-date_from"
          invalid={rangeInvalid}
          label="Inclusive Dates — From"
          type="date"
          value={form.date_from}
          disabled={!canEdit}
          onChange={(v) => updateDates({ date_from: v })}
        />
        <Field
          required
          id="loa-date_to"
          invalid={rangeInvalid}
          label="Inclusive Dates — To"
          type="date"
          value={form.date_to}
          disabled={!canEdit}
          onChange={(v) => updateDates({ date_to: v })}
        />
        <label className="block">
          <span className="lbl">
            Number of Days Applied
            <Req />
          </span>
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

        {/* ( ) w/ PAY  ( ) w/o PAY — single choice. */}
        <fieldset id="loa-pay">
          <legend className="lbl">
            Pay
            <Req />
          </legend>
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
          required
          id="loa-report_back_date"
          label="To report back for work on"
          type="date"
          value={form.report_back_date}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, report_back_date: v })}
        />
        <Field
          required
          id="loa-approved_by"
          label="Approved by (Supervisor / Dept. Head)"
          value={form.approved_by}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, approved_by: v })}
        />

        {/* KINDLY MARK APPROPRIATE BOX — single choice. It sits under the rows of
            boxes so all seven options fit on one line wherever there's width. */}
        <fieldset id="loa-leave_type" className="@min-[26rem]:col-span-2 @min-[44rem]:col-span-4">
          <legend className="lbl">
            Kindly mark appropriate box
            <Req />
          </legend>
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

        {/* Approval lives on the approval attachment, OB-style (upload ticks
            it, removal clears it) — the form carries no widget for it. */}
        <ReasonField
          value={form.reasons}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, reasons: v })}
        />
      </div>

      <div id="loa-signature">
        <SignatureField
          required
          value={form.employee_signature}
          disabled={!canEdit}
          savedSignature={savedSignature}
          onChange={(v) => setForm({ ...form, employee_signature: v })}
        />
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  disabled,
  required = false,
  invalid = false,
  id,
  className,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  /**
   * Marks the box as the one the warning below is about. The card's own rule
   * keeps input borders transparent, so the red edge has to be inline to show.
   */
  invalid?: boolean;
  /** Where the heading line's "still needed" links jump to. */
  id?: string;
  /** Extra classes on the wrapping label — the grid spans ride on it. */
  className?: string;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="lbl">
        {label}
        {required ? <Req /> : null}
      </span>
      <input
        id={id}
        className="inp"
        type={type}
        disabled={disabled}
        value={value}
        aria-invalid={invalid || undefined}
        style={invalid ? { borderColor: "var(--color-destructive)" } : undefined}
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
    <div className="@min-[26rem]:col-span-2 @min-[44rem]:col-span-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="lbl mb-0">
          Reasons / Remarks
          <Req />
        </span>
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
                <AiMascot size="xs" />
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
                <AiMascot size="xs" />
              )}
              Generate
            </button>
          </div>
        </div>
      ) : null}

      <textarea
        ref={ref}
        id="loa-reasons"
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
