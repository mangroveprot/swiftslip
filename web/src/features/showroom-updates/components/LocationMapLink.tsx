/**
 * The map pin that lives inside the drawer's Location field.
 *
 * A showroom address is typed as text, but the exact place is easier to keep as
 * the Google Maps link the owner picked. With no link the field is the usual
 * input and the pin opens a small "Map link" form (URL + optional label); once
 * saved, the address itself becomes the link — clicking it opens Google Maps —
 * and the tinted pin offers open / edit / remove, with a pencil beside it to
 * go back to typing. Every change goes through `onMapChange`, so the drawer
 * still treats it like any other cell: nothing reaches the API until "Save
 * changes".
 *
 * The popover is anchored to the field, not portalled: the drawer body scrolls
 * as one piece, and the Location section sits near its top, so the panel never
 * runs past the drawer's edge.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ExternalLink, Pencil, PencilLine, X } from "lucide-react";

import { GoogleMapsIcon } from "@/components/common/GoogleMapsIcon";
import { cn } from "@/lib/utils";
import { isHttpUrl } from "@swiftslip/shared/showroom-updates";

const DEFAULT_LABEL = "Google Maps";

const POPOVER =
  "absolute right-0 top-[calc(100%+0.4rem)] z-30 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg";
const SMALL_FIELD =
  "mt-1 w-full rounded-md border border-input bg-field px-2.5 py-1.5 text-[13px] text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus:border-[#ea6a2e] focus:ring-2 focus:ring-[#ea6a2e]/25 focus:outline-none";
const FORM_LABEL = "mt-2 block text-[11px] font-semibold text-muted-foreground";
const ICON_BUTTON =
  "inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e]";

type LocationMapLinkProps = {
  inputId: string;
  value: string;
  onValueChange: (value: string) => void;
  inputClassName: string;
  placeholder?: string | undefined;
  /** The staged link; empty means no pin. */
  mapUrl: string;
  /** The staged label; empty reads as "Google Maps". */
  mapLabel: string;
  onMapChange: (mapUrl: string, mapLabel: string) => void;
};

