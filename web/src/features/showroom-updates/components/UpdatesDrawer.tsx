/**
 * The editable row drawer: the sheet's cells plus the row's change history
 * underneath.
 *
 * Same panel as the Inventory showroom drawer (navy banner header, white body
 * with hairline-separated sections, Cancel + orange primary in the footer), so
 * editing a showroom feels the same in both apps. It also opens in "Add
 * showroom" mode, which is the toolbar's `+ Add showroom` button: the form is
 * the same, only the title and the primary label change.
 *
 * Everyone who holds the app may edit (the owner's rule), so there is no
 * read-only mode. Saving is one PUT (or POST when adding); the API diffs the
 * row, writes the audit line and returns the saved row, so the board only has
 * to refresh its one list.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History, Loader2, Undo2, X } from "lucide-react";

import { ProfileHoverCard } from "@/components/common/ProfileHoverCard";
import { useUserPhotos } from "@/features/profile/use-user-photos";
import type {
  ShowroomUpdate,
  ShowroomUpdateChange,
  ShowroomUpdateEvent,
  ShowroomUpdateRemarks,
  ShowroomUpdateResponsible,
  ShowroomUpdateSaveRequest,
  ShowroomUpdateStatus,
  ShowroomUpdateVehicle,
} from "@swiftslip/shared/showroom-updates";
import {
  SHOWROOM_UPDATE_REMARKS,
  SHOWROOM_UPDATE_RESPONSIBLE,
  SHOWROOM_UPDATE_STATUSES,
  SHOWROOM_UPDATE_VEHICLES,
  showroomUpdateBoardDate,
} from "@swiftslip/shared/showroom-updates";

import { showroomUpdateEventsQueryOptions } from "../queries";
import { ComboBox, SuggestionInput } from "./ComboBox";
import { LocationMapLink } from "./LocationMapLink";

/* The field sheet, kept identical to `features/inventory/lib/drawer-styles` so
 * the two drawers cannot drift apart visually. */
const FIELD =
  "w-full rounded-lg border border-input bg-field px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus:border-[#ea6a2e] focus:ring-2 focus:ring-[#ea6a2e]/25 focus:outline-none";
const LABEL = "mb-1.5 block text-xs font-semibold text-foreground";
const SECTION = "border-b border-border/40 py-5 last:border-b-0";
const SECTION_TITLE = "mb-3 text-sm font-semibold tracking-tight text-foreground";
const CANCEL_BUTTON =
  "rounded-lg border border-input bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e] disabled:cursor-not-allowed disabled:opacity-50";

type Draft = {
  showroomName: string;
  location: string;
  mapUrl: string;
  mapLabel: string;
  status: string;
  requirements: string;
  actionRequired: string;
  responsiblePerson: string;
  remarks: string;
  openDate: string;
  vehicle: string;
};

function draftOf(row: ShowroomUpdate | null): Draft {
  return {
    showroomName: row?.showroom_name ?? "",
    location: row?.location ?? "",
    mapUrl: row?.map_url ?? "",
    mapLabel: row?.map_label ?? "",
    status: row?.status ?? "",
    requirements: row?.requirements ?? "",
    actionRequired: row?.action_required ?? "",
    responsiblePerson: row?.responsible_person ?? "",
    remarks: row?.remarks ?? "",
    openDate: row?.open_date ?? "",
    vehicle: row?.vehicle ?? "",
  };
}

function requestOf(draft: Draft): ShowroomUpdateSaveRequest {
  const text = (value: string) => (value.trim() === "" ? null : value.trim());
  return {
    showroomName: draft.showroomName.trim(),
    location: draft.location.trim(),
    status: (draft.status || null) as ShowroomUpdateStatus | null,
    requirements: text(draft.requirements),
    actionRequired: text(draft.actionRequired),
    responsiblePerson: (draft.responsiblePerson || null) as ShowroomUpdateResponsible | null,
    remarks: (draft.remarks || null) as ShowroomUpdateRemarks | null,
    openDate: draft.openDate || null,
    vehicle: (draft.vehicle || null) as ShowroomUpdateVehicle | null,
    mapUrl: text(draft.mapUrl),
    mapLabel: text(draft.mapLabel),
  };
}

function isDirty(row: ShowroomUpdate, draft: Draft): boolean {
  const saved = draftOf(row);
  return (Object.keys(saved) as Array<keyof Draft>).some((key) => saved[key] !== draft[key]);
}

