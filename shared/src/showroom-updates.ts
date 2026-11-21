/**
 * Showroom Updates, the "Summary of SR Status and Updates" board.
 *
 * This is its OWN app (grant `showroom-updates`), separate from the Inventory
 * showrooms board: it answers "is this showroom operational yet?", not "what
 * CCTV is installed?". The rows live in the same separate RGC Postgres database
 * as Inventory (`RGC_INVENTORY_DATABASE_URL`), because that is where the RGC
 * data lives; nothing here touches SwiftSlip's Supabase tables.
 *
 * The vocabularies live here once so the board, the filter chips, the drawer,
 * the PDF sheet and the Excel workbook cannot drift apart. The export colours
 * are the owner's own sheet palette, kept verbatim, so the downloaded file is a
 * pixel match of the source HTML.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ rows - */

/** Stored keys, not display labels (`OPEN`, `In- Progress`, …). */
export const showroomUpdateStatusSchema = z.enum(["open", "ready", "in_progress", "pending"]);
export type ShowroomUpdateStatus = z.infer<typeof showroomUpdateStatusSchema>;

export const showroomUpdateRemarksSchema = z.enum([
  "fully_operational",
  "ready_to_launch",
  "ongoing",
]);
export type ShowroomUpdateRemarks = z.infer<typeof showroomUpdateRemarksSchema>;

export const showroomUpdateVehicleSchema = z.enum([
  "with_sidecar",
  "with_and_without_sidecar",
  "requested",
  "none",
]);
export type ShowroomUpdateVehicle = z.infer<typeof showroomUpdateVehicleSchema>;

export const showroomUpdateResponsibleSchema = z.enum([
  "jimmy",
  "jonnah",
  "maynard",
  "jeanette",
  "marvin",
  "ivanray",
]);
export type ShowroomUpdateResponsible = z.infer<typeof showroomUpdateResponsibleSchema>;

/** One showroom row, exactly as stored (snake_case). */
export type ShowroomUpdate = {
  update_id: number;
  /** The sheet's own "No." column, preserved as typed (it skips 19). */
  sr_no: number;
  showroom_name: string;
  location: string;
  status: ShowroomUpdateStatus | null;
  /** Free text: `Complete`, `LGU permits`, `Lacking Contract of Lease`, … */
  requirements: string | null;
  /** Free text: `Operational`, `for Opening`, `For signing`, … */
  action_required: string | null;
  responsible_person: ShowroomUpdateResponsible | null;
  remarks: ShowroomUpdateRemarks | null;
  /** ISO `YYYY-MM-DD`, or null while the showroom is not open yet. */
  open_date: string | null;
  vehicle: ShowroomUpdateVehicle | null;
  /** Last edit's actor, shown in the drawer footer. */
  updated_by: string | null;
  updated_at: string | null;
};

/** One audit line in the drawer's history list. */
export type ShowroomUpdateEvent = {
  event_id: number;
  update_id: number;
  actor_id: string | null;
  actor_label: string;
  changes: ShowroomUpdateChange[];
  created_at: string;
};

/** One field that moved; labels are already human-readable. */
export type ShowroomUpdateChange = {
  field: string;
  from: string;
  to: string;
};

/* --------------------------------------------------------------- writing - */

/**
 * The drawer's save payload. Everything is nullable because a row may be
 * intentionally cleared (Jimenez has no status yet). The two identity cells are
 * editable too, so a misspelled place can be fixed from the board.
 */
export const showroomUpdateSaveInput = z.object({
  showroomName: z.string().trim().min(1, "A showroom name is required.").max(120),
  location: z.string().trim().min(1, "A location is required.").max(240),
  status: showroomUpdateStatusSchema.nullable(),
  requirements: z.string().trim().max(240).nullable(),
  actionRequired: z.string().trim().max(240).nullable(),
  responsiblePerson: showroomUpdateResponsibleSchema.nullable(),
  remarks: showroomUpdateRemarksSchema.nullable(),
  /** `YYYY-MM-DD`, or null for "not open yet". */
  openDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .nullable(),
  vehicle: showroomUpdateVehicleSchema.nullable(),
});
export type ShowroomUpdateSaveRequest = z.infer<typeof showroomUpdateSaveInput>;

