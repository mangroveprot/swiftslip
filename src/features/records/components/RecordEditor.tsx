import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  FileDown,
  Loader2,
  Maximize2,
  Printer,
  Save as SaveIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { importBiometricFile } from "@/api/biometric-import.functions";
import { createRecord, saveRecord } from "@/api/records.functions";
import { AiMascot } from "@/components/common/AiMascot";
import { ApprovedBadge } from "@/components/common/ApprovedBadge";
import { AttachmentCard } from "@/components/common/AttachmentCard";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { EditorSkeleton } from "@/components/common/Skeletons";
import { useSession } from "@/features/auth/use-session";
import { profileQueryOptions } from "@/features/profile/queries";
import { DTR_TEMPLATE } from "@/shared/dtr-template";
import { fileToBase64 } from "@/lib/file";
import { readSignatureBackup, saveSignatureBackup } from "@/lib/signature";
import { toast } from "@/lib/toast";
import { MONTHS, daysForPeriod } from "@/shared/period";
import type { DtrEntry, DtrHeader, EmployeeProfile, Period } from "@/shared/types";
import { APP } from "@/config/app";
import { applyImportedLog } from "../lib/biometric-import";
import { downloadDtrWord } from "../lib/word-export";
import { buildDraftRecordHeader, EMPTY_PROFILE } from "../lib/draft-form";
import {
  clearDraft,
  isDraftId,
  promoteDraft,
  promoteSignatureBackup,
  readDraft,
  writeDraft,
} from "@/lib/draft";
import {
  createAutoSave,
  flushOnPageHide,
  type SaveStatus as AutoSaveStatus,
} from "@/lib/auto-save";
import { recordQueryOptions, recordsQueryOptions } from "../queries";
import { DailyEntriesTable } from "./DailyEntriesTable";
import { DtrPreview } from "./DtrPreview";
import { RecordHeaderFields } from "./RecordHeaderFields";

type SaveStatus = "idle" | AutoSaveStatus;

const DRAFT_FEATURE = "dtr";

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

/**
 * One editor instance per record — including across that record's own save.
 * Saving a draft swaps `$id` from `draft_…` to the id `insertDraft` just
 * created: that is the SAME record, so the body must keep its mount (a
 * remount would flash the skeleton and drop the field being typed in over
 * content that never changed). Any other id is a different record and gets
 * the fresh instance the body's mount-time `rowId` init assumes.
 */
export function RecordEditor({ id }: { id: string }) {
  const [promotion, setPromotion] = useState<{ draft: string; real: string } | null>(null);
  // While the id points at this draft's own created row, keep following the
  // draft id — the key that has been stable since the draft was opened.
  const key = promotion && promotion.real === id ? promotion.draft : id;
  return (
    <RecordEditorBody
      key={key}
      id={id}
      onPromoted={(draft, real) => setPromotion({ draft, real })}
    />
  );
}

