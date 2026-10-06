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

import { deleteObForm, getObForm, saveObForm } from "@/api/official-business.functions";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { EditorSkeleton } from "@/components/common/Skeletons";
import { useSession } from "@/features/auth/use-session";
import { profileQueryOptions } from "@/features/profile/queries";
import { readSignatureBackup, saveSignatureBackup } from "@/lib/signature";
import { toast } from "@/lib/toast";
import type { ObEntry, ObForm } from "@/shared/types";
import { APP } from "@/config/app";
import { unmarkPendingForm } from "../lib/pending-forms";
import { isScaffoldForm } from "../lib/scaffold";
import { obFormQueryOptions, obFormsQueryOptions } from "../queries";
import { ObAssistantChat } from "./ObAssistantChat";
import { ObAttachmentCard } from "./ObAttachmentCard";
import { ObFormFields } from "./ObFormFields";
import { ObItineraryTable } from "./ObItineraryTable";
import { ObPreview } from "./ObPreview";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Itinerary rows worth persisting — a row counts only if it has any value. */
function buildRows(rows: ObEntry[]): ObEntry[] {
  return rows
    .filter((r) => r.from_place || r.to_place || r.purpose || r.time_departure || r.time_return)
    .map((r, idx) => ({ ...r, idx }));
}

/** Write a save into the query cache WITHOUT dropping the `attachment` sibling.
 *  A bare `{ form, entries }` write replaces the whole entry, so the file the
 *  card renders would vanish until the next refetch (e.g. the auto-save fired by
 *  ticking "Approved" made the attachment look deleted). */
function writeFormCache(
  qc: QueryClient,
  id: string,
  next: { form: ObForm & { id: string }; entries: ObEntry[] },
) {
  qc.setQueryData(obFormQueryOptions(id).queryKey, (prev) => (prev ? { ...prev, ...next } : next));
}

