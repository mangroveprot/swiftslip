import { customPeriod, nextMonthOf, spanPeriod } from "@/shared/period";
import type { DtrEntry, DtrHeader, ImportedLog } from "@/shared/types";

type Dated = { month: number; day: number; year: number };
const keyOf = (e: Dated) => e.year * 10000 + e.month * 100 + e.day;
const sameMonthAs = (a: Dated) => (b: Dated) => a.month === b.month && a.year === b.year;

export function applyImportedLog(
  log: ImportedLog,
  header: DtrHeader,
  rows: Record<number, DtrEntry>,
): { header: DtrHeader; rows: Record<number, DtrEntry>; count: number; skipped: number } {
  const sorted = [...log.entries].sort((a, b) => keyOf(a) - keyOf(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) throw new Error("No time log rows were found in that file.");

  const next = nextMonthOf(first.month, first.year);
  const crossesIntoNext =
    last.month === next.month && last.year === next.year && last.day < first.day;

  let imported = sorted;
  let period;
  if (sameMonthAs(first)(last)) {
    period = customPeriod(first.day, last.day, first.month, first.year);
  } else if (crossesIntoNext) {
    period = spanPeriod(first.day, last.day, first.month, first.year);
  } else {
    // Longer than one month or not consecutive: a sheet can't hold it, keep the first month.
    imported = sorted.filter(sameMonthAs(first));
    const days = imported.map((e) => e.day);
    period = customPeriod(Math.min(...days), Math.max(...days), first.month, first.year);
  }

  const nextHeader: DtrHeader = {
    ...header,
    emp_no: log.emp_no || header.emp_no,
    name: log.name || header.name,
    month: first.month,
    year: first.year,
    period,
  };

  const nextRows = { ...rows };
  for (const entry of imported) {
    nextRows[entry.day] = {
      day: entry.day,
      time_in: entry.time_in,
      time_out: entry.time_out,
      schedule: nextRows[entry.day]?.schedule ?? "",
      remarks: nextRows[entry.day]?.remarks ?? "",
    };
  }
  return {
    header: nextHeader,
    rows: nextRows,
    count: imported.length,
    skipped: sorted.length - imported.length,
  };
}
