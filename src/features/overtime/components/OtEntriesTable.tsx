import { Plus, Trash2 } from "lucide-react";

import type { OtEntry } from "@/shared/types";

const EMPTY_ENTRY: Omit<OtEntry, "idx"> = {
  date_of_ot: "",
  regular_from: "",
  regular_to: "",
  actual_from: "",
  actual_to: "",
  total_hours: "",
  validation: "",
};

/**
 * The OT table, one row per date — the twin of the OB itinerary and the COS
 * schedule block. The template repeats its value row, so the entries are a list.
 */
export function OtEntriesTable({
  entries,
  setEntries,
  canEdit,
  busy,
}: {
  entries: OtEntry[];
  setEntries: (entries: OtEntry[]) => void;
  canEdit: boolean;
  busy: boolean;
}) {
  const reindex = (next: Omit<OtEntry, "idx">[]): OtEntry[] =>
    next.map((e, idx) => ({ idx, ...e }));

  const update = (idx: number, patch: Partial<OtEntry>) =>
    setEntries(entries.map((e) => (e.idx === idx ? { ...e, ...patch } : e)));

  return (
    <section className="form-fill flex shrink-0 flex-col rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Overtime</h2>
        {canEdit ? (
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={() => setEntries([...entries, { idx: entries.length, ...EMPTY_ENTRY }])}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add date</span>
          </button>
        ) : null}
      </div>

      <div className="min-h-0 space-y-3">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/50 px-4 py-8 text-center text-xs text-muted-foreground">
            No dates yet — click “Add date” to add the first OT line.
          </div>
        ) : (
          entries.map((entry, i) => (
            <div
              key={entry.idx}
              className="rounded-lg border bg-card p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  OT {i + 1}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn-outline size-7 p-0 text-destructive"
                    disabled={busy}
                    aria-label={`Remove OT line ${i + 1}`}
                    title="Remove line"
                    onClick={() => setEntries(reindex(entries.filter((e) => e.idx !== entry.idx)))}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="lbl">Date of OT Work</span>
                  <input
                    type="date"
                    className="inp"
                    disabled={!canEdit}
                    value={entry.date_of_ot}
                    aria-label={`Date of OT work ${i + 1}`}
                    onChange={(ev) => update(entry.idx, { date_of_ot: ev.target.value })}
                  />
                </label>

                <TimePair
                  label="Regular Shift Schedule"
                  index={i}
                  prefix="regular"
                  from={entry.regular_from}
                  to={entry.regular_to}
                  disabled={!canEdit}
                  onChange={(patch) => update(entry.idx, patch)}
                />
                <TimePair
                  label="Actual OT Hours"
                  index={i}
                  prefix="actual"
                  from={entry.actual_from}
                  to={entry.actual_to}
                  disabled={!canEdit}
                  onChange={(patch) => update(entry.idx, patch)}
                />

                <label className="block">
                  <span className="lbl">Total OT Hours</span>
                  <input
                    type="text"
                    className="inp"
                    disabled={!canEdit}
                    placeholder="e.g. 3"
                    value={entry.total_hours}
                    aria-label={`Total OT hours ${i + 1}`}
                    onChange={(ev) => update(entry.idx, { total_hours: ev.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="lbl">OT Validation</span>
                  <input
                    type="text"
                    className="inp"
                    disabled={!canEdit}
                    placeholder="For HR use only"
                    value={entry.validation}
                    aria-label={`OT validation ${i + 1}`}
                    onChange={(ev) => update(entry.idx, { validation: ev.target.value })}
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/** A FROM / TO pair of time pickers for one side of the row. */
function TimePair({
  label,
  index,
  prefix,
  from,
  to,
  disabled,
  onChange,
}: {
  label: string;
  index: number;
  /** Which side this is — the stored column names are prefixed. */
  prefix: "regular" | "actual";
  from: string;
  to: string;
  disabled: boolean;
  onChange: (patch: Partial<OtEntry>) => void;
}) {
  const set = (part: "from" | "to") => (value: string) =>
    onChange({ [`${prefix}_${part}`]: value } as Partial<OtEntry>);

  return (
    <div>
      <span className="lbl">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-muted-foreground">From</span>
          <input
            type="time"
            className="inp"
            disabled={disabled}
            value={from}
            aria-label={`${label} from ${index + 1}`}
            onChange={(ev) => set("from")(ev.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-muted-foreground">To</span>
          <input
            type="time"
            className="inp"
            disabled={disabled}
            value={to}
            aria-label={`${label} to ${index + 1}`}
            onChange={(ev) => set("to")(ev.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
