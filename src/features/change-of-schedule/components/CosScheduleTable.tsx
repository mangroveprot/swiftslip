import { Plus, Trash2 } from "lucide-react";

import type { CosSchedule } from "@/shared/types";

const EMPTY_ROW: Omit<CosSchedule, "idx"> = {
  effectivity_date: "",
  from_date: "",
  from_start: "",
  from_end: "",
  to_date: "",
  to_start: "",
  to_end: "",
};

/**
 * The SCHEDULE block, one row per effectivity date — the COS twin of the OB
 * itinerary table. A change of schedule can cover more than one date, so the
 * rows are a list rather than three fixed fields.
 */
export function CosScheduleTable({
  rows,
  setRows,
  canEdit,
  busy,
}: {
  rows: CosSchedule[];
  setRows: (rows: CosSchedule[]) => void;
  canEdit: boolean;
  busy: boolean;
}) {
  function reindex(next: Omit<CosSchedule, "idx">[]): CosSchedule[] {
    return next.map((r, idx) => ({ idx, ...r }));
  }

  function update(idx: number, patch: Partial<CosSchedule>) {
    setRows(rows.map((r) => (r.idx === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows([...rows, { idx: rows.length, ...EMPTY_ROW }]);
  }

  function removeRow(idx: number) {
    setRows(reindex(rows.filter((r) => r.idx !== idx)));
  }

  return (
    <section className="form-fill flex min-h-0 flex-col rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Schedule</h2>
        {canEdit ? (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={addRow}>
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add date</span>
          </button>
        ) : null}
      </div>

      <div className="min-h-0 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/50 px-4 py-8 text-center text-xs text-muted-foreground">
            No dates yet — click “Add date” to add the first schedule line.
          </div>
        ) : (
          rows.map((row, i) => (
            <div
              key={row.idx}
              className="rounded-lg border bg-card p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  Schedule {i + 1}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn-outline size-7 p-0 text-destructive"
                    disabled={busy}
                    aria-label={`Remove schedule ${i + 1}`}
                    title="Remove schedule"
                    onClick={() => removeRow(row.idx)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="lbl">Effectivity Date</span>
                  <input
                    type="date"
                    className="inp"
                    disabled={!canEdit}
                    value={row.effectivity_date}
                    aria-label={`Effectivity date ${i + 1}`}
                    onChange={(ev) => update(row.idx, { effectivity_date: ev.target.value })}
                  />
                </label>
                {/* Each SCHEDULE side is the date it changes from/to plus that
                    shift's hours — the sheet prints them as one line. */}
                <ScheduleSide
                  label="Schedule — From"
                  index={i}
                  side="from"
                  date={row.from_date}
                  start={row.from_start}
                  end={row.from_end}
                  disabled={!canEdit}
                  onChange={(patch) => update(row.idx, patch)}
                />
                <ScheduleSide
                  label="Schedule — To"
                  index={i}
                  side="to"
                  date={row.to_date}
                  start={row.to_start}
                  end={row.to_end}
                  disabled={!canEdit}
                  onChange={(patch) => update(row.idx, patch)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * One SCHEDULE side (FROM or TO): the date it changes from/to, then that
 * shift's start and end. All three are pickers, so the sheet's
 * "10/07/2026 - 8am - 5pm" line is composed from them rather than typed.
 */
function ScheduleSide({
  label,
  index,
  side,
  date,
  start,
  end,
  disabled,
  onChange,
}: {
  label: string;
  index: number;
  /** Which half of the line this is — the stored column names are prefixed. */
  side: "from" | "to";
  date: string;
  start: string;
  end: string;
  disabled: boolean;
  onChange: (patch: Partial<CosSchedule>) => void;
}) {
  const set = (part: "date" | "start" | "end") => (value: string) =>
    onChange({ [`${side}_${part}`]: value } as Partial<CosSchedule>);

  return (
    <div>
      <span className="lbl">{label}</span>
      <input
        type="date"
        className="inp"
        disabled={disabled}
        value={date}
        aria-label={`${label} date ${index + 1}`}
        onChange={(ev) => set("date")(ev.target.value)}
      />
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-muted-foreground">Start</span>
          <input
            type="time"
            className="inp"
            disabled={disabled}
            value={start}
            aria-label={`${label} start time ${index + 1}`}
            onChange={(ev) => set("start")(ev.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-muted-foreground">End</span>
          <input
            type="time"
            className="inp"
            disabled={disabled}
            value={end}
            aria-label={`${label} end time ${index + 1}`}
            onChange={(ev) => set("end")(ev.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
