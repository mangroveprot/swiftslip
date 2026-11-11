import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A multi-place field: each destination is a chip, and the inline input adds
 * another. Typing opens a short list of places already used; Enter adds the
 * highlighted suggestion or whatever was typed, Backspace on an empty input
 * removes the last chip, and every chip carries its own X.
 *
 * The value is stored as a comma-separated string, which is what the printed
 * sheets, the Word export and the list screens already read.
 */
export function splitPlaces(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinPlaces(places: string[]): string {
  return places.join(", ");
}

export function PlaceChips({
  id,
  value,
  options,
  disabled,
  invalid = false,
  hint,
  ariaLabel = "Add a place",
  placeholder,
  onChange,
}: {
  /** Put on the inline input so a form's "still needed" link can focus it. */
  id?: string;
  value: string;
  /** Places already used elsewhere — the suggestion list. */
  options: string[];
  disabled: boolean;
  invalid?: boolean | undefined;
  /** What to do about the empty field — shown in red under the chips. */
  hint?: string | undefined;
  ariaLabel?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const hintId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const places = splitPlaces(value);
  const suggestions = options
    .filter((option) => !places.some((place) => place.toLowerCase() === option.toLowerCase()))
    .filter((option) => !draft.trim() || option.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, 6);

  // A click anywhere else closes the menu, so two place fields on one form can
  // never show their lists at the same time.
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
    <div>
      <div ref={wrapRef} className="relative">
        <div
          className={cn(
            // Same as `.form-fill .inp`: no border at rest, a black one while it
            // has focus — the chip box must not look like a different control.
            "flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-transparent bg-muted px-2 py-1.5 focus-within:border-foreground",
            invalid && "border-destructive",
          )}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
        >
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
              id={id}
              type="text"
              className="h-7 min-w-[7rem] flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              value={draft}
              role="combobox"
              aria-label={ariaLabel}
              aria-autocomplete="list"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              placeholder={
                placeholder ?? (places.length ? "Add a place" : "Type a place, then press Enter")
              }
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
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs font-medium text-destructive">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The shared place suggestion menu used by the chips and single-line fields. */
export function PlaceSuggestions({
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
