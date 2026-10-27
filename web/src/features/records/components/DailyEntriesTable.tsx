import { formatShortDate, isSunday, dateOfDay } from "@swiftslip/shared/period";
import type { DtrEntry, DtrHeader, DtrTemplate } from "@swiftslip/shared/types";

export function DailyEntriesTable({
  template,
  header,
  days,
  entryFor,
  onCellChange,
  onClear,
  canEdit,
  busy,
}: {
  template: DtrTemplate;
  header: DtrHeader;
  days: number[];
  entryFor: (day: number) => DtrEntry;
  onCellChange: (day: number, patch: Partial<DtrEntry>) => void;
  onClear: () => void;
  canEdit: boolean;
  busy: boolean;
}) {
  const cellFields = ["time_in", "time_out", "schedule", "remarks"] as const;

  return (
    <section className="form-fill flex min-h-0 flex-col rounded-xl border bg-card p-3 shadow-sm lg:flex-1 lg:overflow-hidden">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Daily entries</h2>
        {canEdit ? (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="min-h-0 lg:flex-1 lg:overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="w-20 py-1.5">Date</th>
              <th className="py-1.5">{template.columns.in}</th>
              <th className="py-1.5">{template.columns.out}</th>
              <th className="py-1.5">{template.columns.schedule}</th>
              <th className="py-1.5">{template.columns.remarks}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const entry = entryFor(day);
              // A Sunday with a blank REMARKS cell prints as the rest-day note. It
              // is a placeholder only: nothing is written into the record, so a
              // typed remark is never overwritten.
              const date = dateOfDay(day, header.period, header.month, header.year);
              const sunday = isSunday(date.day, date.month, date.year);
              const restDay = sunday && !entry.remarks.trim();
              return (
                <tr key={day} className="border-t">
                  <td className="py-0.5 pr-2 text-xs text-muted-foreground">
                    {formatShortDate(day, header.month, header.year)}
                    {sunday ? (
                      <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                        Sun
                      </span>
                    ) : null}
                  </td>
                  {cellFields.map((field, i) => (
                    <td
                      key={field}
                      className={i === cellFields.length - 1 ? "py-0.5" : "py-0.5 pr-1.5"}
                    >
                      <input
                        className="inp"
                        disabled={!canEdit}
                        value={entry[field]}
                        placeholder={field === "remarks" && restDay ? "SUNDAY" : undefined}
                        onChange={(ev) => onCellChange(day, { [field]: ev.target.value })}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
