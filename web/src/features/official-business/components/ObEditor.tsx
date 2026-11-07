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
  Save,
  Send,
} from "lucide-react";
import { Component, useEffect, useMemo, useRef, useState } from "react";

import { createObForm, saveObForm, submitObForm } from "@/api/official-business.functions";
import { ApiError } from "@/lib/api-client";
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
import { SignatureField } from "@/features/records/components/SignaturePad";
import { profileQueryOptions } from "@/features/profile/queries";
import {
  createAutoSave,
  flushOnPageHide,
  type SaveStatus as AutoSaveStatus,
} from "@/lib/auto-save";
import { isDraftId, promoteDraft, readDraft, writeDraft } from "@/lib/draft";
import { localToday } from "@/lib/form-draft";
import { printSheet } from "@/lib/print";
import { pdfFileName, savePdfFrom } from "@/lib/save-pdf";
import { usePdfAttachment } from "@/lib/pdf-attachments";
import { deleteSignatureBackup, readSignatureBackup, saveSignatureBackup } from "@/lib/signature";
import { friendlyError, toast } from "@/lib/toast";
import {
  EMPTY_OB_HR_FIELDS,
  isObLocked,
  OB_HR_STATUS_LABELS,
  obSupervisorDone,
  needsReapprovalAfterSave,
  type ObHrFields,
  type ObHrStatus,
} from "@swiftslip/shared/hr";
import type { ObSigners } from "@swiftslip/shared/api-types";
import {
  obMissingRequiredFields,
  obRequiredHints,
  obRequiredToast,
  obRequiredToastFromLabels,
} from "@swiftslip/shared/ob-required";
import type { ObEntry, ObForm } from "@swiftslip/shared/types";
import { APP } from "@/config/app";
import { buildDraftObForm } from "../lib/draft-form";
import { splitDestinations } from "../lib/places";
import { hasStatusCard } from "../lib/status-card";
import { obFormQueryOptions, obFormsQueryOptions } from "../queries";
import { ObAssistantChat } from "./ObAssistantChat";
import { ObAttachmentCard } from "./ObAttachmentCard";
import { ObEditorSkeleton } from "./ObEditorSkeleton";
import { ObFormFields } from "./ObFormFields";
import { ObItineraryTable } from "./ObItineraryTable";
import { ObPreview } from "./ObPreview";
import { ObStatusCard, ObStatusLine } from "./ObStatusCard";

type SaveStatus = "idle" | AutoSaveStatus;
type PendingAction = "save" | "submit" | "download";

/** The rows that will actually be saved — blank rows never reach the database. */
function hasAnyValue(row: ObEntry): boolean {
  return Boolean(
    row.from_place || row.to_place || row.purpose || row.time_departure || row.time_return,
  );
}

/** Missing keys are a set so each field/stop can ask "am I invalid?" in O(1). */
const NO_INVALID: ReadonlySet<string> = new Set();
/** The same gate with no missing cells: no red mark and no instruction line. */
const NO_HINTS: Readonly<Record<string, string>> = {};

const DRAFT_FEATURE = "ob";

/** Itinerary rows worth persisting — a row counts only if it has any value. */
function buildRows(rows: ObEntry[]): ObEntry[] {
  return rows
    .filter((r) => r.from_place || r.to_place || r.purpose || r.time_departure || r.time_return)
    .map((r, idx) => ({ ...r, idx }));
}

/** Write a save into the query cache WITHOUT dropping the `attachment` sibling
 *  or the HR columns (`hr_status`, reject reason, sign-off fields). A bare
 *  `{ form, entries }` write replaces the whole entry, so the file the card
 *  renders would vanish until the next refetch — and the employee's editor
 *  would briefly look editable again because the HR state was gone. */
function writeFormCache(
  qc: QueryClient,
  id: string,
  next: {
    form: ObForm & { id: string; hr_status?: ObHrStatus } & Partial<ObHrFields>;
    entries: ObEntry[];
    signers?: ObSigners;
  },
) {
  qc.setQueryData(obFormQueryOptions(id).queryKey, (prev) =>
    prev
      ? { ...prev, ...next, form: { ...prev.form, ...next.form } }
      : { ...next, form: { ...EMPTY_OB_HR_FIELDS, ...next.form } },
  );
}

/**
 * The HR-owned columns a save voids when it sends the form back for
 * re-approval. The API clears them; the cache must too, or the preview would
 * keep printing an exit clearance that is no longer signed.
 */
