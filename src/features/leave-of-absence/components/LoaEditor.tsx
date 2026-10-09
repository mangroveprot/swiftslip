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

import { createLoaForm, saveLoaForm } from "@/api/loa.functions";
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
import type { LoaForm } from "@/shared/types";
import { APP } from "@/config/app";
import { recomputeDerived } from "../lib/dates";
import { buildDraftLoaForm } from "../lib/draft-form";
import { loaFormQueryOptions, loaFormsQueryOptions, loaOtherUrlsQueryOptions } from "../queries";
import { LoaAssistantChat } from "./LoaAssistantChat";
import { LoaAttachmentCard } from "./LoaAttachmentCard";
import { LoaFormFields } from "./LoaFormFields";
import { LoaOtherAttachmentsCard } from "./LoaOtherAttachmentsCard";
import { LOA_SHEET_WIDTH, LoaPreview } from "./LoaPreview";

type SaveStatus = "idle" | AutoSaveStatus;

const DRAFT_FEATURE = "loa";

/** Write a save into the query cache WITHOUT dropping the `attachment` /
 *  `others` siblings. A bare `form` write replaces the whole entry, so the
 *  files the cards render would vanish until the next refetch (e.g. the
 *  auto-save fired by ticking "Approved" made the attachment look deleted). */
function writeFormCache(qc: QueryClient, id: string, next: { form: LoaForm & { id: string } }) {
  qc.setQueryData(loaFormQueryOptions(id).queryKey, (prev) =>
    prev ? { ...prev, ...next } : { others: [], ...next },
  );
}

/**
 * One editor per record — including across that record's own save. Saving a
 * draft swaps `$id` from `draft_…` to the row `insertDraft` just created: the
 * SAME record, so the body keeps its mount (a remount would flash the
 * skeleton over content that never changed). Any other id is a different
 * record and gets the fresh instance the body's mount-time `rowId` assumes.
 */
export function LoaEditor({ id }: { id: string }) {
  const [promotion, setPromotion] = useState<{ draft: string; real: string } | null>(null);
  const key = promotion && promotion.real === id ? promotion.draft : id;
  return (
    <LoaEditorBody key={key} id={id} onPromoted={(draft, real) => setPromotion({ draft, real })} />
  );
}

