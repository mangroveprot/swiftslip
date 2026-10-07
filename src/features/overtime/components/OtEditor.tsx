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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { deleteOtForm, getOtForm, saveOtForm } from "@/api/ot.functions";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { OtherAttachmentsPrint } from "@/components/common/OtherAttachmentsPrint";
import { EditorSkeleton } from "@/components/common/Skeletons";
import { useSession } from "@/features/auth/use-session";
import { profileQueryOptions } from "@/features/profile/queries";
import { readSignatureBackup, saveSignatureBackup } from "@/lib/signature";
import { toast } from "@/lib/toast";
import type { OtEntry, OtForm } from "@/shared/types";
import { APP } from "@/config/app";
import { isBlankOtEntry } from "../lib/ot-line";
import { unmarkPendingForm } from "../lib/pending-forms";
import { isScaffoldForm } from "../lib/scaffold";
import { otFormQueryOptions, otFormsQueryOptions, otOtherUrlsQueryOptions } from "../queries";
import { OtAssistantChat } from "./OtAssistantChat";
import { OtAttachmentCard } from "./OtAttachmentCard";
import { OtEntriesTable } from "./OtEntriesTable";
import { OtFormFields } from "./OtFormFields";
import { OtOtherAttachmentsCard } from "./OtOtherAttachmentsCard";
import { OtPreview } from "./OtPreview";

type SaveStatus = "idle" | "saving" | "saved" | "error";

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

export function OtEditor({ id }: { id: string }) {
  const session = useSession();
  const canEdit = Boolean(session);
  const qc = useQueryClient();

  const { data } = useQuery(otFormQueryOptions(id));
  const profileQuery = useQuery(profileQueryOptions());
  const profile = profileQuery.data ?? null;
  const profileReady = profileQuery.data !== undefined || profileQuery.isError;

  // The extra attachments, plus their signed links. The card in the form column
  // lists them and the print pages below render them; both read this one query.
  const others = data?.others ?? [];
  const { data: otherUrls } = useQuery({
    ...otOtherUrlsQueryOptions(id),
    enabled: others.length > 0,
  });

  const [form, setForm] = useState<OtForm | null>(null);
  const [entries, setEntries] = useState<OtEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  const savedSnapshotRef = useRef<string>("");
  const initialSnapshotRef = useRef<string>("");
  const hydratedRef = useRef(false);
  const wasScaffoldOnLoadRef = useRef(false);
  const keptRef = useRef(false);
  const latestRef = useRef({ form, entries, canEdit, profile });
  latestRef.current = { form, entries, canEdit, profile };

  const mountPathRef = useRef(useRouterState({ select: (s) => s.location.pathname }));
  const mountedAtRef = useRef(Date.now());

  // Load the saved form into local edit state.
  useEffect(() => {
    if (!data || !profileReady) return;
    const f = data.form;
    const localSig = readSignatureBackup("ot", id);
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
    const incoming = JSON.stringify({ form: nextForm, entries: nextEntries });

    if (hydratedRef.current) {
      const current = JSON.stringify({ form, entries: buildEntries(entries) });
      // Unsaved local edits always win — a save's cache write or a background
      // refetch must never clobber what the user is currently typing.
      if (current !== savedSnapshotRef.current) return;
      if (current === incoming) return;
    }

    setForm(nextForm);
    setEntries(nextEntries);
    savedSnapshotRef.current = incoming;
    initialSnapshotRef.current = incoming;
    wasScaffoldOnLoadRef.current = isScaffoldForm(
      nextForm,
      nextEntries,
      profile,
      Boolean(data.attachment),
    );
    if (!wasScaffoldOnLoadRef.current) {
      keptRef.current = true;
      unmarkPendingForm(id);
    }
    hydratedRef.current = true;
  }, [data, id, profile, profileReady, form, entries]);

  // Keep a local backup of the signature so it survives a failed save.
  const sig = form?.employee_signature ?? "";
  const formLoaded = form !== null;
  useEffect(() => {
    if (!formLoaded) return;
    saveSignatureBackup("ot", id, sig);
  }, [formLoaded, sig, id]);

  // Auto-save: after edits settle, persist quietly in the background.
  useEffect(() => {
    if (!hydratedRef.current || !form || !canEdit) return;
    const rows = buildEntries(entries);
    const snapshot = JSON.stringify({ form, entries: rows });
    if (snapshot === savedSnapshotRef.current) return;
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      saveOtForm({ data: { id, form, entries: rows } })
        .then(() => {
          savedSnapshotRef.current = snapshot;
          writeFormCache(qc, id, { form: { ...form, id }, entries: rows });
          if (!isScaffoldForm(form, rows, latestRef.current.profile)) {
            keptRef.current = true;
            unmarkPendingForm(id);
          }
          qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey, refetchType: "none" });
          setSaveStatus("saved");
        })
        .catch(() => setSaveStatus("error"));
    }, 1200);
    return () => clearTimeout(timer);
  }, [form, entries, canEdit, id, qc]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // On leaving: discard an untouched scaffold, or flush unsaved changes.
  useEffect(() => {
    const mountPath = mountPathRef.current;
    const mountedAt = mountedAtRef.current;
    return () => {
      const { form: f, entries: e, canEdit: editable, profile: prof } = latestRef.current;
      if (!editable || !f) return;
      const rows = buildEntries(e);
      const snapshot = JSON.stringify({ form: f, entries: rows });
      if (
        wasScaffoldOnLoadRef.current &&
        !keptRef.current &&
        snapshot === initialSnapshotRef.current
      ) {
        const genuineExit = mountPath.endsWith(`/${id}`) && Date.now() - mountedAt > 100;
        if (genuineExit) {
          void getOtForm({ data: { id } })
            .then(({ form: freshForm, entries: fresh, attachment }) => {
              if (!isScaffoldForm(freshForm, fresh, prof, Boolean(attachment))) {
                writeFormCache(qc, id, { form: { ...freshForm, id }, entries: fresh });
                return;
              }
              return deleteOtForm({ data: { id, quiet: true } });
            })
            .then(() => {
              unmarkPendingForm(id);
              return qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey });
            })
            .catch(() => qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey }));
        }
        return;
      }
      if (snapshot !== savedSnapshotRef.current) {
        writeFormCache(qc, id, { form: { ...f, id }, entries: rows });
        unmarkPendingForm(id);
        void saveOtForm({ data: { id, form: f, entries: rows } })
          .then(() => qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey }))
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!form) return <EditorSkeleton />;

  async function persist(f: OtForm, rows: OtEntry[]) {
    await saveOtForm({ data: { id, form: f, entries: rows } });
    savedSnapshotRef.current = JSON.stringify({ form: f, entries: rows });
    writeFormCache(qc, id, { form: { ...f, id }, entries: rows });
    if (!isScaffoldForm(f, rows, profile)) {
      keptRef.current = true;
      unmarkPendingForm(id);
    }
    qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey, refetchType: "none" });
  }

  function handleAttachmentUploaded() {
    keptRef.current = true;
    unmarkPendingForm(id);
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
          <OtOtherAttachmentsCard
            id={id}
            canEdit={canEdit}
            others={others}
            onUploaded={handleAttachmentUploaded}
          />
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
