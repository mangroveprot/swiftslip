import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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

import { deleteLoaForm, getLoaForm, saveLoaForm } from "@/api/loa.functions";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { EditorSkeleton } from "@/components/common/Skeletons";
import { useSession } from "@/features/auth/use-session";
import { profileQueryOptions } from "@/features/profile/queries";
import { toast } from "@/lib/toast";
import type { LoaForm } from "@/shared/types";
import { APP } from "@/config/app";
import { recomputeDerived } from "../lib/dates";
import { unmarkPendingForm } from "../lib/pending-forms";
import { isScaffoldForm } from "../lib/scaffold";
import { loaFormQueryOptions, loaFormsQueryOptions } from "../queries";
import { LoaAssistantChat } from "./LoaAssistantChat";
import { LoaAttachmentCard } from "./LoaAttachmentCard";
import { LoaFormFields } from "./LoaFormFields";
import { LOA_SHEET_WIDTH, LoaPreview } from "./LoaPreview";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Write a save into the query cache WITHOUT dropping the `attachment` sibling.
 *  A bare `form` write replaces the whole entry, so the file the card renders
 *  would vanish until the next refetch (e.g. the auto-save fired by ticking
 *  "Approved" made the attachment look deleted). */
function writeFormCache(qc: QueryClient, id: string, next: { form: LoaForm & { id: string } }) {
  qc.setQueryData(loaFormQueryOptions(id).queryKey, (prev) => (prev ? { ...prev, ...next } : next));
}

