/**
 * Showrooms, the CCTV / internet status board that sits beside Assets in the
 * RGC Asset Inventory.
 *
 * Lives in the SAME separate RGC Postgres database as `assets` (reached through
 * `RGC_INVENTORY_DATABASE_URL`), never in SwiftSlip's Supabase tables. Row
 * types mirror the `showrooms` table (snake_case); the save DTO is camelCase,
 * like `AssetSaveRequest`.
 *
 * The status vocabularies are defined here once so the drawer, the table, the
 * mobile cards, the tab counts and the Excel export cannot drift apart.
 */
import { z } from "zod";

import { MAX_THUMB_BASE64, MAX_UPLOAD_BASE64 } from "./schemas";

/* ------------------------------------------------------------------ rows - */

/** Stored keys, not display labels (`Active`, `Needs request`, …). */
export const showroomCctvInstalledSchema = z.enum(["active", "not_installed", "not_recorded"]);
export const showroomCctvConnectionSchema = z.enum(["online", "offline", "not_recorded"]);
export const showroomInternetSchema = z.enum([
  "active",
  "installed",
  "ongoing",
  "needs_request",
  "not_recorded",
]);

export type ShowroomCctvInstalled = z.infer<typeof showroomCctvInstalledSchema>;
export type ShowroomCctvConnection = z.infer<typeof showroomCctvConnectionSchema>;
export type ShowroomInternet = z.infer<typeof showroomInternetSchema>;

export type Showroom = {
  showroom_id: number;
  showroom_name: string;
  cctv_installed: ShowroomCctvInstalled;
  cctv_connection: ShowroomCctvConnection;
  /** Free note shown after the connection state, e.g. "Needs connecting". */
  cctv_note: string | null;
  internet: ShowroomInternet;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  /**
   * Signed thumbnail URL of the **Showroom** slot photo, for the board row.
   * Derived at read time (the database stores an object ref, never a URL);
   * absent on rows that did not come through the list endpoint.
   */
  photo_thumb?: string | null;
};

/* ------------------------------------------------------- photo slots ---- */

/**
 * The three pictures a showroom carries. They are separate slots rather than a
 * gallery because each one answers a different question: what the branch looks
 * like, what CCTV was installed, and the signed acknowledgement form.
 */
export const showroomPhotoSlotSchema = z.enum(["showroom", "cctv", "acknowledge_form"]);

export type ShowroomPhotoSlot = z.infer<typeof showroomPhotoSlotSchema>;

/** Slot order and labels, shared by the drawer, the API and the docs. */
export const SHOWROOM_PHOTO_SLOTS: ReadonlyArray<{
  slot: ShowroomPhotoSlot;
  label: string;
}> = [
  { slot: "showroom", label: "Showroom" },
  { slot: "cctv", label: "CCTV" },
  { slot: "acknowledge_form", label: "Acknowledge Form" },
];

export const SHOWROOM_PHOTO_LABELS: Record<ShowroomPhotoSlot, string> = {
  showroom: "Showroom",
  cctv: "CCTV",
  acknowledge_form: "Acknowledge Form",
};

/** One slot's signed links; `url` is the full picture, `thumbUrl` the preview. */
export type ShowroomPhotoUrls = {
  url: string;
  thumbUrl: string | null;
  /**
   * The same picture signed with `Content-Disposition: attachment`, so the
   * Download link saves it under the original name instead of opening a tab.
   * Null when the link could not be minted; the drawer then falls back to
   * `url`.
   */
  downloadUrl: string | null;
  /** Original filename and byte size, shown under the preview. */
  filename: string | null;
  byteSize: number | null;
};

/** All three slots for one showroom; a missing slot is null. */
export type ShowroomPhotos = Record<ShowroomPhotoSlot, ShowroomPhotoUrls | null>;

/* ------------------------------------------------------------- requests - */

/**
 * A staged upload, before the showroom exists. The server stores it under
 * `InventoryMedia/staged/<account>/` and the save request points the slot at
 * those refs; the object is never moved.
 */
export const showroomPhotoUploadInput = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(150),
  base64: z.string().min(1).max(MAX_UPLOAD_BASE64),
  /** Optional WebP preview, uploaded beside the picture as `<uuid>.thumb.webp`. */
  thumbBase64: z.string().min(1).max(MAX_THUMB_BASE64).optional(),
});

export type ShowroomPhotoUploadRequest = z.infer<typeof showroomPhotoUploadInput>;

