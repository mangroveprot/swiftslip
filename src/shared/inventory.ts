/**
 * RGC Asset Inventory — this module's OWN model.
 *
 * These types and validators describe the separate RGC inventory database
 * (branches / assets / lookup tables) reached through `RGC_INVENTORY_DATABASE_URL`
 * (`src/config/env.server` → `getServerConfig().rgcInventory`).
 *
 * NOTHING here is shared with SwiftSlip's Supabase-backed `@/shared/schemas`:
 * inventory data lives in the RGC database and must never mix with SwiftSlip tables.
 *
 * Row types mirror the Postgres tables (snake_case). Request DTOs are camelCase
 * ports of the original C# view models (AssetSaveRequest, InventoryReportDocument, ...).
 */
import { z } from "zod";

/* ------------------------------------------------------------------ rows - */

export type InventoryBranch = {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  status_indicator: boolean | null;
  /** `timestamp without time zone` serialised as text — UTC wall-clock. */
  created_at: string | null;
};

export type InventoryLocation = {
  location_id: number;
  branch_id: number | null;
  location_name: string;
};

export type InventoryDepartment = {
  department_id: number;
  department_name: string;
};

export type InventoryStatusOption = {
  status_id: number;
  status_name: string;
  color_tag: string | null;
};

export type InventoryConditionOption = {
  condition_id: number;
  condition_name: string;
};

export type InventoryAssetTypeOption = {
  type_id: number;
  type_name: string;
  /** "desktop" | "peripheral" | ... (lower-case in the DB). */
  category: string;
};

export type InventoryDesktopDetail = {
  asset_id: number;
  monitor_brand: string | null;
  monitor_serial: string | null;
  keyboard_brand: string | null;
  keyboard_serial: string | null;
  mouse_serial: string | null;
};

/**
 * `assets` row plus the joins the original app always loaded
 * (type, branch, location, department, status, condition, desktop detail).
 */
export type InventoryAsset = {
  asset_id: number;
  item_id: string | null;
  type_id: number | null;
  branch_id: number | null;
  location_id: number | null;
  cubicle_seat: string | null;
  assigned_to: string | null;
  department_id: number | null;
  status_id: number | null;
  condition_id: number | null;
  floor_label: string | null;
  installed_flag: boolean | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  type: InventoryAssetTypeOption | null;
  branch: { branch_id: number; branch_name: string } | null;
  location: InventoryLocation | null;
  department: InventoryDepartment | null;
  status: InventoryStatusOption | null;
  condition: InventoryConditionOption | null;
  desktop_detail: InventoryDesktopDetail | null;
};

/** Everything the inventory UI loads up front (the original `LoadAllAsync` + `LoadAssetsAsync`). */
export type InventoryData = {
  branches: InventoryBranch[];
  departments: InventoryDepartment[];
  statusOptions: InventoryStatusOption[];
  conditionOptions: InventoryConditionOption[];
  assetTypes: InventoryAssetTypeOption[];
  assets: InventoryAsset[];
};

/** Settings page row (C# `ManagedOption`). */
export type ManagedOption = {
  id: number;
  name: string;
  usage_count: number;
};

export type ManagedOptions = {
  branches: ManagedOption[];
  departments: ManagedOption[];
  statuses: ManagedOption[];
  conditions: ManagedOption[];
  assetTypes: ManagedOption[];
};

/** What the drawer's "create a missing option" flow returns (C# `Branch`/`AssetTypeOption`/...). */
export type CreatedOption = {
  id: number;
  name: string;
  category?: string;
};

/**
 * Settings mutations don't throw for *expected* failures (duplicate name, option
 * still in use) — they return one of these so the page can toast at the right level,
 * mirroring the original `ShowToast(..., Warning)` vs `Error` distinction.
 */
export type OptionMutationResult =
  { ok: true } | { ok: false; level: "warning" | "error"; message: string };

/* ------------------------------------------------------------------ DTOs - */

export const optionKindSchema = z.enum([
  "branch",
  "department",
  "status",
  "condition",
  "assetType",
]);
export type OptionKind = z.infer<typeof optionKindSchema>;

/** Port of C# `AssetSaveRequest` — the flat shape the drawer emits on save. */
export const assetSaveInput = z.object({
  /** `null` means "insert a new asset"; otherwise the `asset_id` being edited. */
  assetId: z.number().int().positive().nullable(),
  itemId: z.string().max(50).nullable(),
  typeId: z.number().int().positive(),
  branchId: z.number().int().positive(),
  locationId: z.number().int().positive().nullable(),
  /** e.g. "1st", "2nd" — from `assets.floor_label`. */
  floorLabel: z.string().max(20).nullable(),
  cubicleSeat: z.string().max(50).nullable(),
  assignedTo: z.string().max(150).nullable(),
  departmentId: z.number().int().positive().nullable(),
  statusId: z.number().int().positive(),
  conditionId: z.number().int().positive().nullable(),
  notes: z.string().max(4000).nullable(),
  /** Whether the selected asset type's category is "desktop" (drives asset_desktop_details). */
  isDesktop: z.boolean(),
  monitorBrand: z.string().max(50).nullable(),
  monitorSerial: z.string().max(50).nullable(),
  keyboardBrand: z.string().max(50).nullable(),
  keyboardSerial: z.string().max(50).nullable(),
  mouseSerial: z.string().max(50).nullable(),
});
export type AssetSaveRequest = z.infer<typeof assetSaveInput>;

export const deleteAssetsInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(5000),
});

export const createOptionInput = z.object({
  kind: optionKindSchema,
  name: z.string().min(1).max(100),
  /** Only meaningful for `assetType` ("desktop" | "peripheral" | ...). */
  category: z.string().max(20).optional(),
});
export type CreateOptionInput = z.infer<typeof createOptionInput>;

export const renameOptionInput = z.object({
  kind: optionKindSchema,
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
});

export const deleteOptionInput = z.object({
  kind: optionKindSchema,
  id: z.number().int().positive(),
});

export const reportBranchInput = z.object({
  branchId: z.number().int().positive(),
});

/** Who downloaded a report — the Excel file itself is built client-side. */
export const reportDownloadInput = z.object({
  branchName: z.string().trim().max(120),
});

/* ---------------------------------------------------------------- report - */

/** One asset row in the inventory report (matches the Excel template columns). */
export type ReportAssetRow = {
  itemId: string;
  monitor: string;
  keyboardMouse: string;
  assetType: string;
  cubicle: string;
  assignedTo: string;
  department: string;
  location: string;
  status: string;
  condition: string;
  floor: string;
  installed: string;
  notes: string;
};

/** One floor sheet: title, rows, and type totals (e.g. "10 DESKTOPS"). */
export type ReportFloorSheet = {
  floorLabel: string;
  sheetName: string;
  floorTitle: string;
  rows: ReportAssetRow[];
  totals: string[];
};

/** Full branch report — preview and Excel export build from the same document. */
export type InventoryReportDocument = {
  branchName: string;
  sheets: ReportFloorSheet[];
};
