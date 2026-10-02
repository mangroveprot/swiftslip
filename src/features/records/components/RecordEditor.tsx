import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  FileDown,
  Loader2,
  Maximize2,
  Printer,
  Save as SaveIcon,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { importBiometricFile } from "@/api/biometric-import.functions";
import { deleteRecord, getRecord, saveRecord } from "@/api/records.functions";
import { ApprovedBadge } from "@/components/common/ApprovedBadge";
import { AttachmentCard } from "@/components/common/AttachmentCard";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { EditorSkeleton } from "@/components/common/Skeletons";
import { useSession } from "@/features/auth/use-session";
import { profileQueryOptions } from "@/features/profile/queries";
import { templateQueryOptions } from "@/features/template/queries";
import { fileToBase64 } from "@/lib/file";
import { toast } from "@/lib/toast";
import { MONTHS, daysForPeriod } from "@/shared/period";
import type { DtrEntry, DtrHeader, Period } from "@/shared/types";
import { APP } from "@/config/app";
import { applyImportedLog } from "../lib/biometric-import";
import { unmarkPendingRecord } from "../lib/pending-records";
import { isScaffoldRecord } from "../lib/scaffold";
import { downloadDtrWord } from "../lib/word-export";
import { recordQueryOptions, recordsQueryOptions } from "../queries";
import { DailyEntriesTable } from "./DailyEntriesTable";
import { DtrPreview } from "./DtrPreview";
import { RecordHeaderFields } from "./RecordHeaderFields";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** The daily entries worth persisting — a row counts only if it has any value. */
function buildEntries(map: Record<number, DtrEntry>): DtrEntry[] {
  return Object.values(map)
    .filter((e) => e.time_in || e.time_out || e.schedule || e.remarks)
    .sort((a, b) => a.day - b.day);
}

/** Write a save into the query cache WITHOUT dropping the `attachment` sibling —
 *  a bare `{ record, entries }` write replaces the whole entry, so the file the
 *  card renders would vanish until the next refetch. */
function writeRecordCache(
  qc: QueryClient,
  id: string,
  next: { record: DtrHeader & { id: string }; entries: DtrEntry[] },
) {
  qc.setQueryData(recordQueryOptions(id).queryKey, (prev) => (prev ? { ...prev, ...next } : next));
}

