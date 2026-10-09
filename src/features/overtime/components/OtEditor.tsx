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

import { createOtForm, saveOtForm } from "@/api/ot.functions";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { OtherAttachmentsPrint } from "@/components/common/OtherAttachmentsPrint";
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
import type { OtEntry, OtForm } from "@/shared/types";
import { APP } from "@/config/app";
import { buildDraftOtForm } from "../lib/draft-form";
import { isBlankOtEntry } from "../lib/ot-line";
import { otFormQueryOptions, otFormsQueryOptions, otOtherUrlsQueryOptions } from "../queries";
import { OtAssistantChat } from "./OtAssistantChat";
import { OtAttachmentCard } from "./OtAttachmentCard";
import { OtEntriesTable } from "./OtEntriesTable";
import { OtFormFields } from "./OtFormFields";
import { OtOtherAttachmentsCard } from "./OtOtherAttachmentsCard";
import { OtPreview } from "./OtPreview";

type SaveStatus = "idle" | AutoSaveStatus;

const DRAFT_FEATURE = "ot";

/** OT lines worth persisting — a row counts only if it has any value. */
function buildEntries(entries: OtEntry[]): OtEntry[] {
  return entries.filter((e) => !isBlankOtEntry(e)).map((e, idx) => ({ ...e, idx }));
}

/** Write a save into the query cache WITHOUT dropping the `attachment` sibling. */
function writeFormCache(
  qc: QueryClient,
  id: string,
  next: { form: OtForm & { id: string }; entries: OtEntry[] },
) {
  qc.setQueryData(otFormQueryOptions(id).queryKey, (prev) =>
    prev ? { ...prev, ...next } : { ...next, others: [] },
  );
}

/**
 * One editor per record — including across that record's own save. Saving a
 * draft swaps `$id` from `draft_…` to the row `insertDraft` just created: the
 * SAME record, so the body keeps its mount (a remount would flash the
 * skeleton over content that never changed). Any other id is a different
 * record and gets the fresh instance the body's mount-time `rowId` assumes.
 */
export function OtEditor({ id }: { id: string }) {
  const [promotion, setPromotion] = useState<{ draft: string; real: string } | null>(null);
  const key = promotion && promotion.real === id ? promotion.draft : id;
  return (
    <OtEditorBody key={key} id={id} onPromoted={(draft, real) => setPromotion({ draft, real })} />
  );
}