export function LoaEditor({ id }: { id: string }) {
  const session = useSession();
  const canEdit = Boolean(session);
  const qc = useQueryClient();

  const { data } = useQuery(loaFormQueryOptions(id));
  const profileQuery = useQuery(profileQueryOptions());
  // Identity fields are auto-filled from the profile when a form is created, so
  // the profile is the reference for telling that auto-fill apart from content the
  // user actually typed.
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  const [form, setForm] = useState<LoaForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Serialized snapshot of what's already persisted, so we only save real changes.
  const savedSnapshotRef = useRef<string>("");
  // Frozen snapshot of the form as it was loaded — used on leave to detect that
  // the user left without any net change.
  const initialSnapshotRef = useRef<string>("");
  const hydratedRef = useRef(false);
  // Whether the form loaded as an untouched auto-fill scaffold — only those can be
  // discarded when left without any net change.
  const wasScaffoldOnLoadRef = useRef(false);
  const keptRef = useRef(false);
  // Latest state, read by the unmount handler without re-subscribing it.
  const latestRef = useRef({ form, canEdit, profile });
  latestRef.current = { form, canEdit, profile };

  // Discarding is only allowed on a genuine exit. The router remounts this editor
  // while navigating away (that instance mounts after the location has already
  // changed) and StrictMode simulates an unmount right after mounting — neither
  // is an exit, and letting them decide would delete forms the user kept.
  const mountPathRef = useRef(useRouterState({ select: (s) => s.location.pathname }));
  const mountedAtRef = useRef(Date.now());

  // Load the saved form into local edit state. Waits for the profile so the
  // scaffold decision compares against the same auto-fill the form was created with.
  useEffect(() => {
    if (!data || !profileReady) return;
    const f = data.form;
    const localSig =
      typeof window !== "undefined" ? (localStorage.getItem(`loa-sig:${id}`) ?? "") : "";
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
    const incoming = JSON.stringify({ form: nextForm });

    if (hydratedRef.current) {
      const current = JSON.stringify({ form });
      // Unsaved local edits always win — a save's cache write or a background
      // refetch must never clobber what the user is currently typing.
      if (current !== savedSnapshotRef.current) return;
      // Already in sync — reapplying identical values would just loop.
      if (current === incoming) return;
    }

    setForm(nextForm);
    savedSnapshotRef.current = incoming;
    initialSnapshotRef.current = incoming;
    // An attachment counts as real content: the file itself lives in storage, so
    // `data.attachment` is what tells the scaffold check it exists.
    wasScaffoldOnLoadRef.current = isScaffoldForm(nextForm, profile, Boolean(data.attachment));
    // A form that already holds real content is one the user meant to keep — lock
    // that in now so clearing a field later can never trigger the scaffold delete.
    // It also stops being a "pending" form the list is hiding.
    if (!wasScaffoldOnLoadRef.current) {
      keptRef.current = true;
      unmarkPendingForm(id);
    }
    hydratedRef.current = true;
  }, [data, id, profile, profileReady, form]);

  // Keep a local backup of the signature so it survives a failed save. Derived
  // values only (not the form object), so the effect re-runs when the signature
  // changes — and skips the pre-hydration render where form is still null.
  const sig = form?.employee_signature;
  const formLoaded = form !== null;
  useEffect(() => {
    if (!formLoaded || typeof window === "undefined") return;
    if (sig) localStorage.setItem(`loa-sig:${id}`, sig);
    else localStorage.removeItem(`loa-sig:${id}`);
  }, [formLoaded, sig, id]);

  // Auto-save: after edits settle, persist quietly in the background.
  useEffect(() => {
    if (!hydratedRef.current || !form || !canEdit) return;
    const snapshot = JSON.stringify({ form });
    if (snapshot === savedSnapshotRef.current) return;
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      saveLoaForm({ data: { id, form } })
        .then(() => {
          savedSnapshotRef.current = snapshot;
          // Keep the query cache truthful: the router can remount this editor
          // during navigation, and that instance hydrates from the cache — it
          // must never mistake saved content for an untouched scaffold.
          writeFormCache(qc, id, { form: { ...form, id } });
          // Auto-save also fires for hydration-driven diffs, so only a save that
          // carries real content counts as a deliberate edit. Saving the bare
          // auto-fill keeps the form discardable instead of locking it in — and
          // still hidden from the list.
          if (!isScaffoldForm(form, latestRef.current.profile)) {
            keptRef.current = true;
            unmarkPendingForm(id);
          }
          // The list shows this form's name and "Updated" time — mark it stale so
          // the next visit picks up what was just written.
          qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey, refetchType: "none" });
          setSaveStatus("saved");
        })
        .catch(() => setSaveStatus("error"));
    }, 1200);
    return () => clearTimeout(timer);
  }, [form, canEdit, id, qc]);

  // Let the "Saved" confirmation linger briefly, then return the button to idle.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // On leaving: discard a form that is still just the untouched auto-fill
  // scaffold (no committed content, no net change this session), or flush any
  // unsaved changes. Anything the user actually edited is always kept.
  useEffect(() => {
    // Captured here (at mount) — both refs are frozen after the first render.
    const mountPath = mountPathRef.current;
    const mountedAt = mountedAtRef.current;
    return () => {
      const { form: f, canEdit: editable, profile: prof } = latestRef.current;
      if (!editable || !f) return;
      const snapshot = JSON.stringify({ form: f });
      if (
        wasScaffoldOnLoadRef.current &&
        !keptRef.current &&
        snapshot === initialSnapshotRef.current
      ) {
        const genuineExit = mountPath.endsWith(`/${id}`) && Date.now() - mountedAt > 100;
        if (genuineExit) {
          // Re-check the server before discarding: this instance may have a stale
          // view (another tab's edit, a flush still in flight). Only a form that
          // is STILL an untouched scaffold gets deleted.
          void getLoaForm({ data: { id } })
            .then(({ form: freshForm, attachment }) => {
              if (!isScaffoldForm(freshForm, prof, Boolean(attachment))) {
                writeFormCache(qc, id, { form: { ...freshForm, id } });
                return;
              }
              return deleteLoaForm({ data: { id, quiet: true } });
            })
            .then(() => {
              // Resolved either way — it gained content and is kept, or it is gone.
              unmarkPendingForm(id);
              return qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey });
            })
            .catch(() => qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey }));
        }
        return;
      }
      if (snapshot !== savedSnapshotRef.current) {
        // Write the cache synchronously, before the network call: the remounted
        // instance hydrates within milliseconds and has to see these changes.
        writeFormCache(qc, id, { form: { ...f, id } });
        // Leaving with content is a decision to keep it, whatever it contains.
        unmarkPendingForm(id);
        void saveLoaForm({ data: { id, form: f } })
          .then(() => qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey }))
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!form) return <EditorSkeleton />;

  async function persist(f: LoaForm) {
    await saveLoaForm({ data: { id, form: f } });
    savedSnapshotRef.current = JSON.stringify({ form: f });
    // Keep the query cache truthful — a remounted editor hydrates from it and
    // must see what was just saved, or it would treat real content as a scaffold.
    writeFormCache(qc, id, { form: { ...f, id } });
    // Saving real content marks the form kept so it's never auto-discarded later —
    // even if the user then clears it back — and the list can stop hiding it.
    // Saving the untouched auto-fill does neither: it stays hidden and is still
    // discarded when left, exactly like a form nobody opened.
    if (!isScaffoldForm(f, profile)) {
      keptRef.current = true;
      unmarkPendingForm(id);
    }
    qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey, refetchType: "none" });
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

  // A stored attachment is content: keep this form out of the scaffold discard
  // and off the hidden-pending list the moment the file lands.
  function handleAttachmentUploaded() {
    keptRef.current = true;
    unmarkPendingForm(id);
  }

  async function onSave() {
    if (!form) return;
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

  // Always at the top of the preview column — the upload prompt and an already
  // attached certificate both belong where you look first. Print order is handled
  // by `print:order` on the wrapper below, so the file still follows the form.
  const attachmentCard = (
    <LoaAttachmentCard
      id={id}
      form={form}
      setForm={setForm}
      canEdit={canEdit}
      attachment={data?.attachment ?? null}
      onUploaded={handleAttachmentUploaded}
    />
  );

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
      <div className="grid min-h-0 flex-1 gap-4 print:block lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="no-print flex min-h-0 flex-col gap-3 lg:overflow-auto">
          <LoaFormFields form={form} setForm={setForm} canEdit={canEdit} />
        </div>

        {/* Attachment first, always — but on print it drops back below the
            sheet (`print:order`) so the certificate still follows the form on
            its own page. */}
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
          {/* The sheet is fixed at its true A4 page width (794px outer, with
              the template's own margins as padding / 738px content) so text
              wraps exactly like the Word template — the narrow column scrolls
              horizontally instead of squeezing it. */}
          <div className="min-h-0 overflow-x-auto rounded-sm lg:flex-1 lg:overflow-auto print:order-1 print:overflow-visible">
            <LoaPreview sheetId="loa-sheet" form={form} />
          </div>
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