/** The API stores `YYYY-MM-DD HH:mm:ss` (UTC), which `Date` needs as ISO. */
function eventTime(value: string): string {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

/* --------------------------------------------------------------- history - */

/** Entries shown before the list asks; the next one peeks through the fade. */
const HISTORY_INITIAL = 2;
const HISTORY_STEP = 10;

/** The month tokens the API writes into a sheet date (`26-Oct-2026`). */
const SHEET_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function sheetDatePart(text: string): [number, string, string] | null {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const month = SHEET_MONTHS.indexOf(match[2]!.toUpperCase() as (typeof SHEET_MONTHS)[number]);
  if (month < 0) return null;
  return [month, match[1]!, match[3]!];
}

/** `26-Oct-2026` → `Oct 26, 2026`, the wording the drawer reads. */
function historyDate(text: string): string | null {
  const parts = sheetDatePart(text);
  if (!parts) return null;
  const [month, day, year] = parts;
  const label = SHEET_MONTHS[month]!;
  return `${label[0]}${label.slice(1).toLowerCase()} ${Number(day)}, ${year}`;
}

/** `26-Oct-2026` → `2026-10-26`, the stored form the drawer edits. */
function isoFromSheetDate(text: string): string | null {
  const parts = sheetDatePart(text);
  if (!parts) return null;
  const [month, day, year] = parts;
  return `${year}-${String(month + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Vocabulary fields carry display labels; the drawer edits stored keys. */
const DRAFT_OPTIONS: Record<
  string,
  ReadonlyArray<{ value: string; label: string; chipLabel: string }>
> = {
  status: SHOWROOM_UPDATE_STATUSES,
  responsiblePerson: SHOWROOM_UPDATE_RESPONSIBLE,
  remarks: SHOWROOM_UPDATE_REMARKS,
  vehicle: SHOWROOM_UPDATE_VEHICLES,
};

/** `change.field` → the draft cell it restores. */
const HISTORY_FIELD: Record<string, keyof Draft> = {
  "Showroom name": "showroomName",
  Location: "location",
  "Map link": "mapUrl",
  "Map label": "mapLabel",
  Status: "status",
  Requirements: "requirements",
  "Action required": "actionRequired",
  "Responsible person": "responsiblePerson",
  Remarks: "remarks",
  "Date open": "openDate",
  Vehicle: "vehicle",
};

/** A stored value, or `null` when the text cannot be mapped back. */
function storedValue(key: keyof Draft, text: string): string | null {
  if (text === "—") return "";
  const options = DRAFT_OPTIONS[key];
  if (options) {
    const match = options.find((option) => option.label === text || option.chipLabel === text);
    return match ? match.value : null;
  }
  if (key === "openDate") return isoFromSheetDate(text);
  return text;
}

/** The `from` side of one event, ready to merge into the draft. */
function restoredPatch(changes: readonly ShowroomUpdateChange[]): Partial<Draft> {
  const patch: Partial<Draft> = {};
  for (const change of changes) {
    const key = HISTORY_FIELD[change.field];
    if (!key) continue;
    const value = storedValue(key, change.from);
    // Skip a label this build can't map; never blank a field by accident.
    if (value === null) continue;
    patch[key] = value;
  }
  return patch;
}

/** The human side of a value: `Ready`, `Oct 26, 2026`, or the raw text. */
function historyValue(field: string, text: string): string | null {
  if (!text || text === "—") return null;
  if (field === "Date open") return historyDate(text) ?? text;
  const key = field === "Responsible person" ? "responsiblePerson" : field.toLowerCase();
  const options = DRAFT_OPTIONS[key];
  return options?.find((option) => option.label === text)?.chipLabel ?? text;
}

/**
 * The row's first audit line. It is the only event that can move `Showroom
 * name` out of `—` (an edit always starts from a real name), so this marks the
 * creation line without needing a column to store the event kind.
 */
function isCreationLine(changes: readonly ShowroomUpdateChange[]): boolean {
  return changes.some(
    (change) => change.field === "Showroom name" && (!change.from || change.from === "—"),
  );
}

/** "Status changed from Ready to Open" / "Date open set to Oct 26, 2026". */
function ChangeSentence({ change }: { change: ShowroomUpdateChange }) {
  const from = historyValue(change.field, change.from);
  const to = historyValue(change.field, change.to);
  const strong = (text: string) => <span className="font-semibold text-foreground">{text}</span>;
  if (from && to) {
    return (
      <>
        {change.field} changed from {strong(from)} to {strong(to)}
      </>
    );
  }
  if (to) {
    return (
      <>
        {change.field} set to {strong(to)}
      </>
    );
  }
  if (from) {
    return <>{change.field} cleared</>;
  }
  return <>{change.field} updated</>;
}

export type UpdatesDrawerMode = "edit" | "create";

export function UpdatesDrawer({
  row,
  mode,
  onClose,
  onSave,
  requirementOptions,
  actionOptions,
}: {
  row: ShowroomUpdate | null;
  mode: UpdatesDrawerMode;
  onClose: () => void;
  onSave: (updateId: number | null, data: ShowroomUpdateSaveRequest) => Promise<void>;
  /** Every value the board already uses, plus the seed's examples. */
  requirementOptions: ReadonlyArray<string>;
  actionOptions: ReadonlyArray<string>;
}) {
  if (mode === "edit" && !row) return null;
  // Keyed on the row (or "new") so switching showrooms starts a fresh form: a
  // half-typed edit is never carried over to the next showroom.
  return (
    <DrawerBody
      key={mode === "create" ? "new" : row?.update_id}
      row={row}
      mode={mode}
      onClose={onClose}
      onSave={onSave}
      requirementOptions={requirementOptions}
      actionOptions={actionOptions}
    />
  );
}

function DrawerBody({
  row,
  mode,
  onClose,
  onSave,
  requirementOptions,
  actionOptions,
}: {
  row: ShowroomUpdate | null;
  mode: UpdatesDrawerMode;
  onClose: () => void;
  onSave: (updateId: number | null, data: ShowroomUpdateSaveRequest) => Promise<void>;
  requirementOptions: ReadonlyArray<string>;
  actionOptions: ReadonlyArray<string>;
}) {
  const isCreate = mode === "create";
  const panelRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The history entry whose previous values are staged in the form. */
  const [restoredEventId, setRestoredEventId] = useState<number | null>(null);

  const { data: events, isLoading: eventsLoading } = useQuery({
    ...showroomUpdateEventsQueryOptions(row?.update_id ?? 0),
    // Nothing to fetch until the row exists.
    enabled: !isCreate && row != null,
  });

  // Focus starts inside the panel, once, so a later parent render cannot pull
  // the caret out of a field the person is typing in. The add form focuses its
  // first field instead.
  useEffect(() => {
    if (!isCreate) panelRef.current?.focus();
  }, [isCreate]);

  // Escape closes the drawer, unless a field's own popover (the Location map
  // pin) already claimed the key and cancelled it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const dirty = isCreate || (row != null && isDirty(row, draft));
  const needsDate = draft.status === "open" && draft.openDate === "";
  const hasIdentity = draft.showroomName.trim() !== "" && draft.location.trim() !== "";
  const canSave = dirty && hasIdentity && !saving;

  const upd = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  /** Put one entry's previous values back into the form; saving is separate. */
  const restore = (event: ShowroomUpdateEvent) => {
    const changes = Array.isArray(event.changes) ? event.changes : [];
    setDraft((prev) => ({ ...prev, ...restoredPatch(changes) }));
    setRestoredEventId(event.event_id);
    setError(null);
  };

  const save = async () => {
    if (!canSave) return;
    if (needsDate) {
      setError("An OPEN showroom needs its date open.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(isCreate ? null : (row?.update_id ?? null), requestOf(draft));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isCreate
            ? "Could not add this showroom."
            : "Could not save this showroom.",
      );
      setSaving(false);
    }
  };

  const subtitle = isCreate
    ? "Summary of SR status and updates"
    : `No. ${row?.sr_no} · ${row?.showroom_name ?? ""}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 motion-safe:animate-[fadeIn_.2s_ease-out]"
        onClick={() => {
          if (!saving) onClose();
        }}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sru-drawer-title"
        tabIndex={-1}
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-card text-card-foreground shadow-2xl outline-none motion-safe:animate-[slideIn_.22s_ease-out]"
      >
        <header
          className="relative shrink-0 overflow-hidden bg-[#0f1b4d] bg-cover bg-center px-5 py-4 text-white"
          style={{ backgroundImage: "url('/inventory/banner.webp')" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/35" aria-hidden="true" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="sru-drawer-title" className="text-lg font-semibold tracking-tight text-white">
                {isCreate ? "Add showroom" : "Edit showroom"}
              </h2>
              <p className="mt-0.5 truncate text-xs text-white/75" title={subtitle}>
                {subtitle}
              </p>
            </div>
            <button
              type="button"
              className="-mt-2 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onClose}
              aria-label="Close"
              disabled={saving}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-1">
          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Showroom</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="sru-name" className={LABEL}>
                  Showroom name
                </label>
                <input
                  id="sru-name"
                  type="text"
                  maxLength={120}
                  className={FIELD}
                  placeholder="e.g. Mun. of Roxas"
                  aria-required="true"
                  autoFocus={isCreate}
                  value={draft.showroomName}
                  onChange={(event) => upd({ showroomName: event.target.value })}
                />
              </div>

              <div>
                <label htmlFor="sru-location" className={LABEL}>
                  Location
                </label>
                <LocationMapLink
                  inputId="sru-location"
                  value={draft.location}
                  onValueChange={(location) => upd({ location })}
                  inputClassName={FIELD}
                  placeholder="e.g. Brgy. Poblacion, Roxas, ZDN"
                  mapUrl={draft.mapUrl}
                  mapLabel={draft.mapLabel}
                  onMapChange={(mapUrl, mapLabel) => upd({ mapUrl, mapLabel })}
                />
              </div>
            </div>
          </section>

          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Status</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sru-status" className={LABEL}>
                  Status
                </label>
                <ComboBox
                  id="sru-status"
                  value={draft.status}
                  emptyLabel="No status"
                  options={SHOWROOM_UPDATE_STATUSES.map((option) => ({
                    value: option.value,
                    label: option.chipLabel,
                  }))}
                  onChange={(value) => upd({ status: value })}
                />
              </div>

              <div>
                <label htmlFor="sru-person" className={LABEL}>
                  Responsible person
                </label>
                <ComboBox
                  id="sru-person"
                  value={draft.responsiblePerson}
                  emptyLabel="Unassigned"
                  options={SHOWROOM_UPDATE_RESPONSIBLE.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(value) => upd({ responsiblePerson: value })}
                />
              </div>
            </div>
          </section>

          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Requirements</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="sru-requirements" className={LABEL}>
                  Lacking requirements / missing documents
                </label>
                <SuggestionInput
                  id="sru-requirements"
                  value={draft.requirements}
                  options={requirementOptions}
                  placeholder="e.g. LGU permits"
                  maxLength={240}
                  onChange={(value) => upd({ requirements: value })}
                />
              </div>

              <div>
                <label htmlFor="sru-action" className={LABEL}>
                  Action required
                </label>
                <SuggestionInput
                  id="sru-action"
                  value={draft.actionRequired}
                  options={actionOptions}
                  placeholder="e.g. For signing"
                  maxLength={240}
                  onChange={(value) => upd({ actionRequired: value })}
                />
              </div>
            </div>
          </section>

          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Opening</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sru-remarks" className={LABEL}>
                  Remarks
                </label>
                <ComboBox
                  id="sru-remarks"
                  value={draft.remarks}
                  emptyLabel="No remark"
                  options={SHOWROOM_UPDATE_REMARKS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(value) => upd({ remarks: value })}
                />
              </div>

              <div>
                <label htmlFor="sru-open-date" className={LABEL}>
                  Date open
                </label>
                <input
                  id="sru-open-date"
                  type="date"
                  className={FIELD}
                  value={draft.openDate}
                  onChange={(event) => upd({ openDate: event.target.value })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {draft.openDate
                    ? `Opened ${showroomUpdateBoardDate(draft.openDate)}`
                    : "Leave empty until the showroom opens."}
                </p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="sru-vehicle" className={LABEL}>
                  Vehicle
                </label>
                <ComboBox
                  id="sru-vehicle"
                  value={draft.vehicle}
                  emptyLabel="Not set"
                  options={SHOWROOM_UPDATE_VEHICLES.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(value) => upd({ vehicle: value })}
                />
              </div>
            </div>
          </section>

          {!isCreate && row ? (
            <section className={SECTION}>
              <h3 className={`${SECTION_TITLE} flex items-center gap-2`}>
                <History className="size-4 text-muted-foreground" aria-hidden="true" />
                History
              </h3>
              <HistoryList
                events={events ?? []}
                loading={eventsLoading}
                restoredEventId={restoredEventId}
                onRestore={restore}
              />
            </section>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-border bg-card">
          {error ? (
            <p
              role="alert"
              className="mx-5 mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 px-5 py-3.5">
            {!isCreate && row ? (
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {row.updated_at
                  ? `Last edited ${eventTime(row.updated_at)}${row.updated_by ? ` by ${row.updated_by}` : ""}`
                  : "Never edited"}
              </span>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className={CANCEL_BUTTON} onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-[#c24a0e] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a83f0b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f1b4d] disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void save()}
                disabled={!canSave}
                aria-busy={saving}
                title={!dirty ? "No changes to save" : undefined}
              >
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {saving
                  ? isCreate
                    ? "Adding…"
                    : "Saving…"
                  : isCreate
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

function HistoryList({
  events,
  loading,
  restoredEventId,
  onRestore,
}: {
  events: ShowroomUpdateEvent[];
  loading: boolean;
  /** The entry whose previous values are currently staged in the form. */
  restoredEventId: number | null;
  onRestore: (event: ShowroomUpdateEvent) => void;
}) {
  const [visible, setVisible] = useState(HISTORY_INITIAL);
  // One batch for the lines on screen: the actor's face beside their name, from
  // the shared `["user-photos", …]` cache. A deleted account has no id and an
  // account without a photo simply misses from the map, so both fall back to
  // initials inside `ProfileHoverCard`.
  const photos = useUserPhotos(events.map((event) => event.actor_id));

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading history…</p>;
  }
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">No changes recorded yet.</p>;
  }

  const shown = events.slice(0, visible);
  // The next entry fades out under the list so the history visibly continues.
  const peek = events.length > visible ? events[visible] : null;

  return (
    <>
      <ol className="space-y-5">
        {shown.map((event) => (
          <HistoryEntry
            key={event.event_id}
            event={event}
            photo={event.actor_id ? photos[event.actor_id] : undefined}
            restored={restoredEventId === event.event_id}
            onRestore={onRestore}
          />
        ))}
        {peek ? (
          <HistoryEntry
            key={`peek-${peek.event_id}`}
            event={peek}
            photo={peek.actor_id ? photos[peek.actor_id] : undefined}
            restored={false}
            peek
            onRestore={onRestore}
          />
        ) : null}
      </ol>
      {peek ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((count) => count + HISTORY_STEP)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e]"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
            Show more
          </button>
        </div>
      ) : null}
    </>
  );
}

/** One audit line. `peek` renders the next entry as a faded, inert teaser. */
function HistoryEntry({
  event,
  photo,
  restored,
  peek = false,
  onRestore,
}: {
  event: ShowroomUpdateEvent;
  /** The actor's photo from the drawer's batch; missing means draw initials. */
  photo?: string | undefined;
  restored: boolean;
  peek?: boolean;
  onRestore: (event: ShowroomUpdateEvent) => void;
}) {
  // Older deploys answered `changes` as a JSON string; never let one malformed
  // row blank the drawer.
  const changes = Array.isArray(event.changes) ? event.changes : [];
  // Every edit can be undone, even one that filled a blank cell: restoring then
  // clears it back to `—`. Only the creation line has no "before".
  const canRestore =
    !peek &&
    changes.length > 0 &&
    !isCreationLine(changes) &&
    Object.keys(restoredPatch(changes)).length > 0;
  const fade = peek
    ? {
        maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)",
      }
    : undefined;

  return (
    <li
      className={peek ? "pointer-events-none select-none opacity-60 blur-[1px]" : undefined}
      style={fade}
      aria-hidden={peek || undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ProfileHoverCard
            userId={event.actor_id}
            photo={photo}
            name={event.actor_label}
            size={20}
          />
          <p className="truncate text-sm font-semibold text-foreground">{event.actor_label}</p>
        </div>
        <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.created_at}>
          {eventTime(event.created_at)}
        </time>
      </div>
      {changes.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {changes.map((change, index) => (
            <li
              key={`${event.event_id}-${index}`}
              className="text-[12.5px] leading-5 break-words text-muted-foreground"
            >
              <ChangeSentence change={change} />
            </li>
          ))}
        </ul>
      ) : null}
      {restored ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-[#c24a0e]" aria-hidden="true" />
          Restored. Press Save changes to keep it.
        </p>
      ) : canRestore ? (
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e]"
          onClick={() => onRestore(event)}
        >
          <Undo2 className="size-3.5" aria-hidden="true" />
          Restore previous values
        </button>
      ) : null}
    </li>
  );
}
