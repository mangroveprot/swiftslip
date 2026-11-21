/**
 * A combobox for the drawer's fixed vocabularies (Status, Responsible person,
 * Remarks, Vehicle).
 *
 * The owner asked for the OB form's "From" field behaviour: no dropdown arrow,
 * just a normal field that, when focused, lists the values already used — but
 * still only saves one of them. Typing filters the list; picking (or typing a
 * full label and leaving the field) writes the stored key. Anything else is
 * discarded on blur, so the board can never receive an unknown status.
 */
import { useEffect, useId, useRef, useState } from "react";

export type ComboOption = { value: string; label: string };

export function ComboBox({
  id,
  value,
  options,
  emptyLabel,
  placeholder,
  onChange,
}: {
  id?: string;
  /** The stored key, or `""` for the field's empty choice. */
  value: string;
  options: ReadonlyArray<ComboOption>;
  /** The empty choice, e.g. "No status". It is offered at the top of the list. */
  emptyLabel: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  const listId = useId();
  const resolvedId = id ?? fieldId;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);

  const selected = options.find((option) => option.value === value);
  const display = query ?? selected?.label ?? "";

  const choices: ComboOption[] = [
    { value: "", label: emptyLabel },
    ...options.filter((option) => option.value !== ""),
  ];
  const trimmed = (query ?? "").trim().toLowerCase();
  const suggestions =
    trimmed === ""
      ? choices
      : choices.filter((option) => option.label.toLowerCase().includes(trimmed));

  // A click anywhere else closes the menu, like the OB place field.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(option: ComboOption) {
    onChange(option.value);
    setQuery(null);
    setOpen(false);
    setActive(-1);
  }

  /** Leaving the field with a fully typed label keeps that choice. */
  function commitTyped(text: string | null) {
    if (text == null || text.trim() === "") return;
    const needle = text.trim().toLowerCase();
    const match = choices.find((option) => option.label.toLowerCase() === needle);
    if (match) onChange(match.value);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={resolvedId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          open && active >= 0 && suggestions[active] ? `${listId}-${active}` : undefined
        }
        className="w-full rounded-lg border border-input bg-field px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus:border-[#ea6a2e] focus:ring-2 focus:ring-[#ea6a2e]/25 focus:outline-none"
        value={display}
        placeholder={placeholder ?? emptyLabel}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setQuery(null);
          setActive(-1);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onBlur={() => {
          commitTyped(query);
          setOpen(false);
          setQuery(null);
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
            setQuery(null);
            setActive(-1);
          }
        }}
      />

      {open && suggestions.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Values already used"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-card p-1.5 shadow-lg"
        >
          {suggestions.map((option, index) => (
            <button
              key={option.value || "empty"}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`flex w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                index === active ? "bg-muted" : "hover:bg-muted"
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The free-text twin of the combobox: same field and same suggestion menu, but
 * every keystroke is kept (Requirements and Action required are free text on
 * the sheet). The menu simply offers values already used in that field.
 */
export function SuggestionInput({
  id,
  value,
  options,
  placeholder,
  maxLength,
  onChange,
}: {
  id?: string;
  value: string;
  options: ReadonlyArray<string>;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  const listId = useId();
  const resolvedId = id ?? fieldId;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(-1);

  const display = typed ?? value;
  const trimmed = (typed ?? "").trim().toLowerCase();
  const suggestions = options
    .filter((option) => trimmed === "" || option.toLowerCase().includes(trimmed))
    .slice(0, 6);

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
        id={resolvedId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          open && active >= 0 && suggestions[active] ? `${listId}-${active}` : undefined
        }
        className="w-full rounded-lg border border-input bg-field px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus:border-[#ea6a2e] focus:ring-2 focus:ring-[#ea6a2e]/25 focus:outline-none"
        value={display}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
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
            setTyped(null);
            setActive(-1);
          }
        }}
      />

      {open && suggestions.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Values already used"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-card p-1.5 shadow-lg"
        >
          {suggestions.map((option, index) => (
            <button
              key={option}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`flex w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                index === active ? "bg-muted" : "hover:bg-muted"
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