export function LocationMapLink({
  inputId,
  value,
  onValueChange,
  inputClassName,
  placeholder,
  mapUrl,
  mapLabel,
  onMapChange,
}: LocationMapLinkProps) {
  const [mode, setMode] = useState<"closed" | "menu" | "form">("closed");
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const hasLink = mapUrl.trim() !== "";
  const displayLabel = mapLabel.trim() || DEFAULT_LABEL;
  // With a link saved the field reads as a link, not a box to type in: the
  // address is what the owner clicks to see the map. The pencil (below) swaps
  // it back to the input; an empty address never hides the input.
  const showLink = hasLink && !editing && value.trim() !== "";

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Close on a click outside or on Esc. Esc is claimed here so the drawer's own
  // window handler does not also close the whole panel (it checks
  // `defaultPrevented`).
  useEffect(() => {
    if (mode === "closed") return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current != null && !rootRef.current.contains(event.target as Node)) {
        setMode("closed");
        setError(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMode("closed");
      setError(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mode]);

  const close = () => {
    setMode("closed");
    setError(null);
  };

  const openForm = () => {
    setDraftUrl(mapUrl);
    setDraftLabel(mapLabel.trim() || DEFAULT_LABEL);
    setError(null);
    setMode("form");
  };

  const commit = () => {
    const url = draftUrl.trim();
    if (!isHttpUrl(url)) {
      setError("Paste the full link, starting with https://.");
      return;
    }
    onMapChange(url, draftLabel.trim());
    close();
  };

  const removeLink = () => {
    onMapChange("", "");
    close();
  };

  const onFieldKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit();
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        // Leaving the field (or pressing Esc in it) puts the saved link back on
        // screen. Focus moving inside the field — the pin, its popover — is not
        // "leaving".
        if (!editing) return;
        const next = event.relatedTarget as Node | null;
        if (next != null && event.currentTarget.contains(next)) return;
        if (value.trim() !== "") setEditing(false);
      }}
    >
      {showLink ? (
        <div className={cn(inputClassName, "flex items-center pr-[4.75rem]")}>
          <a
            id={inputId}
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            title="Open in Google Maps"
            className="block min-w-0 flex-1 truncate rounded-sm underline decoration-muted-foreground/60 underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e]"
          >
            {value}
          </a>
        </div>
      ) : (
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          maxLength={240}
          className={cn(inputClassName, "pr-10")}
          placeholder={placeholder}
          aria-required="true"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !hasLink) return;
            event.preventDefault();
            setEditing(false);
          }}
        />
      )}

      {showLink ? (
        <button
          type="button"
          aria-label="Edit location"
          title="Edit location"
          onClick={() => setEditing(true)}
          className="absolute top-1/2 right-9 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e]"
        >
          <PencilLine className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}

      <button
        type="button"
        aria-label={hasLink ? "Map link options" : "Add a map link"}
        aria-haspopup={hasLink ? "menu" : "dialog"}
        aria-expanded={mode !== "closed"}
        title={hasLink ? displayLabel : "Add a map link"}
        onClick={() => {
          if (mode !== "closed") close();
          else if (hasLink) setMode("menu");
          else openForm();
        }}
        className={cn(
          "absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e]",
          hasLink
            ? "bg-[#c24a0e]/10 hover:bg-[#c24a0e]/20"
            : "opacity-60 grayscale hover:bg-secondary hover:opacity-100 hover:grayscale-0",
        )}
      >
        <GoogleMapsIcon className="h-4 w-auto" />
      </button>

      {mode === "form" ? (
        <div role="dialog" aria-label="Map link" className={cn(POPOVER, "w-[19rem] p-3")}>
          <p className="text-xs font-semibold text-foreground">Map link</p>

          <label htmlFor={`${inputId}-map-url`} className={FORM_LABEL}>
            Link
          </label>
          <input
            id={`${inputId}-map-url`}
            type="url"
            inputMode="url"
            autoFocus
            value={draftUrl}
            placeholder="https://maps.app.goo.gl/…"
            onChange={(event) => {
              setDraftUrl(event.target.value);
              setError(null);
            }}
            onKeyDown={onFieldKeyDown}
            className={SMALL_FIELD}
          />

          <label htmlFor={`${inputId}-map-label`} className={FORM_LABEL}>
            Label (optional)
          </label>
          <input
            id={`${inputId}-map-label`}
            type="text"
            maxLength={60}
            value={draftLabel}
            placeholder={DEFAULT_LABEL}
            onChange={(event) => setDraftLabel(event.target.value)}
            onKeyDown={onFieldKeyDown}
            className={SMALL_FIELD}
          />

          {error ? (
            <p role="alert" className="mt-2 text-[11px] text-red-600">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            {hasLink ? (
              <button
                type="button"
                onClick={removeLink}
                className="text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e]"
              >
                Remove link
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={commit}
              disabled={draftUrl.trim() === ""}
              className="rounded-lg bg-[#c24a0e] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#a83f0b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f1b4d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {hasLink ? "Update" : "Insert"}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "menu" ? (
        <div role="menu" aria-label="Map link" className={cn(POPOVER, "w-[17.5rem] p-1.5")}>
          <div className="flex items-center gap-1">
            <span
              className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-medium text-foreground"
              title={mapUrl}
            >
              {displayLabel}
            </span>
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              aria-label={`Open ${displayLabel} in Google Maps`}
              className={ICON_BUTTON}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              role="menuitem"
              aria-label="Edit map link"
              onClick={openForm}
              className={ICON_BUTTON}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="menuitem"
              aria-label="Remove map link"
              onClick={removeLink}
              className={ICON_BUTTON}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
