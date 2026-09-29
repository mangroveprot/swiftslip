import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileDown, Loader2, Printer, Save as SaveIcon, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { importBiometricFile } from "@/api/biometric-import.functions";
import { deleteRecord, saveRecord } from "@/api/records.functions";
import { useSession } from "@/features/auth/use-session";
import { templateQueryOptions } from "@/features/template/queries";
import { toast } from "@/lib/toast";
import { MONTHS, daysForPeriod } from "@/shared/period";
import type { DtrEntry, DtrHeader, Period } from "@/shared/types";
import { APP } from "@/config/app";
import { applyImportedLog, fileToBase64 } from "../lib/biometric-import";
import { downloadDtrWord } from "../lib/word-export";
import { recordQueryOptions, recordsQueryOptions } from "../queries";
import { DailyEntriesTable } from "./DailyEntriesTable";
import { DtrPreview } from "./DtrPreview";
import { RecordHeaderFields, type EmployeeOption } from "./RecordHeaderFields";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** The daily entries worth persisting — a row counts only if it has any value. */
function buildEntries(map: Record<number, DtrEntry>): DtrEntry[] {
  return Object.values(map)
    .filter((e) => e.time_in || e.time_out || e.schedule || e.remarks)
    .sort((a, b) => a.day - b.day);
}

/**
 * A record the user hasn't actually filled in: no entries, signature, certifier,
 * and no identity fields (name / emp_no). Typing a name or employee number counts
 * as meaningful content worth keeping, even without any daily entries.
 */
function isBlankRecord(header: DtrHeader, entries: DtrEntry[]): boolean {
  return (
    entries.length === 0 &&
    !header.employee_signature &&
    !header.certified_by?.trim() &&
    !header.name?.trim() &&
    !header.emp_no?.trim()
  );
}