/** What `POST /inventory/showrooms/photos/staged` answers. */
export type ShowroomPhotoUploadResult = {
  photoRef: string;
  thumbRef: string | null;
  /** Display-only facts the drawer repeats under the preview. */
  filename: string;
  byteSize: number;
};

/** `DELETE /inventory/showrooms/photos/staged?ref=…` (cancelled add). */
export const stagedShowroomPhotoQuery = z.object({
  ref: z.string().min(1).max(600),
});

/** A staged ref plus its optional preview, as carried by the save request. */
const showroomPhotoRefInput = z.object({
  ref: z.string().trim().min(1).max(500),
  thumbRef: z.string().trim().min(1).max(500).nullable().optional(),
  /** Shown under the preview; never used to build a storage key. */
  filename: z.string().trim().max(160).nullable().optional(),
  byteSize: z.number().int().min(0).max(104_857_600).nullable().optional(),
});

/**
 * Only the slots that changed travel with a save: `undefined` leaves a photo
 * alone, `null` removes it, and `{ ref, thumbRef }` sets a staged upload.
 */
const showroomPhotoChangesInput = z.object({
  showroom: showroomPhotoRefInput.nullable().optional(),
  cctv: showroomPhotoRefInput.nullable().optional(),
  acknowledge_form: showroomPhotoRefInput.nullable().optional(),
});

export type ShowroomPhotoChangeInput = z.infer<typeof showroomPhotoRefInput>;

/** `/inventory/showrooms/:id/photos/:slot`. */
export const showroomPhotoSlotParam = z.object({
  id: z.coerce.number().int().positive(),
  slot: showroomPhotoSlotSchema,
});

export const showroomSaveInput = z.object({
  showroomName: z.string().trim().min(1).max(120),
  cctvInstalled: showroomCctvInstalledSchema,
  cctvConnection: showroomCctvConnectionSchema,
  cctvNote: z.string().trim().max(60).nullable(),
  internet: showroomInternetSchema,
  notes: z.string().trim().max(4000).nullable(),
  /**
   * Photo changes only. Omitted entirely when nothing visual moved, so an
   * ordinary edit never touches the three picture rows.
   */
  photos: showroomPhotoChangesInput.optional(),
});

export type ShowroomSaveRequest = z.infer<typeof showroomSaveInput>;

export const showroomIdParam = z.object({ id: z.coerce.number().int().positive() });

/** One number the owner maintains: every CCTV unit they own, installed or spare. */
export const showroomStockInput = z.object({
  cctvTotalUnits: z.number().int().min(0).max(100_000),
});

export type ShowroomStockRequest = z.infer<typeof showroomStockInput>;

export type ShowroomStock = { cctvTotalUnits: number };

/* --------------------------------------------------------------- labels - */

/** Green / amber / red / no-dot, the legend's three groups plus "unknown". */
export type ShowroomTone = "good" | "progress" | "bad" | "none";

type Option<T extends string> = { value: T; label: string; tone: ShowroomTone };

export const SHOWROOM_CCTV_INSTALLED_OPTIONS: ReadonlyArray<Option<ShowroomCctvInstalled>> = [
  { value: "active", label: "Active", tone: "good" },
  { value: "not_installed", label: "Not installed", tone: "bad" },
  { value: "not_recorded", label: "Not recorded", tone: "none" },
];

export const SHOWROOM_CCTV_CONNECTION_OPTIONS: ReadonlyArray<Option<ShowroomCctvConnection>> = [
  { value: "online", label: "Online", tone: "good" },
  { value: "offline", label: "Offline", tone: "bad" },
  { value: "not_recorded", label: "Not recorded", tone: "none" },
];

export const SHOWROOM_INTERNET_OPTIONS: ReadonlyArray<Option<ShowroomInternet>> = [
  { value: "active", label: "Active", tone: "good" },
  { value: "installed", label: "Installed", tone: "good" },
  { value: "ongoing", label: "Ongoing", tone: "progress" },
  { value: "needs_request", label: "Needs request", tone: "bad" },
  { value: "not_recorded", label: "Not recorded", tone: "none" },
];

function findOption<T extends string>(
  options: ReadonlyArray<Option<T>>,
  value: T,
): Option<T> | undefined {
  return options.find((option) => option.value === value);
}

export function cctvInstalledLabel(value: ShowroomCctvInstalled): string {
  return findOption(SHOWROOM_CCTV_INSTALLED_OPTIONS, value)?.label ?? "Not recorded";
}

