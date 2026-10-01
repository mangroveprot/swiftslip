import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileDown, Loader2, Printer, Save as SaveIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { deleteObForm, getObForm, saveObForm } from "@/api/official-business.functions";
import { useSession } from "@/features/auth/use-session";
import { profileQueryOptions } from "@/features/profile/queries";
import { toast } from "@/lib/toast";
import type { EmployeeProfile, ObEntry, ObForm } from "@/shared/types";
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

/**
 * A form the user hasn't actually filled in. Identity fields (id number, name,
 * department, position) and Date Filed are auto-prefilled from the profile / today
 * when the form is created, so they only count as content when they differ from
 * that auto-fill — otherwise a brand-new form would look "used" the moment it's
 * created and never get discarded on exit. Any real input (itinerary rows,
 * signature, approver, date of OB, or an edited identity field) marks the form as
 * worth keeping, even if the user later clears it again. Date Filed is excluded
 * here on purpose: edits to it are caught by the net-change check on leave.
 */
function isScaffoldForm(form: ObForm, rows: ObEntry[], profile: EmployeeProfile | null): boolean {
  if (
    rows.length > 0 ||
    form.employee_signature ||
    form.approved_by?.trim() ||
    form.date_of_ob?.trim() ||
    form.approved_via_viber
  ) {
    return false;
  }
  const norm = (v: string | null | undefined) => (v ?? "").trim();
  const p = profile ?? { emp_no: "", full_name: "", designation: "", area: "" };
  return (
    norm(form.id_number) === norm(p.emp_no) &&
    norm(form.employee_name) === norm(p.full_name) &&
    norm(form.department) === norm(p.area) &&
    norm(form.position) === norm(p.designation)
  );
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
    wasScaffoldOnLoadRef.current = isScaffoldForm(nextForm, nextRows, profile);
    if (!wasScaffoldOnLoadRef.current) keptRef.current = true;
    hydratedRef.current = true;
  }, [data, id, profile, profileReady, form, rows]);

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
          // Keep the query cache truthful: the router can remount this editor
          // during navigation, and that instance hydrates from the cache — it
          // must never mistake saved content for an untouched scaffold.
          qc.setQueryData(obFormQueryOptions(id).queryKey, { form: { ...form, id }, entries });
          // Auto-save only fires when something actually changed — that counts as a
          // deliberate edit, so from this point on the form is never auto-discarded.
          keptRef.current = true;
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
            .then(({ form: freshForm, entries: fresh }) => {
              if (!isScaffoldForm(freshForm, fresh, prof)) {
                qc.setQueryData(obFormQueryOptions(id).queryKey, {
                  form: { ...freshForm, id },
                  entries: fresh,
                });
                return;
              }
              return deleteObForm({ data: { id } });
            })
            .then(() => qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey }))
            .catch(() => qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey }));
        }
        return;
      }
      if (snapshot !== savedSnapshotRef.current) {
        // Write the cache synchronously, before the network call: the remounted
        // instance hydrates within milliseconds and has to see these changes.
        qc.setQueryData(obFormQueryOptions(id).queryKey, { form: { ...f, id }, entries });
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
    // Keep the query cache truthful — a remounted editor hydrates from it and
    // must see what was just saved, or it would treat real content as a scaffold.
    qc.setQueryData(obFormQueryOptions(id).queryKey, { form: { ...f, id }, entries });
    if (!isScaffoldForm(f, entries, profile)) keptRef.current = true;
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
