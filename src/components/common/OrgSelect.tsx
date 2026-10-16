import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";

import { OTHERS, needsSpecification, optionFor } from "@/shared/org";

/**
 * Admin-only list maintenance, handed to the picker so each row can carry its
 * own rename / delete button and the panel can offer "Add". Left undefined for
 * staff — the lists are maintained by administrators.
 */
export type OrgSelectActions = {
  onAdd: () => void;
  onRename: (value: string) => void;
  onDelete: (value: string) => void;
};

/**
 * Shrink the label as it grows, so a long Department or Position keeps to one
 * line instead of wrapping or being clipped.
 */
function fitText(value: string): string {
  const n = value.trim().length;
  if (n <= 20) return "text-sm";
  if (n <= 28) return "text-[13px]";
  if (n <= 38) return "text-xs";
  return "text-[11px]";
}

/**
 * A fixed-choice Designation / Department / Position picker.
 *
 * Two things this has to get right, both about the underlying column being
 * free text:
 *
 * 1. An unlisted value (an older profile, or something typed previously) must
 *    never be silently wiped. It resolves to OTHERS and is revealed in a text
 *    box, so opening this and saving cannot replace it.
 *
 * 2. It is a hand-rolled listbox rather than a native `<select>` because an
 *    admin needs a rename / delete button ON each row (see `actions`), and a
 *    native option is one line of plain text and cannot hold one.
 *
 * There is no "Others…" row wherever there is an Add row — an admin types a
 * brand-new value straight onto the list, storing it rather than leaving a
 * one-off nobody else will ever see. Elsewhere (My Account) Others stays as
 * the escape hatch, and never carries buttons.
 */
export function OrgSelect({
  label,
  list,
  value,
  placeholder,
  allowOthers = true,
  onChange,
  onValidityChange,
  id,
  actions,
}: {
  label: string;
  list: readonly string[];
  value: string;
  placeholder: string;
  /**
   * Whether this person may invent a value that isn't on the list.
   *
   * False for staff: the list is maintained by administrators, and a free-text
   * box here would let anyone quietly create a Department or Position that no
   * access rule will ever match. Their own stored value still shows even when
   * it is off-list — it resolves to OTHERS, which reveals the text box so
   * nobody is locked out of seeing or clearing it.
   */
  allowOthers?: boolean;
  onChange: (next: string) => void;
  /**
   * Reports "Others is selected but nothing has been typed". Only this
   * component knows that — an empty `value` is indistinguishable from unset —
   * so the form relies on this to refuse an unsafe save.
   */
  onValidityChange?: (invalid: boolean) => void;
  id: string;
  /**
   * Admin-only list maintenance. When given, every row carries its own rename
   * and delete button and the panel ends with an "Add" row. Left undefined for
   * staff, who may not invent values in the first place.
   */
  actions?: OrgSelectActions;
}) {
  // Someone who may not invent values still has to SEE their own off-list
  // value, so it is offered as a real option rather than only reachable
  // through the Others box. Otherwise a staff member holding an older spelling
  // sees a select whose selection matches nothing, and looks broken.
  const trimmed = value.trim();
  const offList = trimmed !== "" && !(list as readonly string[]).includes(trimmed);
  const options = !allowOthers && offList ? [...list, trimmed] : [...list];

  // When Others isn't on offer the off-list value IS one of the rows, so it
  // must resolve to itself rather than to OTHERS — otherwise the picker would
  // hold a value with no matching row and render blank.
  const listed = !allowOthers && offList ? trimmed : optionFor(list, value);
  const [picked, setPicked] = useState(listed);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const customOpen = picked === OTHERS;
  const invalid = needsSpecification(picked, value);
  /** What the closed control shows. */
  const display = customOpen ? trimmed : picked;

  useEffect(() => {
    onValidityChange?.(invalid);
  }, [invalid, onValidityChange]);

  // Adopt whatever the parent says, so a value arriving after mount (the
  // profile query resolving) lands in the picker — including an unlisted one,
  // which has to open the Others box or the value looks lost.
  //
  // The one thing it must NOT do is snap a real row into place while the
  // Others box is open: someone typing "IT Support Lead" would reach "IT
  // Support" mid-word, have the box vanish under them, and lose the rest.
  useEffect(() => {
    if (listed === OTHERS) setPicked(OTHERS);
    else if (listed !== "" && !customOpen) setPicked(listed);
  }, [listed, customOpen]);

  // Close on a click outside. `pointerdown` (rather than `click`) so the row's
  // own handler still runs — the panel would otherwise swallow the click that
  // was meant to pick the row.
  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Escape closes THIS panel, never the dialog around it — losing everything
  // else the admin had typed because they wanted to shut a dropdown would be
  // its own bug.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  function pick(next: string) {
    setPicked(next);
    // Others starts blank rather than keeping the old value, so an empty box
    // is unambiguous ("not set yet") — and the sentinel itself never reaches
    // the parent as a value.
    onChange(next === OTHERS ? "" : next);
    setOpen(false);
  }

  /** One row: the value fills the row, plus the admin buttons on its right. */
  function row(option: string, text: string) {
    const selected = picked === option;
    return (
      <div
        key={option || "__blank__"}
        className={`flex items-center gap-1 pr-1 pl-2 ${
          selected ? "bg-muted" : ""
        } hover:bg-muted/60`}
      >
        <button
          type="button"
          role="option"
          aria-selected={selected}
          className="min-w-0 flex-1 py-1.5 text-left"
          onClick={() => pick(option)}
        >
          <span className={`block truncate ${fitText(text)}`}>{text}</span>
        </button>
        {/* The blank row is not a value, so it offers no maintenance. */}
        {actions && option !== "" ? (
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Rename ${text}`}
              title={`Rename “${text}”`}
              onClick={() => {
                setOpen(false);
                actions.onRename(option);
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Delete ${text}`}
              title={`Delete “${text}”`}
              onClick={() => {
                setOpen(false);
                actions.onDelete(option);
              }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="block">
      <span className="lbl" id={`${id}-label`}>
        {label}
      </span>

      <div className="relative" ref={rootRef}>
        <button
          type="button"
          id={id}
          aria-labelledby={`${id}-label`}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="inp flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={`truncate ${display ? fitText(display) : "text-sm text-muted-foreground"}`}
          >
            {display || "—"}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label={label}
            className="absolute z-[60] mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background py-1 shadow-lg"
          >
            {row("", "—")}
            {options.map((option) => row(option, option))}
            {/* The Others escape only appears where there is no Add row (My
                Account), so a sentinel value can never carry the maintenance
                buttons — its "__others__" key exists in no list table, and a
                delete against it would report success having removed nothing. */}
            {allowOthers && !actions ? row(OTHERS, "Others…") : null}
            {actions ? (
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-1.5 border-t px-2 py-2 text-left text-xs font-medium text-primary hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  actions.onAdd();
                }}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add {label.toLowerCase()}…
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {customOpen ? (
        <>
          <input
            className="inp mt-2"
            value={value}
            placeholder={placeholder}
            aria-label={`${label} — other`}
            aria-invalid={invalid}
            onChange={(e) => onChange(e.target.value)}
          />
          {/* Saving with Others chosen and nothing typed would store an empty
              value and erase what was there, so say so before they try. */}
          {invalid ? (
            <span className="mt-1 block text-xs text-destructive">
              Please specify the {label.toLowerCase()}.
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
