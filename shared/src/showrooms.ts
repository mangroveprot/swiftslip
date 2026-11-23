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
import type { ShowroomUpdateStatus } from "./showroom-updates";
import { showroomUpdateStatusMeta } from "./showroom-updates";

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
   * The "Summary of SR Status and Updates" row this showroom follows. Status
   * and Action required are READ from that row; the inventory only edits the
   * CCTV / internet facts. Null when the showroom is not linked yet.
   */
  linked_update_id: number | null;
  /**
   * Live copy of the linked Summary row, filled at read time (never stored).
   * Null when there is no link, or when the Summary row was deleted.
   */
  link: ShowroomLink | null;
  /**
   * Signed thumbnail URL of the **Showroom** slot photo, for the board row.
   * Derived at read time (the database stores an object ref, never a URL);
   * absent on rows that did not come through the list endpoint.
   */
  photo_thumb?: string | null;
};

/**
 * The linked Summary row, as the inventory board reads it. Deliberately only
 * the columns the board prints: the inventory never writes any of them.
 */
export type ShowroomLink = {
  update_id: number;
  showroom_name: string;
  location: string;
  status: ShowroomUpdateStatus | null;
  action_required: string | null;
  /** The Summary row's saved Google Maps pin, or null when it has none. */
  map_url: string | null;
};

/**
 * One row of the drawer's "Linked SwiftSlip showroom" picker. `linked_to` names
 * the inventory showroom already following this row (null when free), so the
 * picker can grey out a row that belongs to someone else. `linked_to_id` is the
 * same fact as an id, so the current showroom can recognise its own link
 * without comparing names.
 */
export type ShowroomLinkOption = ShowroomLink & {
  linked_to: string | null;
  linked_to_id: number | null;
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
   * The Summary row this showroom follows, or null to unlink. Always stated:
   * the drawer knows both states, so an omitted value would only hide intent.
   */
  linkedUpdateId: z.number().int().positive().nullable(),
  /**
   * Photo changes only. Omitted entirely when nothing visual moved, so an
   * ordinary edit never touches the three picture rows.
   */
  photos: showroomPhotoChangesInput.optional(),
});

export type ShowroomSaveRequest = z.infer<typeof showroomSaveInput>;

export const showroomIdParam = z.object({ id: z.coerce.number().int().positive() });

/* --------------------------------------------------------------- labels - */

/** Green / blue / amber / red / no-dot, the board's tone scale. */
export type ShowroomTone = "good" | "info" | "progress" | "bad" | "none";

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

/* ----------------------------------------------------------------- link - */

/**
 * Words that say where a row sits in the sheet rather than which place it is.
 * "Mun. of Polanco" and "Polanco SR" both fold to "polanco", which is how the
 * drawer suggests a match without the owner typing anything.
 */
const LINK_NAME_NOISE = new Set([
  "mun",
  "municipality",
  "city",
  "of",
  "sr",
  "showroom",
  "brgy",
  "barangay",
  "additional",
  "warehouse",
]);

/**
 * The identifying words of a showroom name: accents folded, lowercase, and the
 * sheet's own filler ("Mun.", "City", "SR", "Brgy.") removed.
 */
export function showroomNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word !== "" && !LINK_NAME_NOISE.has(word))
    .join(" ");
}

/**
 * The one suggestion the drawer offers for an unlinked showroom: a free Summary
 * row whose identifying words match exactly. Rows already linked to another
 * showroom are never suggested.
 */
export function suggestShowroomLink(
  showroomName: string,
  options: readonly ShowroomLinkOption[],
): ShowroomLinkOption | null {
  const key = showroomNameKey(showroomName);
  if (key === "") return null;
  return (
    options.find(
      (option) => option.linked_to == null && showroomNameKey(option.showroom_name) === key,
    ) ?? null
  );
}

/** The board's dot colour for a Summary status, on the same tone scale. */
export function showroomUpdateStatusTone(status: ShowroomUpdateStatus | null): ShowroomTone {
  // Open is green, Ready is the Summary board's blue; In progress and Pending
  // keep the warmer tones the inventory already uses.
  if (status === "open") return "good";
  if (status === "ready") return "info";
  if (status === "in_progress") return "progress";
  if (status === "pending") return "bad";
  return "none";
}

/**
 * The Status cell, in the board's own words: no linked row, or a linked row
 * without a status, reads "Not recorded" — the same placeholder the CCTV and
 * Internet columns use — while a linked row prints the Summary's chip label.
 */
export function showroomLinkStatusLabel(link: ShowroomLink | null): string {
  if (!link) return "Not recorded";
  return showroomUpdateStatusMeta(link.status)?.chipLabel ?? "Not recorded";
}

/** The Action required cell: the Summary's free text, or "Not recorded" when blank. */
export function showroomLinkActionLabel(link: ShowroomLink | null): string {
  if (!link) return "Not recorded";
  return link.action_required?.trim() ? link.action_required : "Not recorded";
}

/**
 * The two-letter monogram shown in the board's photo tile when a showroom has
 * no picture, exactly like the supplied mock ("Calamba SR" → "Ca", "Polanco SR"
 * → "Po"). It is the first two characters of the name, not word initials.
 */
export function showroomInitials(name: string): string {
  const letters = Array.from(name.trim()).slice(0, 2).join("");
  if (letters === "") return "";
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
}
