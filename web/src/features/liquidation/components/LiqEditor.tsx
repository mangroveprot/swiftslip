import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileDown,
  Loader2,
  Maximize2,
  Printer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createLiqForm, saveLiqForm } from "@/api/liquidation.functions";
import { PageTitle } from "@/components/common/PageTitle";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { FormUnavailable } from "@/components/common/FormUnavailable";
import { isMissingRow } from "@/lib/missing-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/features/auth/use-session";
import { buildPlaceOptions } from "@/features/official-business/lib/places";
import { obFormsQueryOptions } from "@/features/official-business/queries";
import { profileQueryOptions } from "@/features/profile/queries";
import {
  createAutoSave,
  flushOnPageHide,
  type SaveStatus as AutoSaveStatus,
} from "@/lib/auto-save";
import { isDraftId, promoteDraft, readDraft, writeDraft } from "@/lib/draft";
import { liqToday } from "@swiftslip/shared/liq";
import { printSheet } from "@/lib/print";
import { pdfFileName, savePdfFrom } from "@/lib/save-pdf";
import { toast } from "@/lib/toast";
import type { LiqExpense, LiqForm } from "@swiftslip/shared/types";
import { APP } from "@/config/app";
import {
  buildDraftLiqEntries,
  buildDraftLiqForm,
  emptyLiqEntry,
  LIQ_LINES,
  normalizeLiqEntries,
} from "../lib/draft-form";
import { liqFormQueryOptions, liqFormsQueryOptions } from "../queries";
import { LiqAssistantChat } from "./LiqAssistantChat";
import { LiqAttachmentCard } from "./LiqAttachmentCard";
import { LiqEditorSkeleton } from "./LiqEditorSkeleton";
import { LiqFormFields } from "./LiqFormFields";
import { LIQ_SHEET_GUTTER, LIQ_SHEET_WIDTH, LiqSheet } from "./LiqSheet";

type SaveStatus = "idle" | AutoSaveStatus;

const DRAFT_FEATURE = "liq";

type LiqDraft = { form: LiqForm; entries: LiqExpense[] };

function writeFormCache(
  qc: QueryClient,
  id: string,
  next: { form: LiqForm & { id: string }; entries: LiqExpense[] },
) {
  qc.setQueryData(liqFormQueryOptions(id).queryKey, (prev) => (prev ? { ...prev, ...next } : next));
}

/** One editor per record, including across that record's own draft→row save. */
export function LiqEditor({ id }: { id: string }) {
  const [promotion, setPromotion] = useState<{ draft: string; real: string } | null>(null);
  const key = promotion && promotion.real === id ? promotion.draft : id;
  return (
    <LiqEditorBody key={key} id={id} onPromoted={(draft, real) => setPromotion({ draft, real })} />
  );
}

