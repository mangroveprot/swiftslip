/**
 * Client-side drafts — a new form that does not exist in the database yet.
 *
 * Pressing "New form" mints a draft id and navigates to it straight away, so the
 * editor opens with no network round-trip and no skeleton. Nothing is written
 * until the form actually holds something the user did not get for free from
 * their profile (see the baseline comparison in each editor); at that moment the
 * row is created for real and the draft id is swapped for the new one.
 *
 * Until then the draft lives only here, in localStorage, so a refresh or a closed
 * tab does not throw away what was typed. A draft that never got real content is
 * simply removed — there is no server-side row to clean up, which is the whole
 * point of the design.
 */

/** Marks an id as client-side only. Never sent to the server — it is not a UUID. */
const DRAFT_MARK = "draft_";

const STORAGE_PREFIX = "swiftslip-draft:";

/** Safety valve so an abandoned draft can never linger forever. */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether this id names a draft rather than a real row. */
export function isDraftId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(DRAFT_MARK);
}

/** Mint a fresh draft id. Random enough that two tabs never collide. */
export function newDraftId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${DRAFT_MARK}${rand}`;
}

function storageKey(feature: string, id: string): string {
  return `${STORAGE_PREFIX}${feature}:${id}`;
}

type StoredDraft<T> = { at: number; data: T };

function readRaw<T>(feature: string, id: string): StoredDraft<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(feature, id));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return null;
    const { at, data } = parsed as Partial<StoredDraft<T>>;
    if (typeof at !== "number" || data === undefined || data === null) return null;
    if (Date.now() - at >= DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(feature, id));
      return null;
    }
    return { at, data };
  } catch {
    // Storage can be unavailable (private mode / quota). Losing a draft backup
    // costs the user nothing that was ever saved, so fail quietly.
    return null;
  }
}

/**
 * The stored draft for this id, or null when there is none — which means the URL
 * was bookmarked or shared mid-draft and does not identify any real form.
 */
export function readDraft<T>(feature: string, id: string): T | null {
  return readRaw<T>(feature, id)?.data ?? null;
}

/** Overwrite the stored draft. Called on every settled change (cheap, local). */
export function writeDraft<T>(feature: string, id: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredDraft<T> = { at: Date.now(), data };
    window.localStorage.setItem(storageKey(feature, id), JSON.stringify(payload));
  } catch {
    // See readDraft — a missing backup is not worth interrupting the user over.
  }
}

/** Drop a draft's local copy. Called once it becomes a real row, or is abandoned. */
export function clearDraft(feature: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(feature, id));
  } catch {
    // Nothing to do.
  }
}

/**
 * Move a draft's contents onto its real id and drop the draft copy. Called right
 * after the row is created so the backup, the draft and the server agree.
 */
export function promoteDraft<T>(feature: string, draftId: string, realId: string, data: T): void {
  writeDraft(feature, realId, data);
  clearDraft(feature, draftId);
}

/**
 * Copy a signature backup from the draft key onto the real id, so a signature
 * drawn before the row existed is not lost the moment the id changes.
 */
export function promoteSignatureBackup(prefix: string, draftId: string, realId: string): void {
  if (typeof window === "undefined" || draftId === realId) return;
  try {
    const from = `${prefix}-sig:${draftId}`;
    const value = window.localStorage.getItem(from);
    if (!value) return;
    window.localStorage.setItem(`${prefix}-sig:${realId}`, value);
    window.localStorage.removeItem(from);
  } catch {
    // Same rationale as the draft backup — a missing signature is recoverable,
    // the profile copy still fills the field.
  }
}
