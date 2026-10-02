import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { deleteRecord, getRecord } from "@/api/records.functions";
import { profileQueryOptions } from "@/features/profile/queries";
import type { EmployeeProfile } from "@/shared/types";
import { recordsQueryOptions } from "../queries";
import { isScaffoldRecord } from "./scaffold";

/**
 * Records are auto-created with the profile already filled in, so a record can
 * exist that the user never actually touched. Those are handled silently: the
 * list hides them while they are unresolved, and a background sweep deletes the
 * ones that are still untouched (and reveals the ones that gained content).
 *
 * The marker lives in localStorage because it has to survive the editor the
 * record was created for unmounting — the list only ever sees the id.
 */
type PendingRecord = { id: string; at: number };

const STORAGE_KEY = "dtr-pending-records";
/** Younger than this, the editor for that record may still be open — leave it alone. */
const SWEEP_MIN_AGE_MS = 60_000;
/** Safety valve so a forgotten marker can never hide a record forever. */
const MARKER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** One sweep at a time — StrictMode mounts the list twice. */
let sweepRunning = false;

function readMarkers(): PendingRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (m): m is PendingRecord =>
        Boolean(m) &&
        typeof (m as PendingRecord).id === "string" &&
        typeof (m as PendingRecord).at === "number" &&
        now - (m as PendingRecord).at < MARKER_MAX_AGE_MS,
    );
  } catch {
    return [];
  }
}

function writeMarkers(list: PendingRecord[]) {
  if (typeof window === "undefined") return;
  try {
    if (list.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode / quota). The marker only hides a
    // record until it is resolved, so failing quietly costs nothing.
  }
}

/** Called when a record is created but not yet opened/filled. */
export function markPendingRecord(id: string) {
  const list = readMarkers();
  if (list.some((m) => m.id === id)) return;
  writeMarkers([...list, { id, at: Date.now() }]);
}

/** Called as soon as a record is known to be kept — or is gone for good. */
export function unmarkPendingRecord(id: string) {
  const list = readMarkers();
  const next = list.filter((m) => m.id !== id);
  if (next.length !== list.length) writeMarkers(next);
}

/**
 * Returns the ids the records list must hide, and marks new ones as they are
 * created. Also sweeps stale markers in the background: a record that is still
 * an untouched auto-fill is deleted, one that gained content is simply revealed.
 */
export function usePendingRecords(): {
  pendingIds: Set<string>;
  markPending: (id: string) => void;
} {
  const qc = useQueryClient();
  const [markers, setMarkers] = useState<PendingRecord[]>(readMarkers);

  // Memoized so the sweep effect only re-runs when the markers really change.
  const sweepIds = useMemo(
    () => markers.filter((m) => Date.now() - m.at >= SWEEP_MIN_AGE_MS).map((m) => m.id),
    [markers],
  );

  // The sweep can only tell "untouched" apart from "filled in" with the profile
  // next to it, and it is only needed when there is something to sweep.
  const profileQuery = useQuery({ ...profileQueryOptions(), enabled: sweepIds.length > 0 });
  const profile: EmployeeProfile | null = profileQuery.data ?? null;
  const profileReady = profileQuery.isSuccess;

  useEffect(() => {
    if (!sweepIds.length || !profileReady || sweepRunning) return;
    sweepRunning = true;
    const ids = sweepIds;
    void (async () => {
      let changed = false;
      let removed = false;
      try {
        for (const id of ids) {
          try {
            const { record, entries, attachment } = await getRecord({ data: { id } });
            if (isScaffoldRecord(record, entries, profile, Boolean(attachment))) {
              await deleteRecord({ data: { id, quiet: true } });
              removed = true;
            }
            changed = true;
            unmarkPendingRecord(id);
          } catch (e) {
            if (e instanceof Error && /not found/i.test(e.message)) {
              // Already discarded elsewhere — the marker is just stale.
              changed = true;
              unmarkPendingRecord(id);
            }
            // Anything else keeps its marker, so the next visit retries instead of
            // revealing a record that may still be an untouched auto-fill.
          }
        }
        if (changed) setMarkers(readMarkers());
        if (removed) await qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey });
      } finally {
        sweepRunning = false;
      }
    })();
  }, [sweepIds, profileReady, profile, qc]);

  const pendingIds = useMemo(() => new Set(markers.map((m) => m.id)), [markers]);

  return {
    pendingIds,
    markPending: (id: string) => {
      markPendingRecord(id);
      setMarkers(readMarkers());
    },
  };
}
