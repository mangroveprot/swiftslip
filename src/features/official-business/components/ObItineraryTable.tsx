import { useLayoutEffect, useRef, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";

import { writeObPurpose } from "@/api/official-business.functions";
import { toast } from "@/lib/toast";
import type { ObEntry } from "@/shared/types";

const EMPTY_ROW: Omit<ObEntry, "idx"> = {
  from_place: "",
  to_place: "",
  purpose: "",
  time_departure: "",
  time_return: "",
};

export function ObItineraryTable({
  rows,
  setRows,
  canEdit,
  busy,
}: {
  rows: ObEntry[];
  setRows: (rows: ObEntry[]) => void;
  canEdit: boolean;
  busy: boolean;
}) {
  function reindex(next: Omit<ObEntry, "idx">[]): ObEntry[] {
    return next.map((r, idx) => ({ idx, ...r }));
  }

  function update(idx: number, patch: Partial<ObEntry>) {
    setRows(rows.map((r) => (r.idx === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows([...rows, { idx: rows.length, ...EMPTY_ROW }]);
  }

  function removeRow(idx: number) {
    setRows(reindex(rows.filter((r) => r.idx !== idx)));
  }

  return (
    <section className="flex min-h-0 flex-col rounded-xl border bg-card p-3 shadow-sm lg:flex-1 lg:overflow-hidden">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Itinerary / Destination</h2>
        {canEdit ? (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={addRow}>
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add stop</span>
          </button>
        ) : null}
      </div>

      <div className="min-h-0 space-y-3 lg:flex-1 lg:overflow-auto">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/50 px-4 py-8 text-center text-xs text-muted-foreground">
            No stops yet — click “Add stop” to add the first destination.
          </div>
        ) : (
          rows.map((row, i) => (
            <div
              key={row.idx}
              className="rounded-lg border bg-background p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  Stop {i + 1}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn-outline size-7 p-0 text-destructive"
                    disabled={busy}
                    aria-label={`Remove stop ${i + 1}`}
                    title="Remove stop"
                    onClick={() => removeRow(row.idx)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="lbl">From</span>
                  <AutoTextarea
                    value={row.from_place}
                    disabled={!canEdit}
                    ariaLabel="From"
                    onChange={(v) => update(row.idx, { from_place: v })}
                  />
                </label>
                <label className="block">
                  <span className="lbl">To</span>
                  <AutoTextarea
                    value={row.to_place}
                    disabled={!canEdit}
                    ariaLabel="To"
                    onChange={(v) => update(row.idx, { to_place: v })}
                  />
                </label>
              </div>

              <div className="mt-3">
                <PurposeField
                  value={row.purpose}
                  disabled={!canEdit}
                  onChange={(v) => update(row.idx, { purpose: v })}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="lbl">Time of Departure</span>
                  <input
                    type="time"
                    className="inp"
                    disabled={!canEdit}
                    value={row.time_departure}
                    aria-label="Time of departure"
                    onChange={(ev) => update(row.idx, { time_departure: ev.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="lbl">Time of Return</span>
                  <input
                    type="time"
                    className="inp"
                    disabled={!canEdit}
                    value={row.time_return}
                    aria-label="Time of return"
                    onChange={(ev) => update(row.idx, { time_return: ev.target.value })}
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * The Purpose(s) field with two AI helpers:
 *  - Generate: the user types a few notes/instructions and the AI writes a short,
 *    professional purpose from them.
 *  - Enhance: the AI rewrites whatever is already in the field, keeping the facts.
 * Both fall back to a clear toast if AI isn't configured or the request fails.
 */
function PurposeField({
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

  async function runGenerate() {
    if (!notes.trim() || busy) return;
    setBusy("generate");
    try {
      const { purpose } = await writeObPurpose({
        data: { mode: "generate", context: notes, current: value },
      });
      onChange(purpose);
      setGenOpen(false);
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the purpose.");
    } finally {
      setBusy(null);
    }
  }

  async function runEnhance() {
    if (busy) return;
    if (!value.trim()) {
      toast.error("Write a rough purpose first, or use Generate.");
      return;
    }
    setBusy("enhance");
    try {
      const { purpose } = await writeObPurpose({
        data: { mode: "enhance", context: "", current: value },
      });
      onChange(purpose);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enhance the purpose.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="lbl mb-0">Purpose(s)</span>
        {!disabled ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`btn btn-outline h-6 gap-1 px-2 text-[11px] ${genOpen ? "bg-primary/10 text-primary" : ""}`}
              disabled={busy !== null}
              title="Let AI write a purpose from a few notes"
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
              title="Let AI polish the current purpose"
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
            placeholder="e.g. cctv installation for Jose Dalman; branch heads signed acknowledgment forms for the last installations"
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

      <AutoTextarea
        value={value}
        disabled={disabled || busy !== null}
        ariaLabel="Purpose(s)"
        minRows={3}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * A field that looks like a normal input but grows to fit multi-line text. Press
 * Enter / Shift+Enter to add a line. Height is recomputed whenever the value
 * changes so it stays in sync when a saved form is loaded. `minRows` sets the
 * comfortable starting height (e.g. the roomier Purpose field).
 */
function AutoTextarea({
  value,
  disabled,
  ariaLabel,
  minRows = 1,
  onChange,
}: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  minRows?: number;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className="inp resize-none overflow-hidden whitespace-pre-wrap break-words"
      style={{ minHeight: `calc(${minRows} * 1.25rem + 0.75rem)` }}
      disabled={disabled}
      value={value}
      aria-label={ariaLabel}
      onChange={(ev) => onChange(ev.target.value)}
    />
  );
}
