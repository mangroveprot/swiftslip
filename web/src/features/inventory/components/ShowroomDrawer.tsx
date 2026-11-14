/**
 * Showroom view/edit/add drawer.
 *
 * Same right-side panel as the asset drawer: navy banner header, white body
 * with labelled fields grouped into Showroom, CCTV, Internet and Notes, and a
 * footer with Delete on the left, Cancel + orange primary on the right. The
 * status selects read the shared showroom vocabulary, so their labels match
 * the board, the tab counts and the export.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Loader2 } from "lucide-react";

import type { Showroom, ShowroomSaveRequest } from "@swiftslip/shared/showrooms";
import {
  SHOWROOM_CCTV_CONNECTION_OPTIONS,
  SHOWROOM_CCTV_INSTALLED_OPTIONS,
  SHOWROOM_INTERNET_OPTIONS,
} from "@swiftslip/shared/showrooms";

import { isBlank } from "../lib/helpers";

export type ShowroomDrawerMode = "view" | "edit" | "add";

type ShowroomDrawerProps = {
  isOpen: boolean;
  showroom: Showroom | null;
  mode: ShowroomDrawerMode;
  onClose: () => void;
  onSave: (showroomId: number | null, req: ShowroomSaveRequest) => void | Promise<void>;
  onDelete: (showroom: Showroom) => void;
};

const FIELD =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus:border-[#ea6a2e] focus:ring-2 focus:ring-[#ea6a2e]/25 focus:outline-none";
const SELECT = `${FIELD} pr-8`;
const LABEL = "mb-1.5 block text-xs font-medium text-muted-foreground";

type FormState = {
  name: string;
  cctvInstalled: string;
  cctvConnection: string;
  cctvNote: string;
  internet: string;
  notes: string;
};

/** Every status starts at the neutral "not recorded" key in add mode. */
const EMPTY_FORM: FormState = {
  name: "",
  cctvInstalled: "not_recorded",
  cctvConnection: "not_recorded",
  cctvNote: "",
  internet: "not_recorded",
  notes: "",
};

/** Shallow equality over the form's string fields (edit-dirty check). */
function isSameForm(a: FormState, b: FormState): boolean {
  const keys = Object.keys(a) as Array<keyof FormState>;
  return keys.every((key) => a[key] === b[key]);
}