function RecordEditorBody({
  id,
  onPromoted,
}: {
  id: string;
  onPromoted: (draft: string, real: string) => void;
}) {
  const session = useSession();
  const canEdit = Boolean(session);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  // A draft id means this record does not exist in the database yet — nothing was
  // written when the user pressed "New record", and nothing will be until they
  // enter something of their own.
  const isDraft = isDraftId(id);
  // The row's real id, once it has one. `null` while the draft is still empty.
  const [rowId, setRowId] = useState<string | null>(isDraft ? null : id);
  const rowIdRef = useRef<string | null>(isDraft ? null : id);

  // Fetched only once there is a real id — a draft has nothing to load, which is
  // why opening one shows the form straight away instead of a skeleton.
  const { data } = useQuery({
    ...recordQueryOptions(rowId ?? ""),
    enabled: rowId !== null,
  });

  // Fixed form wording — the Settings → DTR template screen is gone.
  const template = DTR_TEMPLATE;
  const profileQuery = useQuery(profileQueryOptions());
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  const [header, setHeader] = useState<DtrHeader | null>(null);
  const [rows, setRows] = useState<Record<number, DtrEntry>>({});
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Latest state, read by callbacks that must not re-subscribe on every keystroke.
  const latestRef = useRef({ header, rows, canEdit });
  latestRef.current = { header, rows, canEdit };

  /** Everything the user could have changed, in one comparable string. */
  const snapshotOf = (h: DtrHeader, r: Record<number, DtrEntry>) =>
    JSON.stringify({ header: h, entries: buildEntries(r) });

  // What is on screen right now, for the load effect to compare against the
  // database before deciding whether a refetch may overwrite it.
  const localRef = useRef<string | null>(null);
  localRef.current = header ? snapshotOf(header, rows) : null;

  // Create the row the first time the form holds something real. Guarded so a
  // burst of keystrokes produces one insert, not one per keystroke.
  const insertingRef = useRef<Promise<string> | null>(null);

  const autoSave = useRef<ReturnType<typeof createAutoSave> | null>(null);
  if (autoSave.current === null) {
    autoSave.current = createAutoSave({
      // Nothing is persisted yet: a draft has no row, and a loaded record's
      // baseline is set by the load effect once its data arrives.
      initial: "",
      save: writeSnapshot,
      stageLocal: () => {
        const { header: h, rows: r } = latestRef.current;
        // Once the row exists the backup belongs to the real id — the draft key is
        // a different record by then.
        if (h) writeDraft(DRAFT_FEATURE, rowIdRef.current ?? id, { header: h, entries: r });
      },
      onStatus: (status) => setSaveStatus(status),
    });
  }
  const auto = autoSave.current;

  async function insertDraft(): Promise<string> {
    const existing = rowIdRef.current;
    if (existing) return existing;
    if (insertingRef.current) return insertingRef.current;
    const { header: h, rows: r } = latestRef.current;
    if (!h) throw new Error("This record is not ready yet.");
    insertingRef.current = (async () => {
      const { id: created } = await createRecord({
        data: { month: h.month, year: h.year, period: h.period },
      });
      const entries = buildEntries(r);
      // Save the content that triggered the insert in the same breath, so the row
      // never exists holding only the auto-fill.
      await saveRecord({ data: { id: created, header: h, entries } });
      rowIdRef.current = created;
      // Write cache BEFORE setRowId triggers a re-render that starts the query —
      // without this, the query fires against empty DB state and overwrites the
      // just-saved local state with nothing.
      writeRecordCache(qc, created, { record: { ...h, id: created }, entries });
      setRowId(created);
      // A signature drawn before the row existed was backed up under the draft id.
      promoteSignatureBackup("dtr", id, created);
      promoteDraft(DRAFT_FEATURE, id, created, { header: h, entries: r });
      // Mark persisted BEFORE navigate: an unmount flush must not see the draft
      // still pending — that would insert a second, blank row.
      auto.setPersisted(snapshotOf(h, r));
      // Keep this same editor mounted through the swap: the wrapper's key
      // follows this pair instead of remounting over unchanged content.
      onPromoted(id, created);
      // Swap the address bar to the real id, so Back, a reload and a shared link
      // all refer to the record that now exists.
      navigate({ to: "/records/$id", params: { id: created }, replace: true });
      qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey, refetchType: "none" });
      return created;
    })();
    try {
      return await insertingRef.current;
    } catch (e) {
      // Let the next attempt try again rather than caching the failure.
      insertingRef.current = null;
      throw e;
    }
  }

  /** Everything that reaches the database goes through here. */
  async function writeSnapshot(): Promise<void> {
    const { header: h, rows: r } = latestRef.current;
    if (!h) return;
    // insertDraft already writes content — a second save races and errors.
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const entries = buildEntries(r);
    const target = rowIdRef.current;
    await saveRecord({ data: { id: target, header: h, entries } });
    writeRecordCache(qc, target, { record: { ...h, id: target }, entries });
    qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey, refetchType: "none" });
  }

  // Load a real record into local edit state. Nothing here needs the profile:
  // the auto-fill comparison only applies to drafts.
  useEffect(() => {
    if (!data) return;
    const r = data.record as DtrHeader & { employee_signature?: string };
    const localSig = readSignatureBackup("dtr", rowId ?? id);
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

    const incoming = snapshotOf(nextHeader, map);
    // Unsaved local edits always win — a save's cache write or a background
    // refetch must never clobber what the user is currently typing.
    if (localRef.current !== null && localRef.current !== auto.persistedSnapshot()) return;
    if (localRef.current === incoming) return;
    setHeader(nextHeader);
    setRows(map);
    auto.setPersisted(incoming);
  }, [data, rowId, id, auto]);

  // Build a draft from the profile — in the browser, with no request. The starting
  // point becomes the baseline: whatever differs from it is something the user
  // actually entered, and that is what creates the row.
  useEffect(() => {
    if (!isDraft || !profileReady || header) return;
    const fresh = buildDraftRecordHeader((profile ?? EMPTY_PROFILE) as EmployeeProfile);
    // A refresh mid-draft brings the locally backed-up edits back.
    const stored = readDraft<{ header: DtrHeader; entries: DtrEntry[] }>(DRAFT_FEATURE, id);
    const restoredEntries: Record<number, DtrEntry> = {};
    for (const e of stored?.entries ?? []) restoredEntries[e.day] = e;
    const nextHeader = stored?.header ?? fresh;
    setHeader(nextHeader);
    setRows(restoredEntries);
    // Baseline = the pristine auto-fill. The insert fires only once the user
    // moves away from it.
    auto.setBaseline(snapshotOf(fresh, {}));
  }, [isDraft, profileReady, profile, header, id, auto]);

  // Keep a local backup of the signature so it survives a failed save. Derived
  // values only (not the header object), so the effect re-runs when the signature
  // changes — and skips the pre-hydration render where header is still null.
  const sig = header?.employee_signature;
  const headerLoaded = header !== null;
  useEffect(() => {
    if (!headerLoaded) return;
    saveSignatureBackup("dtr", rowId ?? id, sig);
  }, [headerLoaded, sig, rowId, id]);

  // The single trigger for every change: persist a draft that has become real
  // content, or arm the tiered save for a record that already exists.
  useEffect(() => {
    if (!header || !canEdit) return;
    const snapshot = snapshotOf(header, rows);
    if (rowIdRef.current) auto.arm(snapshot);
    else if (auto.belowBaseline(snapshot)) auto.arm(snapshot);
  }, [header, rows, canEdit, auto]);

  // Let the "Saved" confirmation linger briefly, then return the button to idle.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // Leaving: flush only once a real row exists. A draft with no row stays in
  // localStorage — flushing here would insert during StrictMode remounts.
  useEffect(() => {
    return () => {
      if (rowIdRef.current) auto.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the tab skips the unmount above, so persist on the way out too.
  useEffect(() => flushOnPageHide(auto), [auto]);

  // A draft needs the profile to build itself and a real record needs the server
  // copy; once either arrives the form is ready to render. The list warms the
  // profile query, so this is normally instant.
  if (!header) return <EditorSkeleton />;

  const days = daysForPeriod(header.period, header.month, header.year);

  const row = (day: number): DtrEntry =>
    rows[day] ?? { day, time_in: "", time_out: "", schedule: "", remarks: "" };

  const setCell = (day: number, patch: Partial<DtrEntry>) =>
    setRows({ ...rows, [day]: { ...row(day), ...patch } });

  /** Explicit Save — writes now rather than waiting for the timer. */
  async function persist(h: DtrHeader, entries: DtrEntry[]) {
    // insertDraft already writes content — don't save again on first create.
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const target = rowIdRef.current;
    await saveRecord({ data: { id: target, header: h, entries } });
    writeRecordCache(qc, target, { record: { ...h, id: target }, entries });
    auto.setPersisted(JSON.stringify({ header: h, entries }));
    qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey, refetchType: "none" });
  }

  /**
   * Resolve a real row id, creating the draft's row on the spot. Used by the Save
   * button and the attachment card: both are the user committing to this record,
   * so a pristine auto-fill counts as intent here even though it does not on its own.
   */
  async function ensureRow(): Promise<string> {
    return insertDraft();
  }

  async function onSave() {
    if (!header) return;
    const entries = buildEntries(rows);
    // Cancel any armed auto-save so it cannot insert/save in parallel with us.
    auto.setPersisted(snapshotOf(header, rows));
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
      toast.success(
        `Imported ${merged.count} day${merged.count === 1 ? "" : "s"}` +
          (merged.skipped
            ? `. ${merged.skipped} day${merged.skipped === 1 ? "" : "s"} from another month skipped. Switch the sheet to that month and import again.`
            : ""),
        { id: toastId },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!header) return;
    setBusy(true);
    const toastId = toast.loading("Preparing Word file…");
    try {
      await downloadDtrWord({
        template,
        header,
        days,
        entryFor: row,
        fileName: `${APP.name}_${header.name || "record"}_${MONTHS[header.month - 1]}_${header.year}.docx`,
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
                {/* The mascot marks this as the AI read — the label says upload. */}
                <AiMascot size="xs" />
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
            savedSignature={profile?.signature}
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
              id={rowId ?? id}
              file={data?.attachment ?? null}
              canEdit={canEdit}
              // A file is real content, so uploading one creates the row if the
              // form is still a draft.
              onEnsureRow={ensureRow}
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