function LoaEditorBody({
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
    ...loaFormQueryOptions(rowId ?? ""),
    enabled: rowId !== null,
  });
  const profileQuery = useQuery(profileQueryOptions());
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  // The extra attachments, plus their signed links. The card in the form column
  // lists them and the print pages below render them; both read this one query.
  const others = data?.others ?? [];
  const { data: otherUrls } = useQuery({
    ...loaOtherUrlsQueryOptions(rowId ?? ""),
    enabled: rowId !== null && others.length > 0,
  });

  const [form, setForm] = useState<LoaForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  // Fit-to-width for the live preview: the sheet keeps its exact A4 width
  // (794px) so the replica stays pixel-faithful, and this scale shrinks it to the
  // column instead of forcing sideways dragging. Print drops the scale
  // again through the `.loa-fitbox` / `.loa-fitsheet` rules in styles.css.
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  const fitBoxRef = useRef<HTMLDivElement>(null);
  const sheetFitRef = useRef<HTMLDivElement>(null);

  const latestRef = useRef({ form, canEdit });
  latestRef.current = { form, canEdit };

  const snapshotOf = (f: LoaForm) => JSON.stringify({ form: f });

  const localRef = useRef<string | null>(null);
  localRef.current = form ? snapshotOf(form) : null;

  const insertingRef = useRef<Promise<string> | null>(null);

  const autoSave = useRef<ReturnType<typeof createAutoSave> | null>(null);
  if (autoSave.current === null) {
    autoSave.current = createAutoSave({
      initial: "",
      save: writeSnapshot,
      stageLocal: () => {
        const { form: f } = latestRef.current;
        if (f) writeDraft(DRAFT_FEATURE, rowIdRef.current ?? id, { form: f });
      },
      onStatus: (status) => setSaveStatus(status),
    });
  }
  const auto = autoSave.current;

  async function insertDraft(): Promise<string> {
    const existing = rowIdRef.current;
    if (existing) return existing;
    if (insertingRef.current) return insertingRef.current;
    const { form: f } = latestRef.current;
    if (!f) throw new Error("This form is not ready yet.");
    insertingRef.current = (async () => {
      const { id: created } = await createLoaForm({
        data: { date_filed: f.date_filed || localToday() },
      });
      // Save the content that triggered the insert in the same breath, so the form
      // never exists holding only the auto-fill.
      await saveLoaForm({ data: { id: created, form: f } });
      rowIdRef.current = created;
      // Write cache BEFORE setRowId triggers a re-render that starts the query.
      writeFormCache(qc, created, { form: { ...f, id: created } });
      setRowId(created);
      promoteSignatureBackup("loa", id, created);
      promoteDraft(DRAFT_FEATURE, id, created, { form: f });
      // Mark persisted BEFORE navigate: an unmount flush must not see the draft
      // still pending — that would insert a second, blank row.
      auto.setPersisted(snapshotOf(f));
      // Keep this same editor mounted through the swap: the wrapper's key
      // follows this pair instead of remounting over unchanged content.
      onPromoted(id, created);
      navigate({ to: "/leave-of-absence/$id", params: { id: created }, replace: true });
      qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey, refetchType: "none" });
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
    const { form: f } = latestRef.current;
    if (!f) return;
    // insertDraft already writes content — a second save races and errors.
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const target = rowIdRef.current;
    await saveLoaForm({ data: { id: target, form: f } });
    writeFormCache(qc, target, { form: { ...f, id: target } });
    qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey, refetchType: "none" });
  }

  // Load a real form into local edit state. Nothing here needs the profile: the
  // auto-fill comparison only applies to drafts.
  useEffect(() => {
    if (!data) return;
    const f = data.form;
    const localSig = readSignatureBackup("loa", rowId ?? id);
    const nextForm: LoaForm = {
      id_number: f.id_number,
      employee_name: f.employee_name,
      department: f.department,
      position: f.position,
      date_filed: f.date_filed,
      date_from: f.date_from,
      date_to: f.date_to,
      days_applied: f.days_applied,
      leave_type: f.leave_type,
      leave_type_other: f.leave_type_other,
      pay_status: f.pay_status,
      reasons: f.reasons,
      report_back_date: f.report_back_date,
      approved_by: f.approved_by,
      approved_via_viber: f.approved_via_viber ?? false,
      employee_signature: f.employee_signature || localSig || "",
      attachment_approved: f.attachment_approved ?? false,
    };
    const incoming = snapshotOf(nextForm);
    // Unsaved local edits always win over a save's cache write or a refetch.
    if (localRef.current !== null && localRef.current !== auto.persistedSnapshot()) return;
    if (localRef.current === incoming) return;
    setForm(nextForm);
    auto.setPersisted(incoming);
  }, [data, profileReady, rowId, id, auto]);

  // Build a draft from the profile — in the browser, with no request. The starting
  // point becomes the baseline: whatever differs from it is something the user
  // actually entered, and that is what creates the form.
  useEffect(() => {
    if (!isDraft || !profileReady || form) return;
    const fresh = buildDraftLoaForm(profile ?? undefined);
    // A refresh mid-draft brings the locally backed-up edits back.
    const stored = readDraft<{ form: LoaForm }>(DRAFT_FEATURE, id);
    setForm(stored?.form ?? fresh);
    auto.setBaseline(snapshotOf(fresh));
  }, [isDraft, profileReady, profile, form, id, auto]);

  // Keep a local backup of the signature so it survives a failed save. Derived
  // values only (not the form object), so the effect re-runs when the signature
  // changes — and skips the pre-hydration render where form is still null.
  const sig = form?.employee_signature;
  const formLoaded = form !== null;
  useEffect(() => {
    if (!formLoaded) return;
    saveSignatureBackup("loa", rowId ?? id, sig);
  }, [formLoaded, sig, rowId, id]);

  // The single trigger for every change: persist a draft that has become real
  // content, or arm the tiered save for a form that already exists.
  useEffect(() => {
    if (!form || !canEdit) return;
    const snapshot = snapshotOf(form);
    if (rowIdRef.current) auto.arm(snapshot);
    else if (auto.belowBaseline(snapshot)) auto.arm(snapshot);
  }, [form, canEdit, auto]);

  // Let the "Saved" confirmation linger briefly, then return the button to idle.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // Fit-to-width for the live preview: measure the column and the sheet, then
  // scale the sheet down (never past 100 %) so the whole page is visible with
  // no horizontal scrollbar. The ResizeObserver keeps both numbers honest as
  // the column or the sheet content changes (window resize, longer text,
  // a signature landing). Values only change when they really differ, so the
  // observation never feeds back into itself.
  useEffect(() => {
    if (!formLoaded) return;
    const box = fitBoxRef.current;
    const sheet = sheetFitRef.current;
    if (!box || !sheet) return;
    const measure = () => {
      const scale = Math.min(1, box.clientWidth / LOA_SHEET_WIDTH);
      // offsetHeight ignores the transform — the natural, unscaled height.
      const height = Math.round(sheet.offsetHeight * scale);
      setFit((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [formLoaded]);

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
  async function persist(f: LoaForm) {
    // insertDraft already writes content — don't save again on first create.
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const target = rowIdRef.current;
    await saveLoaForm({ data: { id: target, form: f } });
    writeFormCache(qc, target, { form: { ...f, id: target } });
    auto.setPersisted(JSON.stringify({ form: f }));
    qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey, refetchType: "none" });
  }

  /** Resolve a real row id, creating the draft's row on the spot. */
  async function ensureRow(): Promise<string> {
    return insertDraft();
  }

  // The assistant replies with a partial patch; merge it into whatever is on
  // screen so it never clobbers something typed a moment ago. When the patch
  // moves the inclusive dates, the derived fields (days applied, report-back
  // date) are recalculated deterministically here — the model doesn't count
  // Sundays, the app does. From here everything flows through the ordinary
  // auto-save path like any other edit.
  function applyAssistantPatch(patch: Partial<LoaForm>) {
    setForm((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...patch };
      const datesChanged = merged.date_from !== prev.date_from || merged.date_to !== prev.date_to;
      return datesChanged ? recomputeDerived(merged) : merged;
    });
  }

  async function onSave() {
    if (!form) return;
    // Cancel any armed auto-save so it cannot insert/save in parallel with us.
    auto.setPersisted(snapshotOf(form));
    setBusy(true);
    setSaveStatus("saving");
    try {
      await persist(form);
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
      const { downloadLoaWord } = await import("../lib/word-export");
      await downloadLoaWord({
        form,
        fileName: `${APP.name}_LOA_${form.employee_name || "form"}.docx`,
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
            to="/leave-of-absence"
            className="btn btn-outline mt-0.5 size-9 shrink-0 p-0"
            aria-label="Back to leave of absence forms"
            title="Back to leave of absence forms"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Leave of Absence
            </p>
            <h1 className="text-2xl font-semibold leading-tight">Leave of Absence Form</h1>
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
      {/* `minmax(0,1fr)` on the base (single) column too, not just at lg: the
          preview column holds the A4 sheet at its true 794px width, and an
          implicit `auto` track sizes to its content's minimum — the track (and
          with it the fit box) would become 794px wide on a phone, so the
          fit-to-width measure above would read 794/794, keep the scale at 1
          and clip the sheet instead of shrinking it. Declared `minmax(0,…)`
          lets the column stay at the viewport width, which is what makes the
          scale drop below 1 on small screens. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 print:block lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="no-print @container flex min-h-0 flex-col gap-3 lg:overflow-auto">
          <LoaFormFields
            form={form}
            setForm={setForm}
            canEdit={canEdit}
            savedSignature={profile?.signature}
          />
          {/* The other documents sit at the bottom of the form — the approval
              attachment keeps the top of the preview column. This card is
              screen-only; its printable copies are mounted in the preview
              column below. */}
          <LoaOtherAttachmentsCard id={rowId ?? id} canEdit={canEdit} others={others} />
        </div>

        {/* The approval attachment leads the preview column — like OB, the
            uploaded file IS the approval — but on print it drops back below
            the sheet (`print:order`) so the file still follows the form on
            its own page. */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden print:gap-0 print:overflow-visible">
          <div className="print:order-2">
            <LoaAttachmentCard
              id={rowId ?? id}
              form={form}
              setForm={setForm}
              canEdit={canEdit}
              attachment={data?.attachment ?? null}
              // A file is real content, so uploading one creates the row if the
              // form is still a draft.
              onEnsureRow={ensureRow}
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
              title="Full view — zoom in/out and drag the form around"
              onClick={() => setPreviewOpen(true)}
            >
              <Maximize2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {/* The sheet keeps its true A4 width (794px outer, the template's own
              margins as padding / 738px content) so text wraps exactly like the
              Word template — and the column scales that whole page down to fit
              instead of making you drag sideways. `.loa-fitbox` /
              `.loa-fitsheet` (styles.css) drop the scale again for print. */}
          <div
            ref={fitBoxRef}
            className="min-h-0 overflow-x-hidden rounded-sm lg:flex-1 lg:overflow-y-auto print:order-1 print:overflow-visible"
          >
            <div className="loa-fitbox" style={{ height: fit.height || undefined }}>
              <div
                ref={sheetFitRef}
                className="loa-fitsheet"
                style={{
                  width: LOA_SHEET_WIDTH,
                  transform: `scale(${fit.scale})`,
                  transformOrigin: "top left",
                }}
              >
                <LoaPreview sheetId="loa-sheet" form={form} />
              </div>
            </div>
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
      {canEdit ? <LoaAssistantChat key={id} form={form} onApply={applyAssistantPatch} /> : null}
      <PreviewLightbox
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Leave of Absence Form — full view"
        sheetWidth={LOA_SHEET_WIDTH}
      >
        <LoaPreview form={form} />
      </PreviewLightbox>
    </main>
  );
}