export function RecordEditor({ id }: { id: string }) {
  const session = useSession();
  const canEdit = Boolean(session);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data } = useQuery(recordQueryOptions(id));
  const { data: template } = useQuery(templateQueryOptions());
  const profileQuery = useQuery(profileQueryOptions());
  // Identity fields are auto-filled from the profile when a record is created, so
  // the profile is the reference for telling that auto-fill apart from content the
  // user actually typed.
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  const [header, setHeader] = useState<DtrHeader | null>(null);
  const [rows, setRows] = useState<Record<number, DtrEntry>>({});
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Serialized snapshot of what's already persisted, so we only save real changes.
  const savedSnapshotRef = useRef<string>("");
  // Frozen snapshot of the record as it was loaded — used on leave to detect that
  // the user left without any net change.
  const initialSnapshotRef = useRef<string>("");
  // Skip auto-save until the server data has been loaded into local state.
  const hydratedRef = useRef(false);
  // Whether the record loaded as an untouched auto-fill scaffold — only those can
  // be discarded when left without any net change.
  const wasScaffoldOnLoadRef = useRef(false);
  // The user deliberately committed content beyond the auto-fill (edited fields,
  // entries, signature, or imported a file). Once set, never auto-discarded.
  const keptRef = useRef(false);
  // Latest state, read by the unmount handler without re-subscribing it.
  const latestRef = useRef({ header, rows, canEdit, profile });
  latestRef.current = { header, rows, canEdit, profile };

  // Discarding is only allowed on a genuine exit. The router remounts this editor
  // while navigating away (that instance mounts after the location has already
  // changed) and StrictMode simulates an unmount right after mounting — neither
  // is an exit, and letting them decide would delete records the user kept.
  const mountPathRef = useRef(useRouterState({ select: (s) => s.location.pathname }));
  const mountedAtRef = useRef(Date.now());

  // Load the saved record into local edit state. Waits for the profile so the
  // scaffold decision compares against the same auto-fill the record was created with.
  useEffect(() => {
    if (!data || !profileReady) return;
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

    const entries = buildEntries(map);
    const incoming = JSON.stringify({ header: nextHeader, entries });

    if (hydratedRef.current) {
      const current = JSON.stringify({ header, entries: buildEntries(rows) });
      // Unsaved local edits always win — a save's cache write or a background
      // refetch must never clobber what the user is currently typing.
      if (current !== savedSnapshotRef.current) return;
      // Already in sync — reapplying identical values would just loop.
      if (current === incoming) return;
    }

    setHeader(nextHeader);
    setRows(map);
    savedSnapshotRef.current = incoming;
    initialSnapshotRef.current = incoming;
    // An attachment counts as real content: the file itself lives in storage, so
    // `data.attachment` is what tells the scaffold check it exists.
    wasScaffoldOnLoadRef.current = isScaffoldRecord(
      nextHeader,
      entries,
      profile,
      Boolean(data.attachment),
    );
    // A record that already holds real content is one the user meant to keep — lock
    // that in now so clearing a field later can never trigger the scaffold delete.
    // It also stops being a "pending" record the list is hiding.
    if (!wasScaffoldOnLoadRef.current) {
      keptRef.current = true;
      unmarkPendingRecord(id);
    }
    hydratedRef.current = true;
  }, [data, id, profile, profileReady, header, rows]);

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
          // Keep the query cache truthful: the router can remount this editor
          // during navigation, and that instance hydrates from the cache — it
          // must never mistake saved content for an untouched scaffold.
          writeRecordCache(qc, id, { record: { ...header, id }, entries });
          // Auto-save also fires for hydration-driven diffs, so only a save that
          // carries real content counts as a deliberate edit. Saving the bare
          // auto-fill keeps the record discardable — and still hidden from the list.
          if (!isScaffoldRecord(header, entries, latestRef.current.profile)) {
            keptRef.current = true;
            unmarkPendingRecord(id);
          }
          // The list shows this record's name and "Updated" time — mark it stale so
          // the next visit picks up what was just written.
          qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey, refetchType: "none" });
          setSaveStatus("saved");
        })
        .catch(() => setSaveStatus("error"));
    }, 1200);
    return () => clearTimeout(timer);
  }, [header, rows, canEdit, id, qc]);

  // Let the "Saved" confirmation linger briefly, then return the button to its
  // default Save icon/label.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // On leaving: discard a record that is still just the untouched auto-fill
  // scaffold (no committed content, no net change this session), or flush any
  // unsaved changes. Anything the user actually edited is always kept.
  useEffect(() => {
    // Captured here (at mount) — both refs are frozen after the first render.
    const mountPath = mountPathRef.current;
    const mountedAt = mountedAtRef.current;
    return () => {
      const { header: h, rows: r, canEdit: editable, profile: prof } = latestRef.current;
      if (!editable || !h) return;
      const entries = buildEntries(r);
      const snapshot = JSON.stringify({ header: h, entries });
      if (
        wasScaffoldOnLoadRef.current &&
        !keptRef.current &&
        snapshot === initialSnapshotRef.current
      ) {
        const genuineExit = mountPath.endsWith(`/${id}`) && Date.now() - mountedAt > 100;
        if (genuineExit) {
          // Re-check the server before discarding: this instance may have a stale
          // view (another tab's edit, a flush still in flight). Only a record that
          // is STILL an untouched scaffold gets deleted.
          void getRecord({ data: { id } })
            .then(({ record, entries: fresh, attachment }) => {
              if (!isScaffoldRecord(record, fresh, prof, Boolean(attachment))) {
                writeRecordCache(qc, id, { record, entries: fresh });
                return;
              }
              return deleteRecord({ data: { id, quiet: true } });
            })
            .then(() => {
              // Resolved either way — it gained content and is kept, or it is gone.
              unmarkPendingRecord(id);
              return qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey });
            })
            .catch(() => qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey }));
        }
        return;
      }
      if (snapshot !== savedSnapshotRef.current) {
        // Write the cache synchronously, before the network call: the remounted
        // instance hydrates within milliseconds and has to see these changes.
        writeRecordCache(qc, id, { record: { ...h, id }, entries });
        // Leaving with content is a decision to keep it, whatever it contains.
        unmarkPendingRecord(id);
        void saveRecord({ data: { id, header: h, entries } })
          .then(() => qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey }))
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!header || !template) return <EditorSkeleton />;

  const days = daysForPeriod(header.period, header.month, header.year);

  const row = (day: number): DtrEntry =>
    rows[day] ?? { day, time_in: "", time_out: "", schedule: "", remarks: "" };

  const setCell = (day: number, patch: Partial<DtrEntry>) =>
    setRows({ ...rows, [day]: { ...row(day), ...patch } });

  // Single place that writes to the server and records what's now persisted.
  // Saving real content marks the record kept so it's never auto-discarded later —
  // even if the user then clears it back. Saving the untouched scaffold (an
  // auto-fill the user never changed) does not: leaving it then discards it.
  async function persist(h: DtrHeader, entries: DtrEntry[]) {
    await saveRecord({ data: { id, header: h, entries } });
    savedSnapshotRef.current = JSON.stringify({ header: h, entries });
    // Keep the query cache truthful — a remounted editor hydrates from it and
    // must see what was just saved, or it would treat real content as a scaffold.
    writeRecordCache(qc, id, { record: { ...h, id }, entries });
    const scaffold = isScaffoldRecord(h, entries, profile);
    if (!scaffold) keptRef.current = true;
    // Pressing Save (or importing a log) is the user committing to this record,
    // so it stops being a "pending" auto-fill the list is hiding.
    unmarkPendingRecord(id);
    qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey, refetchType: "none" });
  }

  // A stored attachment is content: keep this record out of the scaffold discard
  // and off the hidden-pending list the moment the file lands.
  function handleAttachmentUploaded() {
    keptRef.current = true;
    unmarkPendingRecord(id);
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
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-5 md:py-4 lg:h-full lg:overflow-hidden print:block print:h-auto print:overflow-visible print:p-0">
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

      <div className="grid min-h-0 flex-1 gap-4 print:block lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div className="no-print flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <RecordHeaderFields
            header={header}
            setHeader={setHeader}
            template={template}
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

        {/* Attachment first, always — but on print it drops back below the
            sheet (`print:order`) so a supporting file still follows the
            record on its own page. */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden print:gap-0 print:overflow-visible">
          <div className="print:order-2">
            <AttachmentCard
              kind="record"
              id={id}
              file={data?.attachment ?? null}
              canEdit={canEdit}
              onUploaded={handleAttachmentUploaded}
              // A DTR has no approval flag: the attached file IS the approval.
              badge={<ApprovedBadge approved={Boolean(data?.attachment)} />}
            />
          </div>
          <div className="no-print flex shrink-0 items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Live preview
            </p>
            <button
              type="button"
              className="btn btn-outline size-7 p-0"
              aria-label="Open the full view"
              title="Full view — zoom in/out and drag the record around"
              onClick={() => setPreviewOpen(true)}
            >
              <Maximize2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 rounded-sm lg:flex-1 lg:overflow-auto print:order-1 print:overflow-visible">
            <DtrPreview
              sheetId="dtr-sheet"
              template={template}
              header={header}
              days={days}
              entryFor={row}
            />
          </div>
        </div>
      </div>

      <PreviewLightbox
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Daily Time Record — full view"
      >
        <DtrPreview template={template} header={header} days={days} entryFor={row} />
      </PreviewLightbox>
    </main>
  );
}
