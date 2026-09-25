import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Printer, Save as SaveIcon, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { importBiometricFile } from "@/api/biometric-import.functions";
import { saveRecord } from "@/api/records.functions";
import { useSession } from "@/features/auth/use-session";
import { templateQueryOptions } from "@/features/template/queries";
import { MONTHS, daysForPeriod } from "@/shared/period";
import type { DtrEntry, DtrHeader, Period } from "@/shared/types";
import { APP } from "@/config/app";
import { applyImportedLog, fileToBase64 } from "../lib/biometric-import";
import { downloadDtrWord } from "../lib/word-export";
import { recordQueryOptions, recordsQueryOptions } from "../queries";
import { DailyEntriesTable } from "./DailyEntriesTable";
import { DtrPreview } from "./DtrPreview";
import { RecordHeaderFields, type EmployeeOption } from "./RecordHeaderFields";

export function RecordEditor({ id }: { id: string }) {
  const session = useSession();
  const canEdit = Boolean(session);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery(recordQueryOptions(id));
  const { data: template } = useQuery(templateQueryOptions());
  const { data: allRecords } = useQuery(recordsQueryOptions());

  const [header, setHeader] = useState<DtrHeader | null>(null);
  const [rows, setRows] = useState<Record<number, DtrEntry>>({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, EmployeeOption>();
    for (const r of (allRecords ?? []) as EmployeeOption[]) {
      const name = (r.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, r);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allRecords]);

  // Load the saved record into local edit state.
  useEffect(() => {
    if (!data) return;
    const r = data.record as DtrHeader & { employee_signature?: string };
    const localSig =
      typeof window !== "undefined" ? (localStorage.getItem(`dtr-sig:${id}`) ?? "") : "";
    setHeader({
      emp_no: r.emp_no,
      name: r.name,
      designation: r.designation,
      area: r.area,
      month: r.month,
      year: r.year,
      period: r.period as Period,
      certified_by: r.certified_by,
      employee_signature: r.employee_signature || localSig || "",
    });
    const map: Record<number, DtrEntry> = {};
    for (const e of data.entries) map[e.day] = e;
    setRows(map);
  }, [data, id]);

  // Keep a local backup of the signature so it survives a failed save.
  useEffect(() => {
    if (!header || typeof window === "undefined") return;
    if (header.employee_signature) localStorage.setItem(`dtr-sig:${id}`, header.employee_signature);
    else localStorage.removeItem(`dtr-sig:${id}`);
  }, [header?.employee_signature, id]);

  if (!header || !template) {
    return <main className="p-10 text-sm text-muted-foreground">Loading sheet…</main>;
  }

  const days = daysForPeriod(header.period, header.month, header.year);

  const row = (day: number): DtrEntry =>
    rows[day] ?? { day, time_in: "", time_out: "", schedule: "", remarks: "" };

  const setCell = (day: number, patch: Partial<DtrEntry>) =>
    setRows({ ...rows, [day]: { ...row(day), ...patch } });

  function flash(message: string, ms = 2000) {
    setStatus(message);
    setTimeout(() => setStatus(""), ms);
  }

  async function onSave(next?: Record<number, DtrEntry>, nextHeader?: DtrHeader) {
    const h = nextHeader ?? header;
    if (!h) return;
    const entries = Object.values(next ?? rows)
      .filter((e) => e.time_in || e.time_out || e.schedule || e.remarks)
      .sort((a, b) => a.day - b.day);
    setBusy(true);
    try {
      await saveRecord({ data: { id, header: h, entries } });
      flash("Saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    if (!header) return;
    setBusy(true);
    setStatus("Reading the biometric record…");
    try {
      const log = await importBiometricFile({
        data: {
          filename: file.name,
          mimeType: file.type || "application/pdf",
          base64: await fileToBase64(file),
        },
      });
      const merged = applyImportedLog(log, header, rows);
      setHeader(merged.header);
      setRows(merged.rows);
      await onSave(merged.rows, merged.header);
      setStatus(`Imported ${merged.count} day${merged.count === 1 ? "" : "s"}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!header || !template) return;
    setBusy(true);
    setStatus("Preparing Word file…");
    try {
      await downloadDtrWord({
        template,
        header,
        days,
        entryFor: row,
        fileName: `${APP.name}_${header.name || "record"}_${MONTHS[header.month - 1]}_${header.year}.doc`,
      });
      flash("Word file downloaded");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Word download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-5 md:py-4 lg:h-full lg:overflow-hidden print:h-auto print:overflow-visible print:p-0">
      <div className="no-print mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Link
            to="/records"
            className="btn btn-outline mt-0.5 size-9 shrink-0 p-0"
            aria-label="Back to time records"
            title="Back to time records"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Attendance
            </p>
            <h1 className="text-2xl font-semibold leading-tight">Daily Time Record</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <button
                className="btn btn-accent"
                disabled={busy}
                aria-label="Import from biometric record"
                title="Upload a scanned or photographed biometric log (PDF or image) to auto-fill the days below"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Import from biometric record</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
              <button
                className="btn btn-primary"
                disabled={busy}
                aria-label="Save"
                title="Save your changes to this time record"
                onClick={() => onSave()}
              >
                <SaveIcon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Save</span>
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn btn-outline"
            aria-label="Print or save as PDF"
            title='Open the print dialog — choose "Save as PDF" as the destination to export a PDF'
            onClick={() => window.print()}
          >
            <Printer className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Print / Save as PDF</span>
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            aria-label="Download Word"
            title="Download this time record as a Word (.doc) file"
            onClick={() => download()}
          >
            <FileDown className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Download Word</span>
          </button>
          {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div className="no-print flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <RecordHeaderFields
            header={header}
            setHeader={setHeader}
            template={template}
            employeeOptions={employeeOptions}
            canEdit={canEdit}
          />
          <DailyEntriesTable
            template={template}
            header={header}
            days={days}
            entryFor={row}
            onCellChange={setCell}
            onClear={() => {
              setRows({});
              flash("Entries cleared");
            }}
            canEdit={canEdit}
            busy={busy}
          />
        </div>

        <div className="flex min-h-0 flex-col lg:overflow-hidden print:overflow-visible">
          <p className="no-print mb-1.5 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
            Live preview
          </p>
          <div className="min-h-0 rounded-sm lg:flex-1 lg:overflow-auto print:overflow-visible">
            <DtrPreview template={template} header={header} days={days} entryFor={row} />
          </div>
        </div>
      </div>
    </main>
  );
}