const CLEARED_SIGNOFFS = {
  hr_approved_by: null,
  hr_approved_at: null,
  departure_signed_by: null,
  departure_signed_at: null,
  arrival_date: "",
  arrival_time: "",
  arrival_signed_by: null,
  arrival_signed_at: null,
} satisfies Partial<ObHrFields>;

/**
 * One editor per record — including across that record's own save. Saving a
 * draft swaps `$id` from `draft_…` to the row `insertDraft` just created: the
 * SAME record, so the body keeps its mount (a remount would flash the
 * skeleton over content that never changed). Any other id is a different
 * record and gets the fresh instance the body's mount-time `rowId` assumes.
 */
export function ObEditor({ id }: { id: string }) {
  const [promotion, setPromotion] = useState<{ draft: string; real: string } | null>(null);
  const key = promotion && promotion.real === id ? promotion.draft : id;
  return (
    <ObEditorErrorBoundary id={id}>
      <ObEditorBody key={key} id={id} onPromoted={(draft, real) => setPromotion({ draft, real })} />
    </ObEditorErrorBoundary>
  );
}

function ObEditorBody({
  id,
  onPromoted,
}: {
  id: string;
  onPromoted: (draft: string, real: string) => void;
}) {
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // A draft id means this form does not exist in the database yet — nothing was
  // written when the user pressed "New form", and nothing will be until they enter
  // something of their own.
  const isDraft = isDraftId(id);
  const [rowId, setRowId] = useState<string | null>(isDraft ? null : id);
  const rowIdRef = useRef<string | null>(isDraft ? null : id);

  const { data, error, isError } = useQuery({
    ...obFormQueryOptions(rowId ?? ""),
    enabled: rowId !== null,
  });

  // HR owns the lock (D6): only the state sitting in HR's queue is read-only.
  // A draft / rejected / approved / departed / completed form is editable; a
  // save on an already-approved form sends it back to HR for re-approval.
  const hrStatus = data?.form.hr_status ?? "draft";
  const supervisorApproved = data ? obSupervisorDone(data.form) : false;
  const canEdit = Boolean(session) && !isObLocked(hrStatus);
  // The status card's own note: when a save would send the form back to HR.
  const reapprovalHint =
    needsReapprovalAfterSave(hrStatus) || hrStatus === "waiting_supervisor"
      ? hrStatus === "departed"
        ? supervisorApproved
          ? "This form can still be edited, but saving a content change sends it back to HR for re-approval."
          : "Adding only the supervisor approval keeps your departure. Editing any other detail sends the form back to HR for re-approval."
        : hrStatus === "waiting_supervisor"
          ? "Adding only the supervisor approval keeps this form with HR's approval. Editing any other detail sends it back for re-approval."
          : "This form can still be edited, but saving a change sends it back to HR for re-approval."
      : null;
  // The attached slip travels with the exported PDF, on its own page after the
  // form. Joins the card's own query, so this costs no extra request.
  const pdfAttachments = usePdfAttachment("ob", rowId ?? id, data?.attachment);
  const profileQuery = useQuery(profileQueryOptions());
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  // The form's place pickers offer destinations already used on other OB forms.
  // The list is usually warm from the previous screen; on a direct load it is
  // one cached request that the itinerary shares.
  const formsQuery = useQuery(obFormsQueryOptions());
  const placeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    // The employee's own office/branch is the most likely starting point, so it
    // is always offered even when no previous OB form has used it yet.
    if (profile?.area) seen.set(profile.area.toLowerCase(), profile.area);
    for (const item of formsQuery.data ?? []) {
      for (const destination of item.destinations) {
        for (const part of splitDestinations(destination)) {
          const key = part.toLowerCase();
          if (!seen.has(key)) seen.set(key, part);
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [formsQuery.data, profile?.area]);

  const [form, setForm] = useState<ObForm | null>(null);
  const [rows, setRows] = useState<ObEntry[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const busy = pending !== null;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  // The red marks appear only after the first Submit/Resubmit attempt, then
  // disappear as the employee fills each cell — never on a quiet draft.
  const [showRequired, setShowRequired] = useState(false);
  const missingRequired = useMemo(
    () => (form ? obMissingRequiredFields(form, rows.filter(hasAnyValue)) : []),
    [form, rows],
  );
  const invalidKeys = showRequired
    ? new Set(missingRequired.map((field) => field.key))
    : NO_INVALID;
  // Every red cell also gets one plain-English line ("Select the date of the
  // OB."), so the toast's "they are marked in the form" is literally true.
  const invalidHints = showRequired ? obRequiredHints(missingRequired) : NO_HINTS;
  const formCardRef = useRef<HTMLDivElement>(null);

  const latestRef = useRef({ form, rows, canEdit, hrStatus });
  latestRef.current = { form, rows, canEdit, hrStatus };

  const snapshotOf = (f: ObForm, r: ObEntry[]) =>
    JSON.stringify({ form: f, entries: buildRows(r) });

  const localRef = useRef<string | null>(null);
  localRef.current = form ? snapshotOf(form, rows) : null;

  const insertingRef = useRef<Promise<string> | null>(null);

  // The signature value that is already safe (loaded from the server or written
  // by a successful save). The backup effect skips it, so an unchanged signature
  // never recreates a backup right after we deleted one.
  const savedSigRef = useRef<string | undefined>(undefined);

  const autoSave = useRef<ReturnType<typeof createAutoSave> | null>(null);
  if (autoSave.current === null) {
    autoSave.current = createAutoSave({
      initial: "",
      save: writeSnapshot,
      stageLocal: () => {
        const { form: f, rows: r } = latestRef.current;
        if (f) writeDraft(DRAFT_FEATURE, rowIdRef.current ?? id, { form: f, entries: r });
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
      const { id: created } = await createObForm({
        data: { date_filed: f.date_filed || localToday() },
      });
      const entries = buildRows(r);
      // Save the content that triggered the insert in the same breath, so the form
      // never exists holding only the auto-fill.
      await saveObForm({ data: { id: created, form: f, entries } });
      // The signature reached the server, so neither key is needed any more.
      deleteSignatureBackup("ob", created);
      deleteSignatureBackup("ob", id);
      savedSigRef.current = f.employee_signature;
      rowIdRef.current = created;
      // Write cache BEFORE setRowId triggers a re-render that starts the query.
      writeFormCache(qc, created, { form: { ...f, id: created }, entries });
      setRowId(created);
      promoteDraft(DRAFT_FEATURE, id, created, { form: f, entries: r });
      // Mark persisted BEFORE navigate: an unmount flush must not see the draft
      // still pending — that would insert a second, blank row.
      auto.setPersisted(snapshotOf(f, r));
      // Keep this same editor mounted through the swap: the wrapper's key
      // follows this pair instead of remounting over unchanged content.
      onPromoted(id, created);
      navigate({ to: "/official-business/$id", params: { id: created }, replace: true });
      qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey, refetchType: "none" });
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
    const entries = buildRows(r);
    const target = rowIdRef.current;
    const saved = await saveObForm({ data: { id: target, form: f, entries } });
    deleteSignatureBackup("ob", target);
    savedSigRef.current = f.employee_signature;
    const wentBack = saved.hr_status === "submitted" && latestRef.current.hrStatus !== "submitted";
    writeFormCache(qc, target, {
      form: {
        ...f,
        id: target,
        hr_status: saved.hr_status,
        ...(wentBack ? CLEARED_SIGNOFFS : {}),
      },
      entries,
      ...(wentBack ? { signers: {} } : {}),
    });
    qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey, refetchType: "none" });
  }

  // Load a real form into local edit state. Nothing here needs the profile: the
  // auto-fill comparison only applies to drafts.
  useEffect(() => {
    if (!data) return;
    const f = data.form;
    const localSig = readSignatureBackup("ob", rowId ?? id);
    const nextForm: ObForm = {
      id_number: f.id_number,
      employee_name: f.employee_name,
      department: f.department,
      position: f.position,
      date_filed: f.date_filed,
      date_of_ob: f.date_of_ob,
      approved_by: f.approved_by,
      approved_via_viber: f.approved_via_viber ?? false,
      employee_signature: f.employee_signature || localSig || "",
      attachment_approved: f.attachment_approved ?? false,
    };
    const nextRows = buildRows(data.entries);
    const incoming = snapshotOf(nextForm, nextRows);
    // Unsaved local edits always win over a save's cache write or a refetch.
    if (localRef.current !== null && localRef.current !== auto.persistedSnapshot()) return;
    if (localRef.current === incoming) return;
    setForm(nextForm);
    setRows(nextRows);
    savedSigRef.current = nextForm.employee_signature;
    auto.setPersisted(incoming);
  }, [data, profileReady, rowId, id, auto]);

  // Build a draft from the profile — in the browser, with no request. The starting
  // point becomes the baseline: whatever differs from it is something the user
  // actually entered, and that is what creates the form.
  useEffect(() => {
    if (!isDraft || !profileReady || form) return;
    const fresh = buildDraftObForm(profile ?? undefined);
    // A refresh mid-draft brings the locally backed-up edits back.
    const stored = readDraft<{ form: ObForm; entries: ObEntry[] }>(DRAFT_FEATURE, id);
    setForm(stored?.form ?? fresh);
    setRows(stored?.entries ?? []);
    auto.setBaseline(snapshotOf(fresh, []));
  }, [isDraft, profileReady, profile, form, id, auto]);

  // Keep a local backup of the signature so it survives a failed save. Derived
  // values only (not the form object), so the effect re-runs when the signature
  // changes — and skips the pre-hydration render where form is still null.
  const sig = form?.employee_signature;
  const formLoaded = form !== null;
  const sigBackupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!formLoaded) return;
    if (sigBackupTimeoutRef.current) clearTimeout(sigBackupTimeoutRef.current);
    sigBackupTimeoutRef.current = setTimeout(() => {
      // A save may have landed during the debounce window — nothing to back up.
      if (sig === savedSigRef.current) return;
      void saveSignatureBackup("ob", rowId ?? id, sig);
    }, 500);
    return () => {
      if (sigBackupTimeoutRef.current) clearTimeout(sigBackupTimeoutRef.current);
    };
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing the tab skips the unmount above, so persist on the way out too.
  useEffect(() => flushOnPageHide(auto), [auto]);

  if (isError && isMissingRow(error))
    return <FormUnavailable backTo="/official-business" label="Official Business forms" />;
  if (!form) return <ObEditorSkeleton />;

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

  async function persist(f: ObForm, entries: ObEntry[]): Promise<ObHrStatus | undefined> {
    // insertDraft already writes content — don't save again on first create.
    if (!rowIdRef.current) {
      await insertDraft();
      return undefined;
    }
    const target = rowIdRef.current;
    const saved = await saveObForm({ data: { id: target, form: f, entries } });
    deleteSignatureBackup("ob", target);
    const wentBack = saved.hr_status === "submitted" && latestRef.current.hrStatus !== "submitted";
    writeFormCache(qc, target, {
      form: {
        ...f,
        id: target,
        hr_status: saved.hr_status,
        ...(wentBack ? CLEARED_SIGNOFFS : {}),
      },
      entries,
      ...(wentBack ? { signers: {} } : {}),
    });
    auto.setPersisted(JSON.stringify({ form: f, entries }));
    qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey, refetchType: "none" });
    return saved.hr_status;
  }

  /** Resolve a real row id, creating the draft's row on the spot. */
  async function ensureRow(): Promise<string> {
    return insertDraft();
  }

  // The assistant replies with a partial patch; merge it into whatever is on
  // screen so it never clobbers something typed a moment ago. From here it flows
  // through the ordinary auto-save path like any other edit.
  function applyAssistantPatch(patch: Partial<ObForm>, entries?: ObEntry[]) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    if (entries) setRows(entries);
  }

  async function onSave() {
    if (!form) return;
    const entries = buildRows(rows);
    // Cancel any armed auto-save so it cannot insert/save in parallel with us.
    auto.setPersisted(snapshotOf(form, rows));
    setPending("save");
    setSaveStatus("saving");
    try {
      const nextStatus = await persist(form, entries);
      setSaveStatus("saved");
      const wentBack = nextStatus === "submitted" && hrStatus !== "submitted";
      toast.success(wentBack ? "Saved. The form is back with HR for re-approval." : "Saved");
    } catch (e) {
      setSaveStatus("error");
      toast.error(friendlyError(e, "Could not save this form. Please try again."));
    } finally {
      setPending(null);
    }
  }

  /**
   * Bring the first empty cell into view. The toast says "they are marked in
   * the form" — on a long sheet that is only useful if the page actually shows
   * one of those marks. The rAF waits for the red marks to paint.
   */
  function revealFirstMissing() {
    requestAnimationFrame(() => {
      formCardRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  /**
   * Save, then hand the form to HR. The save must land before the submit: HR
   * reviews what is in the database, not what is on this screen.
   */
  async function onSubmitForHr() {
    if (!form) return;
    // The sheet's asterisks are a hard gate on submission / resubmission: a
    // half-filled form never reaches HR. The same check runs again in the API
    // (shared `ob-required`) so a stale tab cannot slip past this one.
    const missing = obMissingRequiredFields(form, rows.filter(hasAnyValue));
    if (missing.length) {
      setShowRequired(true);
      const notice = obRequiredToast(missing);
      // The app's own toast — sonner's built-in title + description, no custom
      // notification component, no raw validation copy.
      toast.error(notice.title, { description: notice.description });
      revealFirstMissing();
      return;
    }
    setShowRequired(false);
    // Cancel any armed auto-save so it cannot insert/save in parallel with us.
    auto.setPersisted(snapshotOf(form, rows));
    setPending("submit");
    setSaveStatus("saving");
    try {
      await persist(form, buildRows(rows));
      const target = rowIdRef.current;
      if (!target) throw new Error("This form is not ready yet.");
      await submitObForm({ data: { id: target } });
      qc.setQueryData(obFormQueryOptions(target).queryKey, (prev) =>
        prev
          ? {
              ...prev,
              form: { ...prev.form, hr_status: "submitted" as const, hr_reject_reason: "" },
            }
          : prev,
      );
      qc.invalidateQueries({
        queryKey: obFormsQueryOptions().queryKey,
        refetchType: "none",
      });
      setSaveStatus("saved");
      toast.success(
        hrStatus === "rejected"
          ? "Resubmitted to HR for approval."
          : "Submitted to HR for approval.",
      );
    } catch (e) {
      setSaveStatus("error");
      // The API repeats the required-field check for stale tabs / direct POSTs.
      // Its answer is the same friendly toast, not a raw validation error.
      if (e instanceof ApiError && e.code === "REQUIRED_FIELD_MISSING") {
        setShowRequired(true);
        const notice = obRequiredToastFromLabels(e.suggestions);
        toast.error(notice.title, { description: notice.description });
        revealFirstMissing();
      } else {
        toast.error(friendlyError(e, "Could not send this form to HR. Please try again."));
      }
    } finally {
      setPending(null);
    }
  }

  async function download() {
    if (!form) return;
    setPending("download");
    const toastId = toast.loading("Preparing Word file…");
    try {
      // docxtemplater + pizzip are only needed when exporting (~330 kB) — keeping
      // them out of the route chunk makes opening this form much faster.
      const { downloadObWord } = await import("../lib/word-export");
      await downloadObWord({
        form,
        rows: buildRows(rows),
        // Same HR columns + signers the preview beside this button renders, so
        // the Word file and the sheet can never disagree about a signed box.
        hr: data?.form,
        signers: data?.signers,
        fileName: `${APP.name}_OB_${form.employee_name || "form"}.docx`,
      });
      toast.success("Word file downloaded", { id: toastId });
    } catch (e) {
      toast.error(friendlyError(e, "Could not download the Word file. Please try again."), {
        id: toastId,
      });
    } finally {
      setPending(null);
    }
  }

  // Always at the top of the preview column — the upload prompt and an already
  // attached slip both belong where you look first. Print order is handled by
  // `print:order` on the wrapper below, so the slip still follows the form.
  const attachmentCard = (
    <ObAttachmentCard
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
    <main className="flex min-h-full w-full flex-col px-4 py-3 md:px-6 md:py-5 print:block print:h-auto print:overflow-visible print:p-0">
      <header className="no-print mb-5 flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/official-business"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Official Business
          </Link>
          <PageTitle className="mt-2">Official Business Form</PageTitle>
          {data && hasStatusCard(data.form) ? (
            <ObStatusLine
              audience="employee"
              doc={{ ...data.form, employee_photo: profile?.photo ?? null }}
              signers={data.signers}
            />
          ) : null}
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
                    "ob-sheet",
                    pdfFileName(APP.name, "OB", form.employee_name || "form"),
                    pdfAttachments,
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
              <DropdownMenuItem
                className="focus:bg-muted focus:text-foreground"
                disabled={busy}
                onSelect={() => void download()}
              >
                <FileDown className="size-4" aria-hidden="true" />
                Download Word
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canEdit ? (
            <button
              type="button"
              className="btn bg-success text-success-foreground hover:bg-success-hover disabled:opacity-60"
              disabled={busy}
              aria-label={
                pending === "save" || (pending === null && saveStatus === "saving")
                  ? "Saving"
                  : pending === null && saveStatus === "saved"
                    ? "Saved"
                    : "Save"
              }
              title="Save your changes to this form"
              onClick={() => onSave()}
            >
              {pending === "save" || (pending === null && saveStatus === "saving") ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : pending === null && saveStatus === "saved" ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              <span>Save</span>
            </button>
          ) : null}
          {canEdit && form && (hrStatus === "draft" || hrStatus === "rejected") ? (
            <button
              type="button"
              className="btn btn-primary disabled:opacity-60"
              disabled={busy}
              title="Send this form to HR for approval"
              onClick={() => void onSubmitForHr()}
            >
              {pending === "submit" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              <span>{hrStatus === "rejected" ? "Resubmit to HR" : "Submit to HR"}</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 print:block lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* The form column. The status card is its own card sitting ABOVE the
            form — never inside the form card. The whole page scrolls (like the
            HR form detail), so neither this column nor the form card clips its
            content. It reads the same data as the header line, so the two can
            never disagree. */}
        <div className="no-print flex flex-col gap-5">
          {data && hasStatusCard(data.form) ? (
            <div className="shrink-0">
              <ObStatusCard
                audience="employee"
                doc={{ ...data.form, employee_photo: profile?.photo ?? null }}
                signers={data.signers}
                hint={reapprovalHint}
              />
            </div>
          ) : null}

          <div ref={formCardRef} className="@container rounded-xl bg-card p-5 sm:p-6 lg:p-8">
            <ObFormFields
              form={form}
              setForm={setForm}
              canEdit={canEdit}
              invalid={invalidKeys}
              hints={invalidHints}
            />

            <div className="mt-6 border-t pt-5">
              <ObItineraryTable
                rows={rows}
                setRows={setRows}
                canEdit={canEdit}
                busy={busy}
                placeOptions={placeOptions}
                invalid={invalidKeys}
                hints={invalidHints}
              />
            </div>

            <div className="mt-6 border-t pt-5">
              <SignatureField
                variant="ob"
                value={form.employee_signature}
                disabled={!canEdit}
                invalid={invalidKeys.has("employee_signature")}
                hint={invalidHints["employee_signature"]}
                savedSignature={profile?.signature}
                onChange={(v) => setForm({ ...form, employee_signature: v })}
              />
            </div>
          </div>
        </div>

        {/* The attachment stays first in the preview column, and on paper it
            drops below the sheet (`print:order`) so a slip still follows the
            form on its own page. */}
        <div className="flex flex-col gap-3 print:gap-0 print:overflow-visible">
          <div className="print:order-2">{attachmentCard}</div>
          <div className="no-print flex shrink-0 items-center justify-between gap-2">
            <p className="text-sm font-semibold">Preview</p>
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
          <div className="rounded-sm print:order-1 print:overflow-visible">
            {/* Clicking the sheet itself opens the full view — the same action
                as the small icon above, without hunting for it. Same wrapper
                the HR detail page already uses; it prints as-is (no ring, no
                cursor) so the paper output is unchanged. */}
            <button
              type="button"
              className="block w-full cursor-pointer overflow-hidden rounded-sm bg-paper text-left ring-offset-background transition-shadow hover:ring-2 hover:ring-dashboard-rule/30 print:cursor-auto print:ring-0 print:hover:ring-0"
              aria-label="Open the full view"
              title="Full view: zoom in/out and drag the form around"
              onClick={() => setPreviewOpen(true)}
            >
              <ObPreview
                sheetId="ob-sheet"
                form={form}
                rows={rows}
                hr={data?.form}
                signers={data?.signers}
              />
            </button>
          </div>
        </div>
      </div>

      {/* The assistant floats above the page (bottom-right bubble) so the
          preview column keeps its full height. */}
      {canEdit ? (
        <ObAssistantChat key={id} form={form} rows={rows} onApply={applyAssistantPatch} />
      ) : null}
      <PreviewLightbox
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Official Business Form (full view)"
      >
        <ObPreview form={form} rows={rows} hr={data?.form} signers={data?.signers} />
      </PreviewLightbox>
    </main>
  );
}

/**
 * Local error boundary so a storage or rendering problem inside the OB editor
 * does not replace the whole page with the root route error fallback.
 */
class ObEditorErrorBoundary extends Component<
  { id: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { id: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ObEditor error boundary caught an error:", error, info);
  }

  override render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-medium text-destructive">The editor could not load.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try refreshing the page. Your work is backed up locally.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-4"
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </div>
    );
  }
}
