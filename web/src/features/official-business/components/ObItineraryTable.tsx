import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, PencilLine, Sparkles, Trash, X } from "lucide-react";

import { writeObPurpose } from "@/api/official-business.functions";
import { AiMascot } from "@/components/common/AiMascot";
import { toast } from "@/lib/toast";
import type { ObEntry } from "@swiftslip/shared/types";

import { ObSection, Req } from "./ObSection";

const EMPTY_ROW: Omit<ObEntry, "idx"> = {
  from_place: "",
  to_place: "",
  purpose: "",
  time_departure: "",
  time_return: "",
};

/** `to_place` holds comma-separated destinations; a stop can visit several. */
function splitPlaces(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinPlaces(places: string[]): string {
  return places.join(", ");
}

const FIELD_INPUT =
  "h-10 w-full rounded-md border-0 bg-muted px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:text-muted-foreground";
const FIELD_LABEL = "mb-1.5 block text-[13px] font-medium text-foreground/70";

export function ObItineraryTable({
  rows,
  setRows,
  canEdit,
  busy,
  placeOptions,
}: {
  rows: ObEntry[];
  setRows: (rows: ObEntry[]) => void;
  canEdit: boolean;
  busy: boolean;
  /** Destinations already used on other OB forms, offered as suggestions. */
  placeOptions: string[];
}) {
  const [confirming, setConfirming] = useState<number | null>(null);

  // A fresh form opens with one empty stop, like the paper sheet. Removing the
  // last one is allowed — this only seeds the initial state, once.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (canEdit && rows.length === 0) setRows([{ idx: 0, ...EMPTY_ROW }]);
  }, [canEdit, rows.length, setRows]);

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
    setConfirming(null);
    setRows(reindex(rows.filter((r) => r.idx !== idx)));
  }

  return (
    <ObSection
      title="Itinerary / Destination"
      action={
        canEdit ? (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={addRow}>
            Add stop
          </button>
        ) : null
      }
    >
      <div className={rows.length > 1 ? "space-y-6" : ""}>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
            No stops yet. Click “Add stop” to add the first destination.
          </div>
        ) : (
          rows.map((row, i) => {
            const showHeader = rows.length > 1;
            return (
              <div
                key={row.idx}
                className={
                  i > 0
                    ? "border-t pt-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
                    : "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
                }
              >
                {showHeader ? (
                  <div className="mb-3 flex min-h-7 flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Stop {i + 1}</p>
                    {canEdit ? (
                      confirming === row.idx ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Remove this stop?</span>
                          <button
                            type="button"
                            className="btn h-7 bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90"
                            disabled={busy}
                            onClick={() => removeRow(row.idx)}
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            className="btn h-7 bg-muted px-3 text-xs text-foreground hover:bg-muted/70"
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn size-7 p-0 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          aria-label={`Remove stop ${i + 1}`}
                          title="Remove stop"
                          onClick={() => setConfirming(row.idx)}
                        >
                          <Trash className="size-4" aria-hidden="true" />
                        </button>
                      )
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-4">
                  <div className="grid gap-4 @md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <div className="block">
                      <span className={FIELD_LABEL}>
                        From
                        <Req />
                      </span>
                      <PlaceInput
                        value={row.from_place}
                        options={placeOptions}
                        disabled={!canEdit}
                        ariaLabel="From"
                        placeholder="Where you leave from"
                        onChange={(v) => update(row.idx, { from_place: v })}
                      />
                    </div>

                    <div>
                      <span className={FIELD_LABEL}>
                        To
                        <Req />
                      </span>
                      <DestinationChips
                        value={row.to_place}
                        options={placeOptions}
                        disabled={!canEdit}
                        onChange={(v) => update(row.idx, { to_place: v })}
                      />
                    </div>
                  </div>

                  <PurposeField
                    value={row.purpose}
                    disabled={!canEdit}
                    onChange={(v) => update(row.idx, { purpose: v })}
                  />

                  <div className="grid items-end gap-4 @md:grid-cols-2">
                    <label className="block">
                      <span className={FIELD_LABEL}>Time of departure (optional)</span>
                      <input
                        type="time"
                        className={FIELD_INPUT}
                        disabled={!canEdit}
                        value={row.time_departure}
                        aria-label="Time of departure"
                        onChange={(ev) => update(row.idx, { time_departure: ev.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className={FIELD_LABEL}>Time of return (optional)</span>
                      <input
                        type="time"
                        className={FIELD_INPUT}
                        disabled={!canEdit}
                        value={row.time_return}
                        aria-label="Time of return"
                        onChange={(ev) => update(row.idx, { time_return: ev.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </ObSection>
  );
}

/**
 * A single-line place field with the same suggestion menu as the To field. The
 * native datalist is deliberately not used: its picker arrow looked like a
 * dropdown that did nothing, and the list could not be styled to match the To
 * field's suggestions.
 */
function PlaceInput({
  value,
  options,
  disabled,
  ariaLabel,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  disabled: boolean;
  ariaLabel: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const query = typed ?? "";
  const suggestions = options
    .filter((option) => !query || option.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  // A click anywhere else closes the menu. `onBlur` covers keyboard focus
  // changes; this covers the pointer, and keeps From and To from both showing
  // their menus at once.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(option: string) {
    onChange(option);
    setTyped(null);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        className={FIELD_INPUT}
        disabled={disabled}
        value={value}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setTyped(null);
          setActive(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setTyped(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onBlur={() => {
          setOpen(false);
          setTyped(null);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, suggestions.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, -1));
          } else if (event.key === "Enter" && active >= 0 && suggestions[active]) {
            event.preventDefault();
            choose(suggestions[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <PlaceSuggestions id={listId} options={suggestions} active={active} onChoose={choose} />
      ) : null}
    </div>
  );
}

/** The shared destination suggestion menu used by From and To. */
function PlaceSuggestions({
  id,
  options,
  active,
  onChoose,
}: {
  id: string;
  options: string[];
  active: number;
  onChoose: (option: string) => void;
}) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label="Places already used"
      className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-card p-1.5 shadow-lg"
    >
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          role="option"
          aria-selected={index === active}
          className={`flex w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
            index === active ? "bg-muted" : "hover:bg-muted"
          }`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * The multi-place "To" field: each destination is a chip, and the inline input
 * adds another. Typing opens a short list of places already used; Enter adds the
 * highlighted suggestion or whatever was typed. Stored as a comma-separated
 * `to_place`, which the preview, the Word export and the OB list already read.
 */
function DestinationChips({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const places = splitPlaces(value);
  const suggestions = options
    .filter((option) => !places.some((place) => place.toLowerCase() === option.toLowerCase()))
    .filter((option) => !draft.trim() || option.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, 6);

  // Same pointer dismissal as the From field, so opening one place menu closes
  // the other even when focus events are delayed.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function addPlaces(raw: string) {
    const additions = splitPlaces(raw);
    if (additions.length === 0) return;
    const next = [...places];
    for (const place of additions) {
      if (!next.some((existing) => existing.toLowerCase() === place.toLowerCase())) {
        next.push(place);
      }
    }
    if (next.length !== places.length) onChange(joinPlaces(next));
    setDraft("");
    setActive(-1);
  }

  function choose(place: string) {
    addPlaces(place);
    setOpen(true);
  }

  function removeAt(index: number) {
    onChange(joinPlaces(places.filter((_, i) => i !== index)));
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/25">
        {places.map((place, i) => (
          <span
            key={`${place}-${i}`}
            className="inline-flex items-center gap-1 rounded border border-border bg-card py-0.5 pr-1 pl-2 text-sm"
          >
            {place}
            {!disabled ? (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${place}`}
                title={`Remove ${place}`}
                onClick={() => removeAt(i)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))}
        {!disabled ? (
          <input
            type="text"
            className="h-7 min-w-[7rem] flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            value={draft}
            role="combobox"
            aria-label="Add a place"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            placeholder={places.length ? "Add a place" : "Type a place, then press Enter"}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setDraft(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onBlur={() => {
              setOpen(false);
              addPlaces(draft);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActive((index) => Math.min(index + 1, suggestions.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, -1));
              } else if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                if (active >= 0 && suggestions[active]) choose(suggestions[active]);
                else addPlaces(draft);
              } else if (event.key === "Escape") {
                setOpen(false);
                setActive(-1);
              } else if (event.key === "Backspace" && draft === "" && places.length > 0) {
                removeAt(places.length - 1);
              }
            }}
          />
        ) : null}
      </div>

      {open && suggestions.length > 0 ? (
        <PlaceSuggestions id={listId} options={suggestions} active={active} onChoose={choose} />
      ) : null}
    </div>
  );
}

/**
 * The Purpose(s) field with two AI helpers:
 *  - Write for me: the user types a few notes/instructions and the AI writes a
 *    short, professional purpose from them.
 *  - Improve wording: the AI rewrites whatever is already in the field, keeping
 *    the facts.
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
      toast.error("Write a rough purpose first, or use Write for me.");
      return;
    }
    setBusy("enhance");
    try {
      const { purpose } = await writeObPurpose({
        data: { mode: "enhance", context: "", current: value },
      });
      onChange(purpose);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not improve the wording.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground/70">
          Purpose(s)
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
              title="Let AI write a purpose from a few notes"
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
              title="Let AI polish the current purpose"
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
        <div className="mb-2 rounded-xl border border-input bg-card p-3 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <div className="flex items-start gap-2.5">
            <AiMascot size="sm" className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-5 text-foreground">
                Tell the AI what happened
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A few notes is enough. The AI will write the reason for you.
              </p>
            </div>
            <button
              type="button"
              className="-mr-1 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close"
              onClick={() => setGenOpen(false)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <input
            type="text"
            className="mt-3 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/25"
            placeholder="e.g. holiday on Oct 7 in Dipolog City, so I need to move my shift"
            value={notes}
            autoFocus
            onChange={(ev) => setNotes(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey || !ev.shiftKey)) {
                ev.preventDefault();
                void runGenerate();
              }
            }}
          />

          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy !== null || !notes.trim()}
              onClick={runGenerate}
            >
              Write
              {busy === "generate" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="size-4" aria-hidden="true" />
              )}
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
      className="w-full resize-none overflow-hidden rounded-md border-0 bg-muted px-3 py-2 text-sm whitespace-pre-wrap break-words text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:text-muted-foreground"
      style={{ minHeight: `calc(${minRows} * 1.25rem + 0.75rem)` }}
      disabled={disabled}
      value={value}
      aria-label={ariaLabel}
      onChange={(ev) => onChange(ev.target.value)}
    />
  );
}