export function ShowroomDrawer(props: ShowroomDrawerProps) {
  const { isOpen, showroom, mode, onClose, onSave, onDelete } = props;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Snapshot of the last loaded form, for the edit-dirty check.
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  // Synchronous guard: `saving` only turns the button off after the next
  // render, which a fast double-click can outrun.
  const savingRef = useRef(false);

  const isAddMode = mode === "add";

  // Edit mode saves only what changed: nothing touched, nothing to submit.
  const hasChanges = !isSameForm(form, baseline);
  const saveDisabled = saving || (!isAddMode && !hasChanges);

  const upd = useCallback((patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const loadForm = useCallback(() => {
    const next: FormState =
      showroom == null
        ? { ...EMPTY_FORM }
        : {
            ...EMPTY_FORM,
            name: showroom.showroom_name,
            cctvInstalled: showroom.cctv_installed,
            cctvConnection: showroom.cctv_connection,
            cctvNote: showroom.cctv_note ?? "",
            internet: showroom.internet,
            notes: showroom.notes ?? "",
          };

    setForm(next);
    setBaseline(next);
  }, [showroom]);

  // Mirrors `OnParametersSet`: reload the form when opened, or when the
  // showroom/mode changes while open.
  const lastLoadRef = useRef<{ showroom: Showroom | null; mode: ShowroomDrawerMode } | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const needsLoad =
        !wasOpenRef.current ||
        lastLoadRef.current == null ||
        lastLoadRef.current.showroom !== showroom ||
        lastLoadRef.current.mode !== mode;
      if (needsLoad) {
        loadForm();
        setShowError(false);
        lastLoadRef.current = { showroom, mode };
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, showroom, mode, loadForm]);

  const cancelChanges = () => {
    onClose();
  };

  // Escape closes the drawer, like the backdrop click.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const panelRef = useRef<HTMLElement | null>(null);

  // Keep Tab inside the drawer while it is open.
  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || panelRef.current == null) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (!panelRef.current.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const fail = (message: string) => {
    setShowError(true);
    setErrorMessage(message);
  };

  const save = async () => {
    // One request at a time: the drawer stays open until the save resolves, so
    // a second click would otherwise fire a duplicate insert.
    if (savingRef.current) return;
    // Edit mode with an untouched form has nothing to submit.
    if (!isAddMode && !hasChanges) return;
    if (isBlank(form.name)) {
      fail("Enter a showroom name.");
      return;
    }

    savingRef.current = true;
    setShowError(false);
    setSaving(true);
    try {
      const request: ShowroomSaveRequest = {
        showroomName: form.name.trim(),
        cctvInstalled: form.cctvInstalled as ShowroomSaveRequest["cctvInstalled"],
        cctvConnection: form.cctvConnection as ShowroomSaveRequest["cctvConnection"],
        cctvNote: isBlank(form.cctvNote) ? null : form.cctvNote.trim(),
        internet: form.internet as ShowroomSaveRequest["internet"],
        notes: isBlank(form.notes) ? null : form.notes.trim(),
      };
      await onSave(isAddMode ? null : (showroom?.showroom_id ?? null), request);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  /* ---------------------------------------------------------- render - */

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 animate-[fadeIn_.2s_ease-out]"
        onClick={onClose}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="showroom-drawer-title"
        onKeyDown={trapFocus}
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-card text-card-foreground shadow-2xl animate-[slideIn_.22s_ease-out]"
      >
        <header
          className="relative shrink-0 overflow-hidden bg-[var(--inv-navy)] bg-cover bg-center px-5 py-4 text-white"
          style={{ backgroundImage: "url('/inventory/banner.webp')" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/35" aria-hidden="true" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="showroom-drawer-title"
                className="text-lg font-semibold tracking-tight text-white"
              >
                {isAddMode ? "Add showroom" : "Edit showroom"}
              </h2>
              <p className="mt-0.5 text-xs text-white/75">CCTV and internet status</p>
            </div>
            <button
              type="button"
              className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Showroom</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="showroom-name" className={LABEL}>
                  Showroom name
                </label>
                <input
                  id="showroom-name"
                  name="showroom-name"
                  type="text"
                  className={FIELD}
                  placeholder="e.g. Roxas"
                  maxLength={120}
                  aria-required="true"
                  value={form.name}
                  onChange={(e) => upd({ name: e.target.value })}
                  autoFocus={isAddMode}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">CCTV</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="showroom-cctv-installed" className={LABEL}>
                    CCTV installed
                  </label>
                  <select
                    id="showroom-cctv-installed"
                    name="showroom-cctv-installed"
                    className={SELECT}
                    value={form.cctvInstalled}
                    onChange={(e) => upd({ cctvInstalled: e.target.value })}
                  >
                    {SHOWROOM_CCTV_INSTALLED_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="showroom-cctv-connection" className={LABEL}>
                    CCTV connection
                  </label>
                  <select
                    id="showroom-cctv-connection"
                    name="showroom-cctv-connection"
                    className={SELECT}
                    value={form.cctvConnection}
                    onChange={(e) => upd({ cctvConnection: e.target.value })}
                  >
                    {SHOWROOM_CCTV_CONNECTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="showroom-cctv-note" className={LABEL}>
                  CCTV note
                </label>
                <input
                  id="showroom-cctv-note"
                  name="showroom-cctv-note"
                  type="text"
                  className={FIELD}
                  placeholder="e.g. Temporary, Needs connecting"
                  maxLength={60}
                  value={form.cctvNote}
                  onChange={(e) => upd({ cctvNote: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Internet</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="showroom-internet" className={LABEL}>
                  Internet
                </label>
                <select
                  id="showroom-internet"
                  name="showroom-internet"
                  className={SELECT}
                  value={form.internet}
                  onChange={(e) => upd({ internet: e.target.value })}
                >
                  {SHOWROOM_INTERNET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              <label htmlFor="showroom-notes">Notes</label>
            </h3>
            <textarea
              id="showroom-notes"
              name="showroom-notes"
              rows={4}
              className={`${FIELD} resize-none`}
              placeholder="Add a note…"
              maxLength={4000}
              value={form.notes}
              onChange={(e) => upd({ notes: e.target.value })}
            />
          </section>
        </div>

        <footer className="shrink-0 border-t border-border bg-card">
          {showError ? (
            <p
              role="alert"
              className="mx-5 mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 px-5 py-3.5">
            {isAddMode || showroom == null ? (
              <span />
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40"
                disabled={saving}
                onClick={() => {
                  if (showroom) onDelete(showroom);
                }}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m2 0v13.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V6h12ZM10 11v6M14 11v6"
                  />
                </svg>
                Delete
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-orange)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={cancelChanges}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-[#c24a0e] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a83f0b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-navy)] disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void save()}
                disabled={saveDisabled}
                aria-busy={saving}
                title={!isAddMode && !hasChanges ? "No changes to save" : undefined}
              >
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {saving
                  ? isAddMode
                    ? "Adding…"
                    : "Saving…"
                  : isAddMode
                    ? "Add showroom"
                    : "Save changes"}
              </button>
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );
}