/** "Add showroom" sends the same cells; the API assigns the next No. */
export const showroomUpdateCreateInput = showroomUpdateSaveInput;
export type ShowroomUpdateCreateRequest = ShowroomUpdateSaveRequest;

export const showroomUpdateIdParam = z.object({ id: z.coerce.number().int().positive() });

/** Bulk delete: the row ids ticked on the board (their history cascades). */
export const deleteShowroomUpdatesInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(5000),
});

/* ------------------------------------------------------------ vocabulary - */

/** The palette of the owner's sheet, verbatim. */
export type ShowroomUpdateMeta = {
  value: string;
  /** Text printed in the sheet (`OPEN`, `WITH SIDECAR`, …). */
  label: string;
  /** Text on the board, where there is room to be readable. */
  chipLabel: string;
  /** Cell fill in the PDF / Excel export. */
  fill: string;
  /** Text colour on that fill. */
  ink: string;
};

const STATUS_META: ReadonlyArray<ShowroomUpdateMeta & { value: ShowroomUpdateStatus }> = [
  { value: "open", label: "OPEN", chipLabel: "Open", fill: "#1e6a4d", ink: "#dff3ea" },
  { value: "ready", label: "READY", chipLabel: "Ready", fill: "#e4f0c8", ink: "#444444" },
  {
    value: "in_progress",
    label: "In- Progress",
    chipLabel: "In progress",
    fill: "#2c72b4",
    ink: "#d7e8f7",
  },
  { value: "pending", label: "PENDING", chipLabel: "Pending", fill: "#c0504d", ink: "#f5d6d4" },
];

/** Status order used by the sheet, the chips and the export. */
export const SHOWROOM_UPDATE_STATUSES = STATUS_META;

/** The person palette from the sheet (Jimmy white, Jonnah rose, …). */
const RESPONSIBLE_META: ReadonlyArray<ShowroomUpdateMeta & { value: ShowroomUpdateResponsible }> = [
  {
    value: "jimmy",
    label: "Jimmy the Great",
    chipLabel: "Jimmy the Great",
    fill: "#ffffff",
    ink: "#222222",
  },
  { value: "jonnah", label: "Jonnah", chipLabel: "Jonnah", fill: "#f4c7c4", ink: "#a8625d" },
  { value: "maynard", label: "Maynard", chipLabel: "Maynard", fill: "#1e6a4d", ink: "#9fcbb7" },
  { value: "jeanette", label: "Jeanette", chipLabel: "Jeanette", fill: "#f6cf8f", ink: "#3b3b3b" },
  { value: "marvin", label: "Marvin", chipLabel: "Marvin", fill: "#4a3a8e", ink: "#a99bdc" },
  { value: "ivanray", label: "Ivanray", chipLabel: "Ivanray", fill: "#121212", ink: "#8a8a8a" },
];

export const SHOWROOM_UPDATE_RESPONSIBLE = RESPONSIBLE_META;

const REMARKS_META: ReadonlyArray<ShowroomUpdateMeta & { value: ShowroomUpdateRemarks }> = [
  {
    value: "fully_operational",
    label: "Fully Operational",
    chipLabel: "Fully Operational",
    fill: "#f4b183",
    ink: "#6a3515",
  },
  {
    value: "ready_to_launch",
    label: "READY TO LAUNCH",
    chipLabel: "Ready to launch",
    fill: "#2e8b57",
    ink: "#5a1f12",
  },
  { value: "ongoing", label: "Ongoing", chipLabel: "Ongoing", fill: "#9dc3e6", ink: "#ffffff" },
];

export const SHOWROOM_UPDATE_REMARKS = REMARKS_META;

