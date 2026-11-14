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
};

/* ------------------------------------------------------------- requests - */

export const showroomSaveInput = z.object({
  showroomName: z.string().trim().min(1).max(120),
  cctvInstalled: showroomCctvInstalledSchema,
  cctvConnection: showroomCctvConnectionSchema,
  cctvNote: z.string().trim().max(60).nullable(),
  internet: showroomInternetSchema,
  notes: z.string().trim().max(4000).nullable(),
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
