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

import { createCosForm, saveCosForm } from "@/api/cos.functions";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { EditorSkeleton } from "@/components/common/Skeletons";
import { useSession } from "@/features/auth/use-session";
import { profileQueryOptions } from "@/features/profile/queries";
import {
  createAutoSave,
  flushOnPageHide,
  type SaveStatus as AutoSaveStatus,
} from "@/lib/auto-save";
import {
  isDraftId,
  promoteDraft,
  promoteSignatureBackup,
  readDraft,
  writeDraft,
} from "@/lib/draft";
import { localToday } from "@/lib/form-draft";
import { readSignatureBackup, saveSignatureBackup } from "@/lib/signature";
import { toast } from "@/lib/toast";
import type { CosForm, CosSchedule } from "@/shared/types";
import { APP } from "@/config/app";
import { buildDraftCosForm } from "../lib/draft-form";
import { isBlankSchedule } from "../lib/schedule-line";
import { cosFormQueryOptions, cosFormsQueryOptions } from "../queries";
import { CosAssistantChat } from "./CosAssistantChat";
import { CosAttachmentCard } from "./CosAttachmentCard";
import { CosFormFields } from "./CosFormFields";
import { CosPreview } from "./CosPreview";
import { CosScheduleTable } from "./CosScheduleTable";

type SaveStatus = "idle" | AutoSaveStatus;

const DRAFT_FEATURE = "cos";

/** Schedule lines worth persisting — a row counts only if it has any value. */
function buildRows(rows: CosSchedule[]): CosSchedule[] {
  return rows.filter((r) => !isBlankSchedule(r)).map((r, idx) => ({ ...r, idx }));
}

/** Write a save into the query cache WITHOUT dropping the `attachment` sibling. */
function writeFormCache(
  qc: QueryClient,
  id: string,
  next: { form: CosForm & { id: string }; schedules: CosSchedule[] },
) {
  qc.setQueryData(cosFormQueryOptions(id).queryKey, (prev) => (prev ? { ...prev, ...next } : next));
}

/**
 * One editor per record — including across that record's own save. Saving a
 * draft swaps `$id` from `draft_…` to the row `insertDraft` just created: the
 * SAME record, so the body keeps its mount (a remount would flash the
 * skeleton over content that never changed). Any other id is a different
 * record and gets the fresh instance the body's mount-time `rowId` assumes.
 */
export function CosEditor({ id }: { id: string }) {
  const [promotion, setPromotion] = useState<{ draft: string; real: string } | null>(null);
  const key = promotion && promotion.real === id ? promotion.draft : id;
  return (
    <CosEditorBody key={key} id={id} onPromoted={(draft, real) => setPromotion({ draft, real })} />
  );
}

