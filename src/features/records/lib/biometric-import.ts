import { customPeriod } from "@/shared/period";
import type { DtrEntry, DtrHeader, ImportedLog } from "@/shared/types";

/** Reads a File into base64 for the import server function. */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes.at(i) ?? 0);
  return btoa(binary);
}

/**
 * Merges an imported time log into the sheet being edited. Keeps existing
 * schedule/remarks, and switches the header to a custom period that spans the
 * imported days.
 */
export function applyImportedLog(
  log: ImportedLog,
  header: DtrHeader,
  rows: Record<number, DtrEntry>,
): { header: DtrHeader; rows: Record<number, DtrEntry>; count: number } {
  const first = log.entries[0];
  if (!first) throw new Error("No time log rows were found in that file.");

  const imported = log.entries.filter(
    (entry) => entry.month === first.month && entry.year === first.year,
  );
  const days = imported.map((entry) => entry.day);

  const nextHeader: DtrHeader = {
    ...header,
    emp_no: log.emp_no || header.emp_no,
    name: log.name || header.name,
    month: first.month,
    year: first.year,
    period: customPeriod(Math.min(...days), Math.max(...days), first.month, first.year),
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
  return { header: nextHeader, rows: nextRows, count: imported.length };
}