function OtEditorBody({
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
  // written when the user pressed "New form", and nothing will be until they enter
  // something of their own.
  const isDraft = isDraftId(id);
  const [rowId, setRowId] = useState<string | null>(isDraft ? null : id);
  const rowIdRef = useRef<string | null>(isDraft ? null : id);

  const { data } = useQuery({
    ...otFormQueryOptions(rowId ?? ""),
    enabled: rowId !== null,
  });
  const profileQuery = useQuery(profileQueryOptions());
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  // The extra attachments, plus their signed links. The card in the form column
  // lists them and the print pages below render them; both read this one query.
  const others = data?.others ?? [];
  const { data: otherUrls } = useQuery({
    ...otOtherUrlsQueryOptions(rowId ?? ""),
    enabled: rowId !== null && others.length > 0,
  });

  const [form, setForm] = useState<OtForm | null>(null);
  const [entries, setEntries] = useState<OtEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  const latestRef = useRef({ form, entries, canEdit });
  latestRef.current = { form, entries, canEdit };

  const snapshotOf = (f: OtForm, e: OtEntry[]) =>
    JSON.stringify({ form: f, entries: buildEntries(e) });

  const localRef = useRef<string | null>(null);
  localRef.current = form ? snapshotOf(form, entries) : null;

  const insertingRef = useRef<Promise<string> | null>(null);

  const autoSave = useRef<ReturnType<typeof createAutoSave> | null>(null);
  if (autoSave.current === null) {
    autoSave.current = createAutoSave({
      initial: "",
      save: writeSnapshot,
      stageLocal: () => {
        const { form: f, entries: e } = latestRef.current;
        if (f) writeDraft(DRAFT_FEATURE, rowIdRef.current ?? id, { form: f, entries: e });
      },
      onStatus: (status) => setSaveStatus(status),
    });
  }
  const auto = autoSave.current;

  async function insertDraft(): Promise<string> {
    const existing = rowIdRef.current;
    if (existing) return existing;
    if (insertingRef.current) return insertingRef.current;
    const { form: f, entries: e } = latestRef.current;
    if (!f) throw new Error("This form is not ready yet.");
    insertingRef.current = (async () => {
      const { id: created } = await createOtForm({
        data: { date_filed: f.date_filed || localToday() },
      });
      const rows = buildEntries(e);
      // Save the content that triggered the insert in the same breath, so the form
      // never exists holding only the auto-fill.
      await saveOtForm({ data: { id: created, form: f, entries: rows } });
      rowIdRef.current = created;
      setRowId(created);
      writeFormCache(qc, created, { form: { ...f, id: created }, entries: rows });
      promoteSignatureBackup("ot", id, created);
      promoteDraft(DRAFT_FEATURE, id, created, { form: f, entries: e });
      // Mark persisted BEFORE navigate: an unmount flush must not see the draft
      // still pending — that would insert a second, blank row.
      auto.setPersisted(snapshotOf(f, e));
      // Keep this same editor mounted through the swap: the wrapper's key
      // follows this pair instead of remounting over unchanged content.
      onPromoted(id, created);
      navigate({ to: "/overtime/$id", params: { id: created }, replace: true });
      qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey, refetchType: "none" });
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
    const { form: f, entries: e } = latestRef.current;
    if (!f) return;
    // insertDraft already writes content — a second save races and errors.
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const rows = buildEntries(e);
    const target = rowIdRef.current;
    await saveOtForm({ data: { id: target, form: f, entries: rows } });
    writeFormCache(qc, target, { form: { ...f, id: target }, entries: rows });
    qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey, refetchType: "none" });
  }

  // Load a real form into local edit state. Nothing here needs the profile: the
  // auto-fill comparison only applies to drafts.
  useEffect(() => {
    if (!data) return;
    const f = data.form;
    const localSig = readSignatureBackup("ot", rowId ?? id);
    const nextForm: OtForm = {
      id_number: f.id_number,
      employee_name: f.employee_name,
      department: f.department,
      position: f.position,
      date_filed: f.date_filed,
      employee_signature: f.employee_signature || localSig || "",
      reasons: f.reasons,
      approved_by: f.approved_by,
      received_by: f.received_by,
      processed_by: f.processed_by,
      approved_via_viber: f.approved_via_viber ?? false,
      attachment_approved: f.attachment_approved ?? false,
    };
    const nextEntries = buildEntries(data.entries);
    const incoming = snapshotOf(nextForm, nextEntries);
    // Unsaved local edits always win over a save's cache write or a refetch.
    if (localRef.current !== null && localRef.current !== auto.persistedSnapshot()) return;
    if (localRef.current === incoming) return;
    setForm(nextForm);
    setEntries(nextEntries);
    auto.setPersisted(incoming);
  }, [data, profileReady, rowId, id, auto]);

  // Build a draft from the profile — in the browser, with no request. The starting
  // point becomes the baseline: whatever differs from it is something the user
  // actually entered, and that is what creates the form.
  useEffect(() => {
    if (!isDraft || !profileReady || form) return;
    const fresh = buildDraftOtForm(profile ?? undefined);
    // A refresh mid-draft brings the locally backed-up edits back.
    const stored = readDraft<{ form: OtForm; entries: OtEntry[] }>(DRAFT_FEATURE, id);
    setForm(stored?.form ?? fresh);
    setEntries(stored?.entries ?? []);
    auto.setBaseline(snapshotOf(fresh, []));
  }, [isDraft, profileReady, profile, form, id, auto]);

  // Keep a local backup of the signature so it survives a failed save.
  const sig = form?.employee_signature ?? "";
  const formLoaded = form !== null;
  useEffect(() => {
    if (!formLoaded) return;
    saveSignatureBackup("ot", rowId ?? id, sig);
  }, [formLoaded, sig, rowId, id]);

  // The single trigger for every change: persist a draft that has become real
  // content, or arm the tiered save for a form that already exists.
  useEffect(() => {
    if (!form || !canEdit) return;
    const snapshot = snapshotOf(form, entries);
    if (rowIdRef.current) auto.arm(snapshot);
    else if (auto.belowBaseline(snapshot)) auto.arm(snapshot);
  }, [form, entries, canEdit, auto]);

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
  async function persist(f: OtForm, rows: OtEntry[]) {
    // insertDraft already writes content — don't save again on first create.
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const target = rowIdRef.current;
    await saveOtForm({ data: { id: target, form: f, entries: rows } });
    writeFormCache(qc, target, { form: { ...f, id: target }, entries: rows });
    auto.setPersisted(JSON.stringify({ form: f, entries: rows }));
    qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey, refetchType: "none" });
  }

  /** Resolve a real row id, creating the draft's row on the spot. */
  async function ensureRow(): Promise<string> {
    return insertDraft();
  }

  // The assistant replies with a partial patch; merge it into whatever is on
  // screen so it never clobbers something typed a moment ago. From here it flows
  // through the ordinary auto-save path like any other edit.
  function applyAssistantPatch(patch: Partial<OtForm>, nextEntries?: OtEntry[]) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    if (nextEntries) setEntries(nextEntries);
  }

  async function onSave() {
    if (!form) return;
    const rows = buildEntries(entries);
    // Cancel any armed auto-save so it cannot insert/save in parallel with us.
    auto.setPersisted(snapshotOf(form, entries));
    setBusy(true);
    setSaveStatus("saving");
    try {
      await persist(form, rows);
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
      const { downloadOtWord } = await import("../lib/word-export");
      await downloadOtWord({
        form,
        entries: buildEntries(entries),
        fileName: `${APP.name}_OT_${form.employee_name || "form"}.docx`,
      });
      toast.success("Word file downloaded", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Word download failed.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  const attachmentCard = (
    <OtAttachmentCard
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
            to="/overtime"
            className="btn btn-outline mt-0.5 size-9 shrink-0 p-0"
            aria-label="Back to overtime forms"
            title="Back to overtime forms"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Overtime
            </p>
            <h1 className="text-2xl font-semibold leading-tight">Overtime Authorization Form</h1>
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 print:block lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="no-print flex min-h-0 flex-col gap-3 lg:overflow-auto">
          <OtFormFields
            form={form}
            setForm={setForm}
            canEdit={canEdit}
            savedSignature={profile?.signature}
          />
          <OtEntriesTable entries={entries} setEntries={setEntries} canEdit={canEdit} busy={busy} />
          {/* The other documents sit at the bottom of the form — the approval
              attachment keeps the top of the preview column. This card is
              screen-only; its printable copies are mounted in the preview
              column below. */}
          <OtOtherAttachmentsCard id={rowId ?? id} canEdit={canEdit} others={others} />
        </div>

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
                adding an OT line shows up in the sheet straight away. */}
            <OtPreview sheetId="ot-sheet" form={form} entries={entries} />
          </div>
          {/* The printable "other attachments", after everything else on paper.
              They have to live HERE, in the column that isn't `.no-print`, and
              not inside the card — the form column is `display: none` on paper,
              which would take them with it. `print:order-3` follows the sheet
              (1) and the approval slip (2). Renders nothing when no attached
              file is printable. */}
          <OtherAttachmentsPrint files={others} urls={otherUrls} className="print:order-3" />
        </div>
      </div>

      {/* The assistant floats above the page (bottom-right bubble) so the
          preview column keeps its full height. */}
      {canEdit ? (
        <OtAssistantChat key={id} form={form} entries={entries} onApply={applyAssistantPatch} />
      ) : null}
      <PreviewLightbox
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Overtime Authorization Form — full view"
      >
        <OtPreview form={form} entries={entries} />
      </PreviewLightbox>
    </main>
  );
}
