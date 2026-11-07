/**
 * What changed between the version HR last reviewed and the one an employee
 * sends back.
 *
 * The API stores a content snapshot on every submit (`ob_forms.submit_snapshot`,
 * migration 0038). On a resubmit it diffs the new content against it and writes
 * the result into `resubmit_history`, so both screens can say "You changed:
 * Purpose, Destination" and the HR sheet can mark the exact boxes — including
 * the old value ("Was: …") — without keeping a full version history.
 *
 * `key` is the same vocabulary `ob-required.ts` uses for a cell:
 * a form field name, or `entry:<idx>:<column>` for one itinerary cell.
 */
import type { ObEntry, ObForm } from "./types";
import type { ObResubmitChange, ObSubmitSnapshot } from "./hr";

/** The header fields compared on a resubmit. Signatures and booleans are out. */
const FORM_FIELDS = [
  { key: "id_number", label: "ID number" },
  { key: "employee_name", label: "Employee name" },
  { key: "department", label: "Department / location" },
  { key: "position", label: "Position" },
  { key: "date_filed", label: "Date filed" },
  { key: "date_of_ob", label: "Date of OB" },
  { key: "approved_by", label: "Approved by" },
] as const;

type SnapshotFormKey = (typeof FORM_FIELDS)[number]["key"];

/** The itinerary cells compared on a resubmit — the boxes HR actually reads. */
const ENTRY_FIELDS = [
  { key: "from_place", label: "From" },
  { key: "to_place", label: "Destination" },
  { key: "purpose", label: "Purpose" },
  { key: "time_departure", label: "Departure time" },
  { key: "time_return", label: "Return time" },
] as const;

type SnapshotEntryKey = (typeof ENTRY_FIELDS)[number]["key"];

const trim = (value: unknown) => String(value ?? "").trim();

/** The content HR just reviewed, in a shape small enough to store on the row. */
export function obSubmitSnapshot(form: ObForm, entries: readonly ObEntry[]): ObSubmitSnapshot {
  const snapshotForm: Record<string, string> = {};
  for (const { key } of FORM_FIELDS) {
    snapshotForm[key] = trim((form as unknown as Record<string, unknown>)[key]);
  }

  return {
    form: snapshotForm,
    entries: [...entries]
      .sort((left, right) => left.idx - right.idx)
      .map((entry) => ({
        idx: entry.idx,
        from_place: trim(entry.from_place),
        to_place: trim(entry.to_place),
        purpose: trim(entry.purpose),
        time_departure: trim(entry.time_departure),
        time_return: trim(entry.time_return),
      })),
  };
}

/**
 * Every field whose value differs, in the order the paper form prints it.
 * Entries are compared by position (oldest snapshot first), never by their
 * stored `idx`, so a re-indexed itinerary does not look like a full rewrite.
 * A legacy row with no snapshot has no baseline: it returns no changes rather
 * than claiming everything changed.
 */
export function obResubmitChanges(
  previous: ObSubmitSnapshot | null | undefined,
  next: ObSubmitSnapshot,
): ObResubmitChange[] {
  if (!previous) return [];

  const changes: ObResubmitChange[] = [];

  for (const { key, label } of FORM_FIELDS) {
    const from = trim(previous.form[key]);
    const to = trim(next.form[key]);
    if (from !== to) changes.push({ key, label, from, to });
  }

  const count = Math.max(previous.entries.length, next.entries.length);
  for (let position = 0; position < count; position += 1) {
    const before = previous.entries[position];
    const after = next.entries[position];
    if (!before && !after) continue;
    // Use the NEW idx so the HR sheet can match `entry:<idx>:<column>` against
    // the rows it is rendering.
    const idx = after?.idx ?? before?.idx ?? position;

    for (const { key, label } of ENTRY_FIELDS) {
      const from = trim(before?.[key as SnapshotEntryKey]);
      const to = trim(after?.[key as SnapshotEntryKey]);
      if (from !== to) changes.push({ key: `entry:${idx}:${key}`, label, from, to });
    }
  }

  return changes;
}

/**
 * The form key a change belongs to, or `entries` when it is an itinerary cell.
 * The HR sheet uses this to ask "was this box changed?" without re-deriving the
 * key format in the browser.
 */
export function obChangeFieldKey(change: Pick<ObResubmitChange, "key">): string {
  return change.key.startsWith("entry:") ? "entries" : change.key;
}

export type { SnapshotEntryKey, SnapshotFormKey };