export function ObEditor({ id }: { id: string }) {
  const session = useSession();
  const canEdit = Boolean(session);
  const qc = useQueryClient();

  const { data } = useQuery(obFormQueryOptions(id));
  const profileQuery = useQuery(profileQueryOptions());
  // Identity fields are auto-filled from the profile when a form is created, so
  // the profile is the reference for telling that auto-fill apart from content the
  // user actually typed.
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  const [form, setForm] = useState<ObForm | null>(null);
  const [rows, setRows] = useState<ObEntry[]>([]);
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
  const latestRef = useRef({ form, rows, canEdit, profile });
  latestRef.current = { form, rows, canEdit, profile };

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
    const localSig = readSignatureBackup("ob", id);
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
    const incoming = JSON.stringify({ form: nextForm, entries: nextRows });

    if (hydratedRef.current) {
      const current = JSON.stringify({ form, entries: buildRows(rows) });
      // Unsaved local edits always win — a save's cache write or a background
      // refetch must never clobber what the user is currently typing.
      if (current !== savedSnapshotRef.current) return;
      // Already in sync — reapplying identical values would just loop.
      if (current === incoming) return;
    }

    setForm(nextForm);
    setRows(nextRows);
    savedSnapshotRef.current = incoming;
    initialSnapshotRef.current = incoming;
    // An attachment counts as real content: the file itself lives in storage, so
    // `data.attachment` is what tells the scaffold check it exists.
    wasScaffoldOnLoadRef.current = isScaffoldForm(
      nextForm,
      nextRows,
      profile,
      Boolean(data.attachment),
    );
    // A form that already holds real content is one the user meant to keep — lock
    // that in now so clearing a field later can never trigger the scaffold delete.
    // It also stops being a "pending" form the list is hiding.
    if (!wasScaffoldOnLoadRef.current) {
      keptRef.current = true;
      unmarkPendingForm(id);
    }
    hydratedRef.current = true;
  }, [data, id, profile, profileReady, form, rows]);

  // Keep a local backup of the signature so it survives a failed save.
  useEffect(() => {
    if (!form) return;
    saveSignatureBackup("ob", id, form.employee_signature);
  }, [form?.employee_signature, id]);

  // Auto-save: after edits settle, persist quietly in the background.
  useEffect(() => {
    if (!hydratedRef.current || !form || !canEdit) return;
    const entries = buildRows(rows);
    const snapshot = JSON.stringify({ form, entries });
    if (snapshot === savedSnapshotRef.current) return;
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      saveObForm({ data: { id, form, entries } })
        .then(() => {
          savedSnapshotRef.current = snapshot;
          // Keep the query cache truthful: the router can remount this editor
          // during navigation, and that instance hydrates from the cache — it
          // must never mistake saved content for an untouched scaffold.
          writeFormCache(qc, id, { form: { ...form, id }, entries });
          // Auto-save also fires for hydration-driven diffs, so only a save that
          // carries real content counts as a deliberate edit. Saving the bare
          // auto-fill keeps the form discardable instead of locking it in — and
          // still hidden from the list.
          if (!isScaffoldForm(form, entries, latestRef.current.profile)) {
            keptRef.current = true;
            unmarkPendingForm(id);
          }
          // The list shows this form's name and "Updated" time — mark it stale so
          // the next visit picks up what was just written.
          qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey, refetchType: "none" });
          setSaveStatus("saved");
        })
        .catch(() => setSaveStatus("error"));
    }, 1200);
    return () => clearTimeout(timer);
  }, [form, rows, canEdit, id, qc]);

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
      const { form: f, rows: r, canEdit: editable, profile: prof } = latestRef.current;
      if (!editable || !f) return;
      const entries = buildRows(r);
      const snapshot = JSON.stringify({ form: f, entries });
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
          void getObForm({ data: { id } })
            .then(({ form: freshForm, entries: fresh, attachment }) => {
              if (!isScaffoldForm(freshForm, fresh, prof, Boolean(attachment))) {
                writeFormCache(qc, id, { form: { ...freshForm, id }, entries: fresh });
                return;
              }
              return deleteObForm({ data: { id, quiet: true } });
            })
            .then(() => {
              // Resolved either way — it gained content and is kept, or it is gone.
              unmarkPendingForm(id);
              return qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey });
            })
            .catch(() => qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey }));
        }
        return;
      }
      if (snapshot !== savedSnapshotRef.current) {
        // Write the cache synchronously, before the network call: the remounted
        // instance hydrates within milliseconds and has to see these changes.
        writeFormCache(qc, id, { form: { ...f, id }, entries });
        // Leaving with content is a decision to keep it, whatever it contains.
        unmarkPendingForm(id);
        void saveObForm({ data: { id, form: f, entries } })
          .then(() => qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey }))
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!form) return <EditorSkeleton />;

  async function persist(f: ObForm, entries: ObEntry[]) {
    await saveObForm({ data: { id, form: f, entries } });
    savedSnapshotRef.current = JSON.stringify({ form: f, entries });
    // Keep the query cache truthful — a remounted editor hydrates from it and
    // must see what was just saved, or it would treat real content as a scaffold.
    writeFormCache(qc, id, { form: { ...f, id }, entries });
    // Saving real content marks the form kept so it's never auto-discarded later —
    // even if the user then clears it back — and the list can stop hiding it.
    // Saving the untouched auto-fill does neither: it stays hidden and is still
    // discarded when left, exactly like a form nobody opened.
    if (!isScaffoldForm(f, entries, profile)) {
      keptRef.current = true;
      unmarkPendingForm(id);
    }
    qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey, refetchType: "none" });
  }

  // The assistant replies with a partial patch; merge it into whatever is on
  // screen so it never clobbers something typed a moment ago. From here it flows
  // through the ordinary auto-save path like any other edit.
  function applyAssistantPatch(patch: Partial<ObForm>, entries?: ObEntry[]) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    if (entries) setRows(entries);
  }

  // A stored attachment is content: keep this form out of the scaffold discard
  // and off the hidden-pending list the moment the file lands.
  function handleAttachmentUploaded() {
    keptRef.current = true;
    unmarkPendingForm(id);
  }

  async function onSave() {
    if (!form) return;
    const entries = buildRows(rows);
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

  async function download() {
    if (!form) return;
    setBusy(true);
    const toastId = toast.loading("Preparing Word file…");
    try {
      // docxtemplater + pizzip are only needed when exporting (~330 kB) — keeping
      // them out of the route chunk makes opening this form much faster.
      const { downloadObWord } = await import("../lib/word-export");
      await downloadObWord({
        form,
        rows: buildRows(rows),
        fileName: `${APP.name}_OB_${form.employee_name || "form"}.docx`,
      });
      toast.success("Word file downloaded", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Word download failed.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  // Always at the top of the preview column — the upload prompt and an already
  // attached slip both belong where you look first. Print order is handled by
  // `print:order` on the wrapper below, so the slip still follows the form.
  const attachmentCard = (
    <ObAttachmentCard
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
            to="/official-business"
            className="btn btn-outline mt-0.5 size-9 shrink-0 p-0"
            aria-label="Back to official business forms"
            title="Back to official business forms"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Official Business
            </p>
            <h1 className="text-2xl font-semibold leading-tight">Official Business Form</h1>
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
        <div className="no-print flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <ObFormFields
            form={form}
            setForm={setForm}
            canEdit={canEdit}
            savedSignature={profile?.signature}
          />
          <ObItineraryTable rows={rows} setRows={setRows} canEdit={canEdit} busy={busy} />
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
            <ObPreview sheetId="ob-sheet" form={form} rows={rows} />
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
        title="Official Business Form — full view"
      >
        <ObPreview form={form} rows={rows} />
      </PreviewLightbox>
    </main>
  );
}