function CosEditorBody({
  id,
  onPromoted,
}: {
  id: string;
  onPromoted: (draft: string, real: string) => void;
}) {
  const session = useSession();
  const canEdit = Boolean(session);
  const qc = useQueryClient();
  const navigate = useNavigate();

  // A draft id means this form does not exist in the database yet — nothing was
  // written when the user pressed "New form", and nothing will be until they
  // enter something of their own.
  const isDraft = isDraftId(id);
  const [rowId, setRowId] = useState<string | null>(isDraft ? null : id);
  const rowIdRef = useRef<string | null>(isDraft ? null : id);

  const { data } = useQuery({
    ...cosFormQueryOptions(rowId ?? ""),
    enabled: rowId !== null,
  });
  const profileQuery = useQuery(profileQueryOptions());
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  const [form, setForm] = useState<CosForm | null>(null);
  const [rows, setRows] = useState<CosSchedule[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  const latestRef = useRef({ form, rows, canEdit });
  latestRef.current = { form, rows, canEdit };

  const snapshotOf = (f: CosForm, r: CosSchedule[]) =>
    JSON.stringify({ form: f, schedules: buildRows(r) });

  const localRef = useRef<string | null>(null);
  localRef.current = form ? snapshotOf(form, rows) : null;

  const insertingRef = useRef<Promise<string> | null>(null);

  const autoSave = useRef<ReturnType<typeof createAutoSave> | null>(null);
  if (autoSave.current === null) {
    autoSave.current = createAutoSave({
      initial: "",
      save: writeSnapshot,
      stageLocal: () => {
        const { form: f, rows: r } = latestRef.current;
        if (f) writeDraft(DRAFT_FEATURE, rowIdRef.current ?? id, { form: f, schedules: r });
      },
      onStatus: (status) => setSaveStatus(status),
    });
  }
  const auto = autoSave.current;

  async function insertDraft(): Promise<string> {
    const existing = rowIdRef.current;
    if (existing) return existing;
    if (insertingRef.current) return insertingRef.current;
    const { form: f, rows: r } = latestRef.current;
    if (!f) throw new Error("This form is not ready yet.");
    insertingRef.current = (async () => {
      const { id: created } = await createCosForm({
        data: { date_filed: f.date_filed || localToday() },
      });
      const schedules = buildRows(r);
      // Save the content that triggered the insert in the same breath, so the form
      // never exists holding only the auto-fill.
      await saveCosForm({ data: { id: created, form: f, schedules } });
      rowIdRef.current = created;
      setRowId(created);
      writeFormCache(qc, created, { form: { ...f, id: created }, schedules });
      promoteSignatureBackup("cos", id, created);
      promoteDraft(DRAFT_FEATURE, id, created, { form: f, schedules: r });
      // Mark persisted BEFORE navigate: an unmount flush must not see the draft
      // still pending — that would insert a second, blank row.
      auto.setPersisted(snapshotOf(f, r));
      // Keep this same editor mounted through the swap: the wrapper's key
      // follows this pair instead of remounting over unchanged content.
      onPromoted(id, created);
      navigate({ to: "/change-of-schedule/$id", params: { id: created }, replace: true });
      qc.invalidateQueries({ queryKey: cosFormsQueryOptions().queryKey, refetchType: "none" });
      return created;
    })();
    try {
      return await insertingRef.current;
    } catch (err) {
      insertingRef.current = null;
      throw err;
    }
  }

  /** Everything that reaches the database goes through here. */
  async function writeSnapshot(): Promise<void> {
    const { form: f, rows: r } = latestRef.current;
    if (!f) return;
    // insertDraft already writes content — a second save races and errors.
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const schedules = buildRows(r);
    const target = rowIdRef.current;
    await saveCosForm({ data: { id: target, form: f, schedules } });
    writeFormCache(qc, target, { form: { ...f, id: target }, schedules });
    qc.invalidateQueries({ queryKey: cosFormsQueryOptions().queryKey, refetchType: "none" });
  }

  // Load a real form into local edit state. Nothing here needs the profile: the
  // auto-fill comparison only applies to drafts.
  useEffect(() => {
    if (!data) return;
    const f = data.form;
    const localSig = readSignatureBackup("cos", rowId ?? id);
    const nextForm: CosForm = {
      id_number: f.id_number,
      employee_name: f.employee_name,
      plant_location: f.plant_location,
      position: f.position,
      date_filed: f.date_filed,
      change_type: f.change_type,
      employee_signature: f.employee_signature || localSig || "",
      reasons: f.reasons,
      approved_by: f.approved_by,
      received_by: f.received_by,
      processed_by: f.processed_by,
      approved_via_viber: f.approved_via_viber ?? false,
      attachment_approved: f.attachment_approved ?? false,
    };
    const nextRows = buildRows(data.schedules);
    const incoming = snapshotOf(nextForm, nextRows);
    // Unsaved local edits always win over a save's cache write or a refetch.
    if (localRef.current !== null && localRef.current !== auto.persistedSnapshot()) return;
    if (localRef.current === incoming) return;
    setForm(nextForm);
    setRows(nextRows);
    auto.setPersisted(incoming);
  }, [data, profileReady, rowId, id, auto]);

  // Build a draft from the profile — in the browser, with no request. The starting
  // point becomes the baseline: whatever differs from it is something the user
  // actually entered, and that is what creates the form.
  useEffect(() => {
    if (!isDraft || !profileReady || form) return;
    const fresh = buildDraftCosForm(profile ?? undefined);
    // A refresh mid-draft brings the locally backed-up edits back.
    const stored = readDraft<{ form: CosForm; schedules: CosSchedule[] }>(DRAFT_FEATURE, id);
    setForm(stored?.form ?? fresh);
    setRows(stored?.schedules ?? []);
    auto.setBaseline(snapshotOf(fresh, []));
  }, [isDraft, profileReady, profile, form, id, auto]);

  // Keep a local backup of the signature so it survives a failed save. Derived
  // values only (not the form object), so the effect re-runs when the signature
  // changes — and skips the pre-hydration render where form is still null.
  const sig = form?.employee_signature;
  const formLoaded = form !== null;
  useEffect(() => {
    if (!formLoaded) return;
    saveSignatureBackup("cos", rowId ?? id, sig);
  }, [formLoaded, sig, rowId, id]);

  // The single trigger for every change: persist a draft that has become real
  // content, or arm the tiered save for a form that already exists.
  useEffect(() => {
    if (!form || !canEdit) return;
    const snapshot = snapshotOf(form, rows);
    if (rowIdRef.current) auto.arm(snapshot);
    else if (auto.belowBaseline(snapshot)) auto.arm(snapshot);
  }, [form, rows, canEdit, auto]);

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

  if (!form) return <EditorSkeleton />;

  /** Explicit Save — writes now rather than waiting for the timer. */
  async function persist(f: CosForm, schedules: CosSchedule[]) {
    // insertDraft already writes content — don't save again on first create.
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const target = rowIdRef.current;
    await saveCosForm({ data: { id: target, form: f, schedules } });
    writeFormCache(qc, target, { form: { ...f, id: target }, schedules });
    auto.setPersisted(JSON.stringify({ form: f, schedules }));
    qc.invalidateQueries({ queryKey: cosFormsQueryOptions().queryKey, refetchType: "none" });
  }

  /** Resolve a real row id, creating the draft's row on the spot. */
  async function ensureRow(): Promise<string> {
    return insertDraft();
  }

  // The assistant replies with a partial patch; merge it into whatever is on
  // screen so it never clobbers something typed a moment ago. From here it flows
  // through the ordinary auto-save path like any other edit.
  function applyAssistantPatch(patch: Partial<CosForm>, schedules?: CosSchedule[]) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    if (schedules) setRows(schedules);
  }

  async function onSave() {
    if (!form) return;
    const schedules = buildRows(rows);
    // Cancel any armed auto-save so it cannot insert/save in parallel with us.
    auto.setPersisted(snapshotOf(form, rows));
    setBusy(true);
    setSaveStatus("saving");
    try {
      await persist(form, schedules);
      setSaveStatus("saved");
      toast.success("Saved");
    } catch (e) {
      setSaveStatus("error");
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!form) return;
    setBusy(true);
    const toastId = toast.loading("Preparing Word file…");
    try {
      // docxtemplater + pizzip are only needed when exporting (~330 kB) — keeping
      // them out of the route chunk makes opening this form much faster.
      const { downloadCosWord } = await import("../lib/word-export");
      await downloadCosWord({
        form,
        rows: buildRows(rows),
        fileName: `${APP.name}_COS_${form.employee_name || "form"}.docx`,
      });
      toast.success("Word file downloaded", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Word download failed.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  // Always at the top of the preview column — the upload prompt and an already
  // attached slip both belong where you look first.
  const attachmentCard = (
    <CosAttachmentCard
      id={rowId ?? id}
      form={form}
      setForm={setForm}
      canEdit={canEdit}
      attachment={data?.attachment ?? null}
      // A file is real content, so uploading one creates the row if the form is
      // still a draft.
      onEnsureRow={ensureRow}
    />
  );

  return (
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-5 md:py-4 lg:h-full lg:overflow-hidden print:block print:h-auto print:overflow-visible print:p-0">
      <div className="no-print mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Link
            to="/change-of-schedule"
            className="btn btn-outline mt-0.5 size-9 shrink-0 p-0"
            aria-label="Back to change of schedule forms"
            title="Back to change of schedule forms"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Change of Schedule
            </p>
            <h1 className="text-2xl font-semibold leading-tight">Change of Schedule Form</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <button
              className="btn btn-primary"
              disabled={busy}
              aria-label={
                saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : "Save"
              }
              title="Save your changes to this form"
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
            title="Download this form as a Word (.docx) file"
            onClick={() => download()}
          >
            <FileDown className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Download Word</span>
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 print:block lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="no-print flex min-h-0 flex-col gap-3 lg:overflow-auto">
          <CosFormFields
            form={form}
            setForm={setForm}
            canEdit={canEdit}
            savedSignature={profile?.signature}
          />
          <CosScheduleTable rows={rows} setRows={setRows} canEdit={canEdit} busy={busy} />
        </div>

        {/* Attachment first, always — but on print it drops back below the
            sheet (`print:order`) so a slip still follows the form on its own
            page. */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden print:gap-0 print:overflow-visible">
          <div className="print:order-2">{attachmentCard}</div>
          <div className="no-print flex shrink-0 items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Live preview
            </p>
            <button
              type="button"
              className="btn btn-outline size-7 p-0"
              aria-label="Open the full view"
              title="Full view — zoom in/out and drag the form around"
              onClick={() => setPreviewOpen(true)}
            >
              <Maximize2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 rounded-sm lg:flex-1 lg:overflow-auto print:order-1 print:overflow-visible">
            {/* The editor's rows as they stand — NOT the persisted subset — so
                adding a schedule line shows up in the sheet straight away. */}
            <CosPreview sheetId="cos-sheet" form={form} schedules={rows} />
          </div>
        </div>
      </div>

      {/* The assistant floats above the page (bottom-right bubble) so the
          preview column keeps its full height. */}
      {canEdit ? (
        <CosAssistantChat
          key={id}
          form={form}
          schedules={buildRows(rows)}
          onApply={applyAssistantPatch}
        />
      ) : null}
      <PreviewLightbox
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Change of Schedule Form — full view"
      >
        <CosPreview form={form} schedules={rows} />
      </PreviewLightbox>
    </main>
  );
}
