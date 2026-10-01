import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { deleteObForm, getObForm } from "@/api/official-business.functions";
import { profileQueryOptions } from "@/features/profile/queries";
import type { EmployeeProfile } from "@/shared/types";
import { obFormsQueryOptions } from "../queries";
import { isScaffoldForm } from "./scaffold";

/**
 * OB forms are auto-created with the profile already filled in, so a form can
 * exist that the user never actually touched. Those are handled silently: the
 * list hides them while they are unresolved, and a background sweep deletes the
 * ones that are still untouched (and reveals the ones that gained content).
 * The sweep also picks up leftover auto-fills that never got a marker — created
 * before this registry existed, or after a lost marker — so the list cleans
 * itself up without the card ever flashing in and out.
 *
 * The marker lives in localStorage because it has to survive the editor the
 * form was created for unmounting — the list only ever sees the id.
 */
type PendingForm = { id: string; at: number };

/** A row as `listObForms` returns it — enough for the cheap candidate pre-filter. */
type ObListRow = {
  id: string;
  id_number: string;
  employee_name: string;
  department: string;
  position: string;
  date_of_ob: string | null;
  updated_at: string;
};

const STORAGE_KEY = "ob-pending-forms";
/** Younger than this, the editor for that form may still be open — leave it alone. */
const SWEEP_MIN_AGE_MS = 60_000;
/** Safety valve so a forgotten marker can never hide a form forever. */
const MARKER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** One sweep at a time — StrictMode mounts the list twice. */
let sweepRunning = false;

function readMarkers(): PendingForm[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (m): m is PendingForm =>
        Boolean(m) &&
        typeof (m as PendingForm).id === "string" &&
        typeof (m as PendingForm).at === "number" &&
        now - (m as PendingForm).at < MARKER_MAX_AGE_MS,
    );
  } catch {
    return [];
  }
}

function writeMarkers(list: PendingForm[]) {
  if (typeof window === "undefined") return;
  try {
    if (list.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode / quota). The marker only hides a
    // form until it is resolved, so failing quietly costs nothing.
  }
}

/** Called when a form is created but not yet opened/filled. */
export function markPendingForm(id: string) {
  const list = readMarkers();
  if (list.some((m) => m.id === id)) return;
  writeMarkers([...list, { id, at: Date.now() }]);
}

/** Called as soon as a form is known to be kept — or is gone for good. */
export function unmarkPendingForm(id: string) {
  const list = readMarkers();
  const next = list.filter((m) => m.id !== id);
  if (next.length !== list.length) writeMarkers(next);
}

/**
 * Returns the ids the OB forms list must hide, and marks new ones as they are
 * created. Also sweeps in the background: a form that is still an untouched
 * auto-fill is deleted, one that gained content is simply revealed — whether it
 * was marked at creation or is an unmarked leftover already in the list.
 */
export function usePendingForms(): {
  pendingIds: Set<string>;
  markPending: (id: string) => void;
} {
  const qc = useQueryClient();
  const [markers, setMarkers] = useState<PendingForm[]>(readMarkers);
  const { data: forms } = useQuery(obFormsQueryOptions());

  // Memoized so the sweep effect only re-runs when the markers really change.
  const sweepIds = useMemo(
    () => markers.filter((m) => Date.now() - m.at >= SWEEP_MIN_AGE_MS).map((m) => m.id),
    [markers],
  );

  // Auto-fills already in the list WITHOUT a marker — created before this
  // registry existed, or after a lost marker. The list row only rules forms out
  // cheaply (a real Date of OB, a marker, or a form saved in the last minute);
  // everything that survives this filter is verified in full before any delete.
  const leftovers = useMemo(() => {
    const marked = new Set(markers.map((m) => m.id));
    const now = Date.now();
    return ((forms ?? []) as ObListRow[]).filter(
      (f) =>
        !marked.has(f.id) &&
        !f.date_of_ob?.trim() &&
        now - new Date(f.updated_at).getTime() >= SWEEP_MIN_AGE_MS,
    );
  }, [forms, markers]);

  // The sweep can only tell "untouched" apart from "filled in" with the profile
  // next to it, and it is only needed when there is something to sweep.
  const profileQuery = useQuery({
    ...profileQueryOptions(),
    enabled: sweepIds.length > 0 || leftovers.length > 0,
  });
  const profile: EmployeeProfile | null = profileQuery.data ?? null;
  const profileReady = profileQuery.isSuccess;

  useEffect(() => {
    if ((!sweepIds.length && !leftovers.length) || !profileReady || sweepRunning) return;
    sweepRunning = true;
    const ids = sweepIds;
    const rows = leftovers;
    void (async () => {
      let changed = false;
      let removed = false;
      try {
        // Marked forms — created here, hidden until they are resolved.
        for (const id of ids) {
          try {
            const { form, entries } = await getObForm({ data: { id } });
            if (isScaffoldForm(form, entries, profile)) {
              await deleteObForm({ data: { id } });
              removed = true;
            }
            changed = true;
            unmarkPendingForm(id);
          } catch (e) {
            if (e instanceof Error && /not found/i.test(e.message)) {
              // Already discarded elsewhere — the marker is just stale.
              changed = true;
              unmarkPendingForm(id);
            }
            // Anything else keeps its marker, so the next visit retries instead of
            // revealing a form that may still be an untouched auto-fill.
          }
        }

        // Unmarked leftovers: only rows that still look exactly like the profile
        // auto-fill are worth fetching, and the full form then has to confirm it
        // (itinerary / signature / approval) — the same check the editor does
        // before it silently discards a form someone left untouched.
        for (const row of rows) {
          if (!profile || !looksLikeAutoFill(row, profile)) continue;
          try {
            const { form, entries } = await getObForm({ data: { id: row.id } });
            if (isScaffoldForm(form, entries, profile)) {
              await deleteObForm({ data: { id: row.id } });
              removed = true;
            }
          } catch {
            // Already gone (or a transient error) — nothing to do; the next
            // visit retries instead of guessing.
          }
        }

        if (changed) setMarkers(readMarkers());
        if (removed) await qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey });
      } finally {
        sweepRunning = false;
      }
    })();
  }, [sweepIds, leftovers, profileReady, profile, qc]);

  const pendingIds = useMemo(() => new Set(markers.map((m) => m.id)), [markers]);

  return {
    pendingIds,
    markPending: (id: string) => {
      markPendingForm(id);
      setMarkers(readMarkers());
    },
  };
}

/** The list-row half of `isScaffoldForm`: identity still matches the auto-fill.
 *  Only then is the full fetch (and possible delete) worth it. */
function looksLikeAutoFill(row: ObListRow, profile: EmployeeProfile): boolean {
  const norm = (v: string | null | undefined) => (v ?? "").trim();
  return (
    norm(row.id_number) === norm(profile.emp_no) &&
    norm(row.employee_name) === norm(profile.full_name) &&
    norm(row.department) === norm(profile.area) &&
    norm(row.position) === norm(profile.designation)
  );
}
