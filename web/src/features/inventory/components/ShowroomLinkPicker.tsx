/**
 * The drawer's "Linked SwiftSlip showroom" picker.
 *
 * SwiftSlip's "Summary of SR Status and Updates" stays exactly as it is; this
 * control only records which of its rows the inventory showroom follows. The
 * linked row's Status and Action required are shown read-only underneath,
 * because editing them here would fork the Summary.
 *
 * One Summary row feeds one inventory showroom: rows already linked elsewhere
 * stay in the list (so the owner can see where they went) but are greyed out
 * and cannot be picked.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

import type { ShowroomLink, ShowroomLinkOption } from "@swiftslip/shared/showrooms";
import {
  showroomLinkActionLabel,
  showroomLinkStatusLabel,
  showroomUpdateStatusTone,
  suggestShowroomLink,
} from "@swiftslip/shared/showrooms";

type ShowroomLinkPickerProps = {
  options: ShowroomLinkOption[];
  loading: boolean;
  /** The Summary row id currently linked, or null. */
  value: number | null;
  /** This showroom's id (null while adding), so its own link stays selectable. */
  showroomId: number | null;
  /** The linked row the board already knows, for before the options load. */
  fallback: ShowroomLink | null;
  /** The inventory name, used for the "Looks like …" suggestion. */
  showroomName: string;
  onChange: (updateId: number | null) => void;
};

function isTaken(option: ShowroomLinkOption, showroomId: number | null): boolean {
  return option.linked_to_id != null && option.linked_to_id !== showroomId;
}

export function ShowroomLinkPicker({
  options,
  loading,
  value,
  showroomId,
  fallback,
  showroomName,
  onChange,
}: ShowroomLinkPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected =
    options.find((option) => option.update_id === value) ??
    (fallback && fallback.update_id === value ? fallback : null);

  const suggestion = useMemo(
    () => (value == null ? suggestShowroomLink(showroomName, options) : null),
    [value, showroomName, options],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((option) => {
      if (needle === "") return true;
      return (
        option.showroom_name.toLowerCase().includes(needle) ||
        option.location.toLowerCase().includes(needle)
      );
    });
  }, [options, query]);

  // Close on a click outside, like every other popover in the app.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current != null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const pick = (updateId: number | null) => {
    onChange(updateId);
    close();
  };

  const statusTone = showroomUpdateStatusTone(selected?.status ?? null);

  return (
    <div className="showroom-link" ref={rootRef}>
      <button
        type="button"
        className="showroom-link__field"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={selected == null ? "showroom-link__placeholder" : "showroom-link__selected"}
        >
          {selected?.showroom_name ?? "Choose a showroom"}
        </span>
        <ChevronDown
          className={
            open ? "showroom-link__chevron showroom-link__chevron--open" : "showroom-link__chevron"
          }
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="showroom-link__menu">
          <div className="showroom-link__search">
            <Search className="showroom-link__search-icon" aria-hidden="true" />
            <input
              type="text"
              aria-label="Search SwiftSlip showrooms"
              placeholder="Search a showroom or place"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
              }}
            />
          </div>

          <ul className="showroom-link__list" role="listbox" aria-label="SwiftSlip showrooms">
            {loading ? (
              <li role="presentation" className="showroom-link__empty">
                Loading showrooms…
              </li>
            ) : visible.length === 0 ? (
              <li role="presentation" className="showroom-link__empty">
                No showroom matches that search.
              </li>
            ) : (
              visible.map((option) => {
                const taken = isTaken(option, showroomId);
                return (
                  <li key={option.update_id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.update_id === value}
                      className={
                        taken
                          ? "showroom-link__option showroom-link__option--disabled"
                          : "showroom-link__option"
                      }
                      disabled={taken}
                      onClick={() => pick(option.update_id)}
                    >
                      <span className="showroom-link__option-name">{option.showroom_name}</span>
                      <span className="showroom-link__option-meta">
                        {taken ? `Linked to ${option.linked_to}` : option.location}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}

      {selected == null ? (
        <div className="showroom-link__hint">
          <p>Status and Action required come from the matching row in SwiftSlip.</p>
          {suggestion ? (
            <p className="showroom-link__suggestion">
              Looks like{" "}
              <span className="showroom-link__suggestion-name">{suggestion.showroom_name}</span>
              <button
                type="button"
                className="showroom-link__use"
                onClick={() => pick(suggestion.update_id)}
              >
                Use this
              </button>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="showroom-link__readonly">
          <div className="showroom-link__readonly-row">
            <span className="showroom-link__readonly-label">Location</span>
            <span className="showroom-link__readonly-value showroom-link__readonly-value--wrap">
              {selected.location?.trim() ? selected.location : "Not recorded"}
            </span>
          </div>
          <div className="showroom-link__readonly-row">
            <span className="showroom-link__readonly-label">Status</span>
            <span className="showroom-link__readonly-value">
              {statusTone !== "none" && (
                <span className={`showroom-dot showroom-dot--${statusTone}`} />
              )}
              {showroomLinkStatusLabel(selected)}
            </span>
          </div>
          <div className="showroom-link__readonly-row">
            <span className="showroom-link__readonly-label">Action required</span>
            <span className="showroom-link__readonly-value">
              {showroomLinkActionLabel(selected)}
            </span>
          </div>
          <p className="showroom-link__footnote">
            From SwiftSlip. To change these, edit them there.{" "}
            <button type="button" className="showroom-link__unlink" onClick={() => pick(null)}>
              Unlink
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
