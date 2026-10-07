import { useLayoutEffect, useRef, useState } from "react";
import { Loader2, Wand2, X } from "lucide-react";

import { writeOtReason } from "@/api/ot.functions";
import { AiMascot } from "@/components/common/AiMascot";
import { SignatureField } from "@/features/records/components/SignaturePad";
import { toast } from "@/lib/toast";
import type { OtForm } from "@/shared/types";

function Req() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

export function OtFormFields({
  form,
  setForm,
  canEdit,
  savedSignature,
}: {
  form: OtForm;
  setForm: (form: OtForm) => void;
  canEdit: boolean;
  savedSignature?: string | undefined;
}) {
  return (
    <section className="form-fill shrink-0 rounded-xl border bg-card p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Field
          required
          label="ID Number"
          value={form.id_number}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, id_number: v })}
        />
        <Field
          required
          label="Employee Name"
          value={form.employee_name}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, employee_name: v })}
        />
        <Field
          label="Date & Time Filed"
          placeholder="e.g. 10/06/2026 3:30 PM"
          value={form.date_filed}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, date_filed: v })}
        />
        <Field
          required
          label="Department / Location"
          value={form.department}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, department: v })}
        />
        <Field
          required
          label="Position"
          value={form.position}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, position: v })}
        />
      </div>

      <div className="mt-3">
        <ReasonField
          value={form.reasons}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, reasons: v })}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Field
          label="Approved by"
          placeholder="Supervisor / Department Head or Manager"
          value={form.approved_by}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, approved_by: v })}
        />
        <Field
          label="Received by"
          value={form.received_by}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, received_by: v })}
        />
        <Field
          label="Processed by"
          value={form.processed_by}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, processed_by: v })}
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
  required = false,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  required?: boolean;
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
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * The Reason for Overtime field with the same two AI helpers the OB Purpose and
 * COS Reason fields have: Generate writes one from a few notes, Enhance polishes
 * what is already there.
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
      const { reason } = await writeOtReason({
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
      const { reason } = await writeOtReason({
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
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="lbl mb-0">
          Reason for Overtime
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
            placeholder="e.g. finish month-end reports"
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
        rows={1}
        className="inp resize-none overflow-hidden whitespace-pre-wrap break-words"
        style={{ minHeight: "calc(3 * 1.25rem + 0.75rem)" }}
        disabled={disabled || busy !== null}
        value={value}
        aria-label="Reason for Overtime"
        onChange={(ev) => onChange(ev.target.value)}
      />
    </div>
  );
}