export function cctvConnectionLabel(value: ShowroomCctvConnection): string {
  return findOption(SHOWROOM_CCTV_CONNECTION_OPTIONS, value)?.label ?? "Not recorded";
}

export function internetLabel(value: ShowroomInternet): string {
  return findOption(SHOWROOM_INTERNET_OPTIONS, value)?.label ?? "Not recorded";
}

export function cctvInstalledTone(value: ShowroomCctvInstalled): ShowroomTone {
  return findOption(SHOWROOM_CCTV_INSTALLED_OPTIONS, value)?.tone ?? "none";
}

export function cctvConnectionTone(value: ShowroomCctvConnection): ShowroomTone {
  return findOption(SHOWROOM_CCTV_CONNECTION_OPTIONS, value)?.tone ?? "none";
}

export function internetTone(value: ShowroomInternet): ShowroomTone {
  return findOption(SHOWROOM_INTERNET_OPTIONS, value)?.tone ?? "none";
}

/* ------------------------------------------------------------- grouping - */

/**
 * The board's one filter. The four tabs cover `all` / `needs_action` /
 * `in_progress` / `online`; the header's installed and not-available numbers
 * set the last two, so a click on the stat narrows the list immediately.
 */
export type ShowroomFilter =
  "all" | "needs_action" | "in_progress" | "online" | "installed" | "not_available";

type ShowroomStatuses = Pick<Showroom, "cctv_installed" | "cctv_connection" | "internet">;

/** CCTV installed and connected. */
export function showroomOnline(row: ShowroomStatuses): boolean {
  return row.cctv_installed === "active" && row.cctv_connection === "online";
}

/** Any red field: CCTV not installed/offline, or internet needs a request. */
export function showroomNeedsAction(row: ShowroomStatuses): boolean {
  return (
    cctvInstalledTone(row.cctv_installed) === "bad" ||
    cctvConnectionTone(row.cctv_connection) === "bad" ||
    internetTone(row.internet) === "bad"
  );
}

/** Some amber field and nothing red: work is underway. */
export function showroomInProgress(row: ShowroomStatuses): boolean {
  if (showroomNeedsAction(row)) return false;
  return (
    cctvInstalledTone(row.cctv_installed) === "progress" ||
    cctvConnectionTone(row.cctv_connection) === "progress" ||
    internetTone(row.internet) === "progress"
  );
}

export function matchesShowroomFilter(row: ShowroomStatuses, filter: ShowroomFilter): boolean {
  if (filter === "needs_action") return showroomNeedsAction(row);
  if (filter === "in_progress") return showroomInProgress(row);
  if (filter === "online") return showroomOnline(row);
  if (filter === "installed") return row.cctv_installed === "active";
  if (filter === "not_available") {
    return row.cctv_installed === "active" && row.cctv_connection !== "online";
  }
  return true;
}

/* -------------------------------------------------------------- summary - */

/** The header card's numbers: stock plus the CCTV connection breakdown. */
export type ShowroomCctvSummary = {
  /** The owner's editable count of every CCTV unit they own. */
  totalUnits: number;
  /** Showrooms whose CCTV is marked installed (`active`). */
  installed: number;
  /** Units not installed yet: `totalUnits - installed`, never below zero. */
  available: number;
  /** Installed but marked offline. */
  offline: number;
  /** Installed but connection not recorded. */
  notRecorded: number;
  /** Installed but not online: `offline + notRecorded`. */
  notAvailable: number;
  /** Installed share of `totalUnits`, 0–100, rounded. */
  installedPercent: number;
};

export function showroomCctvSummary(
  rows: readonly Showroom[],
  totalUnits: number,
): ShowroomCctvSummary {
  let installed = 0;
  let online = 0;
  let offline = 0;
  let notRecorded = 0;

  for (const row of rows) {
    // "Not installed" and "Not recorded" installs are outside the ratio: the
    // card answers "of the units we own, how many are out in showrooms".
    if (row.cctv_installed !== "active") continue;
    installed += 1;
    if (row.cctv_connection === "online") online += 1;
    else if (row.cctv_connection === "offline") offline += 1;
    else notRecorded += 1;
  }

  return {
    totalUnits,
    installed,
    available: Math.max(totalUnits - installed, 0),
    offline,
    notRecorded,
    notAvailable: installed - online,
    installedPercent:
      totalUnits === 0 ? 0 : Math.min(100, Math.round((installed / totalUnits) * 100)),
  };
}