function LiqEditorBody({
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

  const isDraft = isDraftId(id);
  const [rowId, setRowId] = useState<string | null>(isDraft ? null : id);
  const rowIdRef = useRef<string | null>(isDraft ? null : id);

  const { data, error, isError } = useQuery({
    ...liqFormQueryOptions(rowId ?? ""),
    enabled: rowId !== null,
  });
  const profileQuery = useQuery(profileQueryOptions());
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  // The trip on a liquidation is the trip an OB was filed for, so the TRIP TO
  // box offers the destinations already used there. The list is usually warm
  // from the OB screen; on a direct load it is one cached request.
  const obFormsQuery = useQuery({ ...obFormsQueryOptions(), enabled: canEdit });
  const tripOptions = useMemo(
    () => buildPlaceOptions(obFormsQuery.data ?? [], profile?.area ? [profile.area] : []),
    [obFormsQuery.data, profile?.area],
  );

  const [form, setForm] = useState<LiqForm | null>(null);
  const [entries, setEntries] = useState<LiqExpense[]>(buildDraftLiqEntries);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  const [fit, setFit] = useState({ scale: 1, height: 0 });
  const fitBoxRef = useRef<HTMLDivElement>(null);
  const sheetFitRef = useRef<HTMLDivElement>(null);

  const latestRef = useRef({ form, entries, canEdit });
  latestRef.current = { form, entries, canEdit };

  const snapshotOf = (f: LiqForm, e: LiqExpense[]) => JSON.stringify({ form: f, entries: e });
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
        if (f) writeDraft<LiqDraft>(DRAFT_FEATURE, rowIdRef.current ?? id, { form: f, entries: e });
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
      const { id: created } = await createLiqForm({
        data: { date_prepared: f.date_prepared || liqToday() },
      });
      await saveLiqForm({ data: { id: created, form: f, entries: e } });
      rowIdRef.current = created;
      writeFormCache(qc, created, { form: { ...f, id: created }, entries: e });
      setRowId(created);
      promoteDraft<LiqDraft>(DRAFT_FEATURE, id, created, { form: f, entries: e });
      auto.setPersisted(snapshotOf(f, e));
      onPromoted(id, created);
      navigate({ to: "/liquidation/$id", params: { id: created }, replace: true });
      qc.invalidateQueries({ queryKey: liqFormsQueryOptions().queryKey, refetchType: "none" });
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
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const target = rowIdRef.current;
    await saveLiqForm({ data: { id: target, form: f, entries: e } });
    writeFormCache(qc, target, { form: { ...f, id: target }, entries: e });
    qc.invalidateQueries({ queryKey: liqFormsQueryOptions().queryKey, refetchType: "none" });
  }

  // Load a real form into local edit state.
  useEffect(() => {
    if (!data) return;
    const f = data.form;
    const nextForm: LiqForm = {
      department: f.department,
      section_location: f.section_location,
      cost_center: f.cost_center,
      date_prepared: f.date_prepared,
      trip_to: f.trip_to,
      purpose: f.purpose,
      currency: f.currency || "PESOS",
      prepared_by: f.prepared_by,
      approved_by: f.approved_by,
      // Forms created before the signature column existed (or saved before the
      // profile had one) fall back to the saved signature, like a new form.
      employee_signature: f.employee_signature || profile?.signature || "",
      attachment_approved: f.attachment_approved ?? false,
      approved_via_viber: f.approved_via_viber ?? false,
    };
    const nextEntries = normalizeLiqEntries(data.entries);
    const incoming = snapshotOf(nextForm, nextEntries);
    // Unsaved local edits always win over a save's cache write or a refetch.
    if (localRef.current !== null && localRef.current !== auto.persistedSnapshot()) return;
    if (localRef.current === incoming) return;
    setForm(nextForm);
    setEntries(nextEntries);
    auto.setPersisted(incoming);
  }, [data, profileReady, profile?.signature, rowId, id, auto]);

  // Build a draft from the profile, in the browser, with no request.
  useEffect(() => {
    if (!isDraft || !profileReady || form) return;
    const freshForm = buildDraftLiqForm(profile ?? undefined);
    const freshEntries = buildDraftLiqEntries();
    const stored = readDraft<LiqDraft>(DRAFT_FEATURE, id);
    setForm(stored?.form ?? freshForm);
    setEntries(normalizeLiqEntries(stored?.entries ?? freshEntries));
    auto.setBaseline(snapshotOf(freshForm, freshEntries));
  }, [isDraft, profileReady, profile, form, id, auto]);

  // The single trigger for every change.
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

  // Fit-to-width: the sheet keeps its authored 1204px so it stays a faithful
  // replica, and this scale shrinks it to the column instead of forcing a
  // sideways scroll. The wrapper's gutter is measured too, so the white page
  // around the form never gets clipped. Print drops the scale (styles.css) and
  // centres the page.
  const formLoaded = form !== null;
  useEffect(() => {
    if (!formLoaded) return;
    const box = fitBoxRef.current;
    const sheet = sheetFitRef.current;
    if (!box || !sheet) return;
    const pageWidth = LIQ_SHEET_WIDTH + LIQ_SHEET_GUTTER * 2;
    const measure = () => {
      const scale = Math.min(1, box.clientWidth / pageWidth);
      const height = Math.round(sheet.offsetHeight * scale);
      setFit((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [formLoaded]);

  useEffect(() => {
    return () => {
      if (rowIdRef.current) auto.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => flushOnPageHide(auto), [auto]);

  if (isError && isMissingRow(error))
    return <FormUnavailable backTo="/liquidation" label="Statement of Liquidation forms" />;
  if (!form) return <LiqEditorSkeleton />;

  /** Replace one expense row (index 0..LIQ_LINES-1). */
  function setLine(index: number, next: LiqExpense) {
    setEntries((prev) => prev.map((entry, i) => (i === index ? next : entry)));
  }

  /**
   * Delete one expense line. Later lines move up to close the gap (the sheet
   * never prints a hole) and the freed last row goes back to blank, so a reload
   * restores exactly what the paper shows.
   */
  function deleteLine(index: number) {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i < index || i >= LIQ_LINES) return entry;
        const next = i < LIQ_LINES - 1 ? prev[i + 1] : undefined;
        return next ? { ...next, idx: entry.idx } : emptyLiqEntry(entry.idx);
      }),
    );
  }

  /**
   * Merge what the assistant returned into what is on screen. A row it did not
   * send keeps the text the user typed. From here the change flows through the
   * ordinary auto-save path like any other edit.
   */
  function applyAssistantPatch(patch: Partial<LiqForm>, nextEntries?: LiqExpense[]) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    if (!nextEntries?.length) return;
    const byIdx = new Map(nextEntries.map((entry) => [entry.idx, entry]));
    setEntries((prev) =>
      prev.map((row) => {
        if (row.idx > LIQ_LINES) return row;
        const incoming = byIdx.get(row.idx);
        return incoming ? { ...row, ...incoming } : row;
      }),
    );
  }

  async function persist(f: LiqForm, e: LiqExpense[]) {
    if (!rowIdRef.current) {
      await insertDraft();
      return;
    }
    const target = rowIdRef.current;
    await saveLiqForm({ data: { id: target, form: f, entries: e } });
    writeFormCache(qc, target, { form: { ...f, id: target }, entries: e });
    auto.setPersisted(snapshotOf(f, e));
    qc.invalidateQueries({ queryKey: liqFormsQueryOptions().queryKey, refetchType: "none" });
  }

  async function onSave() {
    if (!form) return;
    auto.setPersisted(snapshotOf(form, entries));
    setBusy(true);
    setSaveStatus("saving");
    try {
      await persist(form, entries);
      setSaveStatus("saved");
      toast.success("Saved");
    } catch (e) {
      setSaveStatus("error");
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  const snapshot = localRef.current ?? "";
  const dirty = rowIdRef.current
    ? snapshot !== auto.persistedSnapshot()
    : auto.belowBaseline(snapshot);
  const statusLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "error"
        ? "Save failed"
        : saveStatus === "saved"
          ? "Saved"
          : dirty
            ? "Unsaved changes"
            : "";

  const sheet = (withId: boolean) => (
    <LiqSheet sheetId={withId ? "liq-sheet" : undefined} form={form} entries={entries} />
  );

  return (
    <main className="flex flex-col px-4 py-3 md:px-6 md:py-5 print:block print:h-auto print:p-0">
      <header className="no-print mb-5 flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/liquidation"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Statement of Liquidation
          </Link>
          <PageTitle className="mt-2">Statement of Liquidation</PageTitle>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && statusLabel ? (
            <span
              className={`mr-1 text-sm ${
                saveStatus === "error" ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {statusLabel}
            </span>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="btn btn-outline" aria-label="Export this form">
                <Download className="size-4" aria-hidden="true" />
                <span>Export</span>
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card text-foreground">
              <DropdownMenuItem
                className="focus:bg-muted focus:text-foreground"
                disabled={busy}
                onSelect={() =>
                  void savePdfFrom(
                    "liq-sheet",
                    pdfFileName(APP.name, "LIQ", form.prepared_by || "form"),
                  )
                }
              >
                <FileDown className="size-4" aria-hidden="true" />
                Save as PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                className="focus:bg-muted focus:text-foreground"
                onSelect={() => printSheet()}
              >
                <Printer className="size-4" aria-hidden="true" />
                Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canEdit ? (
            <button
              type="button"
              className="btn bg-success text-success-foreground hover:bg-success-hover disabled:opacity-60"
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
              ) : null}
              <span>Save</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 print:block lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div className="no-print flex flex-col gap-6">
          <LiqFormFields
            form={form}
            setForm={setForm}
            entries={entries}
            setEntry={setLine}
            onDeleteLine={deleteLine}
            canEdit={canEdit}
            tripOptions={tripOptions}
          />
        </div>

        <div className="flex flex-col gap-3 print:static print:gap-0 print:overflow-visible lg:sticky lg:top-2 lg:self-start">
          {/* First in the preview column, exactly like OB / LOA / COS / OT: the
              upload prompt and an already attached slip belong where you look
              first. On paper it drops below the sheet (`print:order-2`), so the
              slip still follows the form on its own page. */}
          <div className="print:order-2">
            <LiqAttachmentCard
              id={rowId ?? id}
              form={form}
              setForm={setForm}
              canEdit={canEdit}
              attachment={data?.attachment ?? null}
              onEnsureRow={insertDraft}
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
              title="Full view: zoom in/out and drag the form around"
              onClick={() => setPreviewOpen(true)}
            >
              <Maximize2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <div
            ref={fitBoxRef}
            className="overflow-x-clip rounded-sm print:order-1 print:overflow-visible"
          >
            <div className="liq-fitbox" style={{ height: fit.height || undefined }}>
              <div
                ref={sheetFitRef}
                className="liq-fitsheet"
                style={{
                  width: LIQ_SHEET_WIDTH + LIQ_SHEET_GUTTER * 2,
                  transform: `scale(${fit.scale})`,
                  transformOrigin: "top left",
                }}
              >
                <div className="liq-print-wrap rounded-sm bg-white shadow-sm print:shadow-none">
                  {sheet(true)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The assistant floats above the page (bottom-right bubble) so the
          preview column keeps its full height. */}
      {canEdit ? (
        <LiqAssistantChat key={id} form={form} entries={entries} onApply={applyAssistantPatch} />
      ) : null}

      <PreviewLightbox
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Statement of Liquidation (full view)"
        sheetWidth={LIQ_SHEET_WIDTH}
      >
        {sheet(false)}
      </PreviewLightbox>
    </main>
  );
}