const VEHICLE_META: ReadonlyArray<ShowroomUpdateMeta & { value: ShowroomUpdateVehicle }> = [
  {
    value: "with_sidecar",
    label: "WITH SIDECAR",
    chipLabel: "With sidecar",
    fill: "#f4b2a4",
    ink: "#6a3515",
  },
  {
    value: "with_and_without_sidecar",
    label: "WITH SIDECAR & WITHOUT SIDECAR",
    chipLabel: "With & without sidecar",
    fill: "#1f7a76",
    ink: "#cdeeee",
  },
  {
    value: "requested",
    label: "REQUESTED",
    chipLabel: "Requested",
    fill: "#2f6fbf",
    ink: "#b7d2f0",
  },
  { value: "none", label: "NONE", chipLabel: "None", fill: "#d5c6e4", ink: "#5b4a72" },
];

export const SHOWROOM_UPDATE_VEHICLES = VEHICLE_META;

/** Suggestions for the drawer's two free-text fields; the seed's own values. */
export const SHOWROOM_UPDATE_REQUIREMENT_SUGGESTIONS = [
  "Complete",
  "LGU permits",
  "Lacking Contract of Lease",
  "Leased of contract ready",
] as const;

export const SHOWROOM_UPDATE_ACTION_SUGGESTIONS = [
  "Operational",
  "for Opening",
  "Occupancy permit that is currently approve by OBO",
  "for approval",
  "For signing",
] as const;

function findMeta<T extends string>(
  options: ReadonlyArray<ShowroomUpdateMeta & { value: T }>,
  value: T | null | undefined,
): ShowroomUpdateMeta | undefined {
  if (!value) return undefined;
  return options.find((option) => option.value === value);
}

export function showroomUpdateStatusMeta(
  value: ShowroomUpdateStatus | null | undefined,
): ShowroomUpdateMeta | undefined {
  return findMeta(STATUS_META, value);
}

export function showroomUpdateResponsibleMeta(
  value: ShowroomUpdateResponsible | null | undefined,
): ShowroomUpdateMeta | undefined {
  return findMeta(RESPONSIBLE_META, value);
}

export function showroomUpdateRemarksMeta(
  value: ShowroomUpdateRemarks | null | undefined,
): ShowroomUpdateMeta | undefined {
  return findMeta(REMARKS_META, value);
}

export function showroomUpdateVehicleMeta(
  value: ShowroomUpdateVehicle | null | undefined,
): ShowroomUpdateMeta | undefined {
  return findMeta(VEHICLE_META, value);
}

/* --------------------------------------------------------------- filters - */

export type ShowroomUpdateFilter = "all" | ShowroomUpdateStatus | "none";

export type ShowroomUpdateCounts = Record<ShowroomUpdateFilter, number>;

export function showroomUpdateCounts(rows: readonly ShowroomUpdate[]): ShowroomUpdateCounts {
  const counts: ShowroomUpdateCounts = {
    all: rows.length,
    open: 0,
    ready: 0,
    in_progress: 0,
    pending: 0,
    none: 0,
  };
  for (const row of rows) {
    if (row.status) counts[row.status] += 1;
    else counts.none += 1;
  }
  return counts;
}

/** "Active" is the owner's rule: a showroom is active only while it is OPEN. */
export function totalActiveSr(rows: readonly ShowroomUpdate[]): number {
  return rows.filter((row) => row.status === "open").length;
}

export function matchesShowroomUpdateFilter(
  row: ShowroomUpdate,
  filter: ShowroomUpdateFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "none") return row.status === null;
  return row.status === filter;
}

/**
 * Search over the two identity columns only. The owner's placeholder reads
 * "Find a showroom or place", so a location is part of the name.
 */
export function matchesShowroomUpdateSearch(row: ShowroomUpdate, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return (
    row.showroom_name.toLowerCase().includes(needle) || row.location.toLowerCase().includes(needle)
  );
}

/* ----------------------------------------------------------------- dates - */

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2-May-2026", the sheet's own format (no leading zero). */
export function showroomUpdateSheetDate(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${day}-${MONTHS_SHORT[month - 1]}-${year}`;
}

/** "2 May 2026", the board/drawer format. */
export function showroomUpdateBoardDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return `${day} ${MONTHS_LONG[month - 1]} ${year}`;
}

/** ISO for a `Date` (UTC), used when the drawer writes a picked day. */
export function isoDateOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
