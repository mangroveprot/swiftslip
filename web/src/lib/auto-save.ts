/**
 * Three-tier auto-save.
 *
 * Typing must not turn into a request per keystroke — the server is the expensive,
 * rate-limited tier, so it is the one that gets rationed:
 *
 *  1. **Local state** — free, every keystroke, handled by React.
 *  2. **localStorage** — cheap. Written once typing settles, so a refresh or a
 *     closed tab cannot lose more than the last moment of work.
 *  3. **The API** — the costly one. Written when the form has been quiet for
 *     `quietMs`, but never more often than `minGapMs`, and never left waiting
 *     longer than `maxWaitMs` while someone keeps typing.
 *
 * The gap and the cap pull in opposite directions on purpose: the gap stops a
 * burst of edits from becoming a burst of requests, and the cap stops a
 * continuously-typing user from never being saved at all.
 */

/** Settle time after the last change. Drives the local backup and is the
 *  minimum quiet period before any API write. */
export const QUIET_MS = 1500;
/** Floor between two API writes. */
export const MIN_GAP_MS = 5000;
/** Ceiling on how long an unsaved streak may wait, however busy the keyboard is. */
export const MAX_WAIT_MS = 30_000;

export type SaveStatus = "saving" | "saved" | "error";

export type AutoSave = {
  /** Re-arm after a content change. Cheap and synchronous; call it freely. */
  arm: (snapshot: string) => void;
  /** Persist anything outstanding right now — leaving the page, or Save. */
  flush: () => void;
  /**
   * Declare a snapshot already written by other means, so it is not written
   * again. The draft insert uses this: it creates the row and saves its content
   * itself, and the change controller then treats that as the new baseline.
   */
  setPersisted: (snapshot: string) => void;
  /** What's currently known to be in the database — "" when nothing is. */
  persistedSnapshot: () => string;
  /**
   * The pristine auto-filled state a draft started from. Recorded once, and used
   * as the insert trigger: a draft only becomes a real row once its content
   * differs from this.
   */
  setBaseline: (snapshot: string) => void;
  /** True when the draft has moved away from its auto-fill. */
  belowBaseline: (snapshot: string) => boolean;
};

export function createAutoSave(opts: {
  /** The snapshot already in the database, so untouched content never saves. */
  initial: string;
  save: (snapshot: string) => Promise<void>;
  /** Tier 2 — usually writes the form to localStorage. */
  stageLocal?: (snapshot: string) => void;
  onStatus?: (status: SaveStatus) => void;
}): AutoSave {
  const { save, stageLocal, onStatus } = opts;

  let persisted = opts.initial;
  let baseline: string | null = null;
  let pending: string | null = null;
  /** When the current unsaved streak began — anchors the max-wait cap. */
  let dirtySince = 0;
  let lastApiAt = 0;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let apiTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  function clearTimers() {
    if (quietTimer !== null) clearTimeout(quietTimer);
    if (apiTimer !== null) clearTimeout(apiTimer);
    quietTimer = null;
    apiTimer = null;
  }

  function runSave(snapshot: string) {
    inFlight = true;
    onStatus?.("saving");
    void save(snapshot)
      .then(() => {
        persisted = snapshot;
        onStatus?.("saved");
      })
      .catch(() => {
        // Leave `pending` pointing at the change so the next arm retries it, and
        // let the caller surface the failure through its own status UI.
        onStatus?.("error");
      })
      .finally(() => {
        inFlight = false;
        // Re-arm with whatever is newest: typing that landed mid-flight has to be
        // picked up, and an unchanged snapshot simply clears the timers.
        if (pending !== null) arm(pending);
      });
  }

  function arm(snapshot: string) {
    if (snapshot === persisted) {
      // Back in sync with the database — nothing left to do.
      pending = null;
      dirtySince = 0;
      clearTimers();
      return;
    }

    pending = snapshot;
    const now = Date.now();
    if (!dirtySince) dirtySince = now;
    clearTimers();

    // Tier 2 — local only, so it fires on every settled pause.
    quietTimer = setTimeout(() => {
      quietTimer = null;
      stageLocal?.(snapshot);
    }, QUIET_MS);

    // Tier 3 — the API, once quiet and once the previous write is old enough.
    const quietUntil = now + QUIET_MS;
    const gapUntil = lastApiAt + MIN_GAP_MS;
    const capAt = dirtySince + MAX_WAIT_MS;
    const fireAt = Math.min(Math.max(quietUntil, gapUntil), capAt);
    apiTimer = setTimeout(
      () => {
        apiTimer = null;
        const target = pending;
        if (target === null) return;
        lastApiAt = Date.now();
        dirtySince = 0;
        runSave(target);
      },
      Math.max(0, fireAt - now),
    );
  }

  function flush() {
    clearTimers();
    const target = pending;
    // An in-flight write already carries this content, or the database matches.
    if (target === null || target === persisted || inFlight) return;
    lastApiAt = Date.now();
    dirtySince = 0;
    runSave(target);
  }

  function setPersisted(snapshot: string) {
    persisted = snapshot;
    if (pending === snapshot) {
      pending = null;
      dirtySince = 0;
      clearTimers();
    }
  }

  const persistedSnapshot = () => persisted;

  function setBaseline(snapshot: string) {
    baseline = snapshot;
  }

  function belowBaseline(snapshot: string) {
    // No baseline yet (still waiting on the profile) means nothing is real content
    // yet — never insert on a guess.
    return baseline !== null && snapshot !== baseline;
  }

  return { arm, flush, setPersisted, persistedSnapshot, setBaseline, belowBaseline };
}

/**
 * Persist outstanding changes when the tab is hidden or closed. Navigating within
 * the app is covered by the editor's unmount handler; this catches the exit the
 * unmount handler never sees.
 */
export function flushOnPageHide(autoSave: AutoSave): () => void {
  if (typeof window === "undefined") return () => {};
  const onHide = () => {
    if (document.visibilityState === "hidden") autoSave.flush();
  };
  const onPageHide = () => autoSave.flush();
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
  };
}
