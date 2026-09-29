import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileDown, Loader2, Printer, Save as SaveIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { deleteObForm, saveObForm } from "@/api/official-business.functions";
import { useSession } from "@/features/auth/use-session";
import { toast } from "@/lib/toast";
import type { ObEntry, ObForm } from "@/shared/types";
import { APP } from "@/config/app";
import { downloadObWord } from "../lib/word-export";
import { obFormQueryOptions, obFormsQueryOptions } from "../queries";
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

/** A form the user hasn't actually filled in. Identity fields (id number, name,
 * department, position) and Date Filed are auto-prefilled from the profile /
 * today when the form is created, so they DON'T count as user input — otherwise a
 * brand-new form would look "used" the moment it's created and never get
 * discarded on exit. Only real input marks a form as worth keeping. */
function isBlankForm(form: ObForm, rows: ObEntry[]): boolean {
  return (
    rows.length === 0 &&
    !form.employee_signature &&
    !form.approved_by?.trim() &&
    !form.date_of_ob?.trim() &&
    !form.approved_via_viber
  );
}

export function ObEditor({ id }: { id: string }) {
  const session = useSession();
  const canEdit = Boolean(session);
  const qc = useQueryClient();

  const { data } = useQuery(obFormQueryOptions(id));

  const [form, setForm] = useState<ObForm | null>(null);
  const [rows, setRows] = useState<ObEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Serialized snapshot of what's already persisted, so we only save real changes.
  const savedSnapshotRef = useRef<string>("");
  const hydratedRef = useRef(false);
  const wasBlankOnLoadRef = useRef(false);
  const keptRef = useRef(false);
  const latestRef = useRef({ form, rows, canEdit });
  latestRef.current = { form, rows, canEdit };

  // Load the saved form into local edit state.
  useEffect(() => {
    if (!data) return;
    const f = data.form;
    const localSig =
      typeof window !== "undefined" ? (localStorage.getItem(`ob-sig:${id}`) ?? "") : "";
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
    };
    const nextRows = buildRows(data.entries);
    setForm(nextForm);
    setRows(nextRows);

    savedSnapshotRef.current = JSON.stringify({ form: nextForm, entries: nextRows });
    wasBlankOnLoadRef.current = isBlankForm(nextForm, nextRows);
    if (!wasBlankOnLoadRef.current) keptRef.current = true;
    hydratedRef.current = true;
  }, [data, id]);

  // Keep a local backup of the signature so it survives a failed save.
  useEffect(() => {
    if (!form || typeof window === "undefined") return;
    if (form.employee_signature) localStorage.setItem(`ob-sig:${id}`, form.employee_signature);
    else localStorage.removeItem(`ob-sig:${id}`);
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
          if (!isBlankForm(form, entries)) keptRef.current = true;
          setSaveStatus("saved");
        })
        .catch(() => setSaveStatus("error"));
    }, 1200);
    return () => clearTimeout(timer);
  }, [form, rows, canEdit, id]);

  // Let the "Saved" confirmation linger briefly, then return the button to idle.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // On leaving: discard an untouched new form, or flush any unsaved changes.
  useEffect(() => {
    return () => {
      const { form: f, rows: r, canEdit: editable } = latestRef.current;
      if (!editable || !f) return;
      const entries = buildRows(r);
      if (wasBlankOnLoadRef.current && !keptRef.current && isBlankForm(f, entries)) {
        void deleteObForm({ data: { id } })
          .then(() => qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey }))
          .catch(() => {});
        return;
      }
      const snapshot = JSON.stringify({ form: f, entries });
      if (snapshot !== savedSnapshotRef.current) {
        void saveObForm({ data: { id, form: f, entries } })
          .then(() => qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey }))
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!form) {
    return <main className="p-10 text-sm text-muted-foreground">Loading form…</main>;
  }

  async function persist(f: ObForm, entries: ObEntry[]) {
    await saveObForm({ data: { id, form: f, entries } });
    savedSnapshotRef.current = JSON.stringify({ form: f, entries });
    if (!isBlankForm(f, entries)) keptRef.current = true;
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

  return (
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-5 md:py-4 lg:h-full lg:overflow-hidden print:h-auto print:overflow-visible print:p-0">
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
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="no-print flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <ObFormFields form={form} setForm={setForm} canEdit={canEdit} />
          <ObItineraryTable rows={rows} setRows={setRows} canEdit={canEdit} busy={busy} />
        </div>

        <div className="flex min-h-0 flex-col lg:overflow-hidden print:overflow-visible">
          <p className="no-print mb-1.5 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
            Live preview
          </p>
          <div className="min-h-0 rounded-sm lg:flex-1 lg:overflow-auto print:overflow-visible">
            <ObPreview form={form} rows={rows} />
          </div>
        </div>
      </div>
    </main>
  );
}