export function RecordEditor({ id }: { id: string }) {
  const session = useSession();
  const canEdit = Boolean(session);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data } = useQuery(recordQueryOptions(id));
  const { data: template } = useQuery(templateQueryOptions());
  const { data: allRecords } = useQuery(recordsQueryOptions());

  const [header, setHeader] = useState<DtrHeader | null>(null);
  const [rows, setRows] = useState<Record<number, DtrEntry>>({});
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Serialized snapshot of what's already persisted, so we only save real changes.
  const savedSnapshotRef = useRef<string>("");
  // Skip auto-save until the server data has been loaded into local state.
  const hydratedRef = useRef(false);
  // Whether the record arrived empty — only those get discarded when left untouched.
  const wasBlankOnLoadRef = useRef(false);
  // The user deliberately committed this record (clicked Save / imported a file).
  // Once set, the record is never auto-discarded on leave, even if it looks blank.
  const keptRef = useRef(false);
  // Latest state, read by the unmount handler without re-subscribing it.
  const latestRef = useRef({ header, rows, canEdit });
  latestRef.current = { header, rows, canEdit };

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
    const nextHeader: DtrHeader = {
      emp_no: r.emp_no,
      name: r.name,
      designation: r.designation,
      area: r.area,
      month: r.month,
      year: r.year,
      period: r.period as Period,
      certified_by: r.certified_by,
      employee_signature: r.employee_signature || localSig || "",
    };
    const map: Record<number, DtrEntry> = {};
    for (const e of data.entries) map[e.day] = e;
    setHeader(nextHeader);
    setRows(map);

    const entries = buildEntries(map);
    savedSnapshotRef.current = JSON.stringify({ header: nextHeader, entries });
    wasBlankOnLoadRef.current = isBlankRecord(nextHeader, entries);
    // A record that already holds content is one the user meant to keep — lock that
    // in now so clearing a field later can never trigger the untouched-scaffold delete.
    if (!wasBlankOnLoadRef.current) keptRef.current = true;
    hydratedRef.current = true;
  }, [data, id]);

  // Keep a local backup of the signature so it survives a failed save.
  useEffect(() => {
    if (!header || typeof window === "undefined") return;
    if (header.employee_signature) localStorage.setItem(`dtr-sig:${id}`, header.employee_signature);
    else localStorage.removeItem(`dtr-sig:${id}`);
  }, [header?.employee_signature, id]);

  // Auto-save: after edits settle, persist quietly in the background.
  useEffect(() => {
    if (!hydratedRef.current || !header || !canEdit) return;
    const entries = buildEntries(rows);
    const snapshot = JSON.stringify({ header, entries });
    if (snapshot === savedSnapshotRef.current) return;
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      saveRecord({ data: { id, header, entries } })
        .then(() => {
          savedSnapshotRef.current = snapshot;
          if (!isBlankRecord(header, entries)) keptRef.current = true;
          setSaveStatus("saved");
        })
        .catch(() => setSaveStatus("error"));
    }, 1200);
    return () => clearTimeout(timer);
  }, [header, rows, canEdit, id]);

  // Let the "Saved" confirmation linger briefly, then return the button to its
  // default Save icon/label.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // On leaving: discard an untouched new record, or flush any unsaved changes.
  useEffect(() => {
    return () => {
      const { header: h, rows: r, canEdit: editable } = latestRef.current;
      if (!editable || !h) return;
      const entries = buildEntries(r);
      if (wasBlankOnLoadRef.current && !keptRef.current && isBlankRecord(h, entries)) {
        void deleteRecord({ data: { id } })
          .then(() => qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey }))
          .catch(() => {});
        return;
      }
      const snapshot = JSON.stringify({ header: h, entries });
      if (snapshot !== savedSnapshotRef.current) {
        void saveRecord({ data: { id, header: h, entries } })
          .then(() => qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey }))
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!header || !template) {
    return <main className="p-10 text-sm text-muted-foreground">Loading sheet…</main>;
  }

  const days = daysForPeriod(header.period, header.month, header.year);

  const row = (day: number): DtrEntry =>
    rows[day] ?? { day, time_in: "", time_out: "", schedule: "", remarks: "" };

  const setCell = (day: number, patch: Partial<DtrEntry>) =>
    setRows({ ...rows, [day]: { ...row(day), ...patch } });

  // Single place that writes to the server and records what's now persisted.
  // Once a record has held real content, mark it kept so it's never auto-discarded
  // later — even if the user then clears it back to blank.
  async function persist(h: DtrHeader, entries: DtrEntry[]) {
    await saveRecord({ data: { id, header: h, entries } });
    savedSnapshotRef.current = JSON.stringify({ header: h, entries });
    if (!isBlankRecord(h, entries)) keptRef.current = true;
  }

  async function onSave() {
    if (!header) return;
    const entries = buildEntries(rows);
    setBusy(true);
    setSaveStatus("saving");
    try {
      await persist(header, entries);
      setSaveStatus("saved");
      toast.success("Saved");
    } catch (e) {
      setSaveStatus("error");
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    if (!header) return;
    setBusy(true);
    const toastId = toast.loading("Reading the biometric record…");
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
      await persist(merged.header, buildEntries(merged.rows));
      setSaveStatus("saved");
      toast.success(`Imported ${merged.count} day${merged.count === 1 ? "" : "s"}`, {
        id: toastId,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!header || !template) return;
    setBusy(true);
    const toastId = toast.loading("Preparing Word file…");
    try {
      await downloadDtrWord({
        template,
        header,
        days,
        entryFor: row,
        fileName: `${APP.name}_${header.name || "record"}_${MONTHS[header.month - 1]}_${header.year}.doc`,
      });
      toast.success("Word file downloaded", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Word download failed.", { id: toastId });
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
                aria-label={
                  saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : "Save"
                }
                title="Save your changes to this time record"
                onClick={() => onSave()}
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : saveStatus === "saved" ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <SaveIcon className="size-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">
                  {saveStatus === "saving"
                    ? "Saving…"
                    : saveStatus === "saved"
                      ? "Saved"
                      : saveStatus === "error"
                        ? "Save failed"
                        : "Save"}
                </span>
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
              toast.success("Entries cleared");
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
