import { useEffect, useState } from "react";

import { OTHERS, needsSpecification, optionFor } from "@/shared/org";

/**
 * A fixed-choice Department / Position picker with an "Others" escape hatch.
 *
 * Two things this has to get right, both about the underlying column being
 * free text:
 *
 * 1. An unlisted value (an older profile, or something typed under "Others"
 *    previously) must never be silently wiped. It reports as OTHERS and is
 *    revealed in a text box, so opening this and saving cannot replace it.
 *
 * 2. Choosing "Others" has to actually reveal the box. The select's selection
 *    therefore lives in local state rather than being derived from `value` —
 *    deriving it meant picking Others set the value to "", which immediately
 *    resolved back to the blank option and snapped the select shut.
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
   * it is off-list — it is added as a selectable option rather than the
   * "Others…" escape, so nobody is locked out of seeing or clearing it.
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
}) {
  // Someone who may not invent values still has to SEE their own off-list
  // value, so it is offered as a real option rather than only reachable
  // through the Others box. Otherwise a staff member holding an older spelling
  // sees a select whose selection matches nothing, and looks broken.
  const trimmed = value.trim();
  const offList = trimmed !== "" && !(list as readonly string[]).includes(trimmed);
  const options = !allowOthers && offList ? [...list, trimmed] : [...list];

  // When Others isn't on offer the off-list value IS one of the options, so
  // it must resolve to itself rather than to OTHERS — otherwise the select
  // would hold a value with no matching <option> and render blank.
  const listed = !allowOthers && offList ? trimmed : optionFor(list, value);
  const [picked, setPicked] = useState(listed);
  const customOpen = picked === OTHERS;
  const invalid = needsSpecification(picked, value);

  useEffect(() => {
    onValidityChange?.(invalid);
  }, [invalid, onValidityChange]);

  // Adopt whatever the parent says, so a value arriving after mount (the
  // profile query resolving) lands in the picker — including an unlisted one,
  // which has to open the Others box or the value looks lost.
  //
  // The one thing it must NOT do is snap a real option into place while the
  // Others box is open: someone typing "IT Support Lead" would reach "IT
  // Support" mid-word, have the box vanish under them, and lose the rest.
  useEffect(() => {
    if (listed === OTHERS) setPicked(OTHERS);
    else if (listed !== "" && !customOpen) setPicked(listed);
  }, [listed, customOpen]);

  const showCustom = customOpen;

  return (
    <label className="block" htmlFor={id}>
      <span className="lbl">{label}</span>
      <select
        id={id}
        className="inp"
        value={picked}
        onChange={(e) => {
          const next = e.target.value;
          setPicked(next);
          // Others starts blank rather than keeping the old value, so an empty
          // box is unambiguous ("not set yet").
          onChange(next === OTHERS ? "" : next);
        }}
      >
        <option value="">—</option>
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
        {allowOthers ? <option value={OTHERS}>Others…</option> : null}
      </select>

      {showCustom ? (
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
    </label>
  );
}
