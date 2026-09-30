/**
 * Inventory report document builder — a faithful port of the original
 * `InventoryReportService.BuildDocumentAsync` (C# / EF Core).
 *
 * The document is data only (floor sheets + rows + totals); the Excel template
 * is filled client-side by `src/features/inventory/lib/report-export.ts`
 * (exceljs) so preview and download always agree. Semantics kept from the C#:
 *   • assets loaded for one branch, ordered floor → cubicle → item id
 *   • grouped by trimmed floor (case-insensitive), ordered by FloorSortKey
 *   • per-sheet type totals ("10 DESKTOPS"), unique sanitized sheet names
 */
import type { InventoryReportDocument, ReportAssetRow, ReportFloorSheet } from "@/shared/inventory";

import { getRgcSql } from "./client.server";

type ReportAssetSource = {
  item_id: string | null;
  floor_label: string | null;
  cubicle_seat: string | null;
  assigned_to: string | null;
  installed_flag: boolean | null;
  notes: string | null;
  type_name: string | null;
  department_name: string | null;
  status_name: string | null;
  condition_name: string | null;
  monitor_brand: string | null;
  monitor_serial: string | null;
  keyboard_brand: string | null;
  keyboard_serial: string | null;
  mouse_serial: string | null;
};

export async function buildReportDocument(branchId: number): Promise<InventoryReportDocument> {
  const sql = getRgcSql();

  const branches = await sql<{ branch_name: string }[]>`
    select branch_name from branches where branch_id = ${branchId}`;
  const branchName = branches[0]?.branch_name;
  if (branchName == null) throw new Error("Branch not found.");

  const rows = await sql<ReportAssetSource[]>`
    select
      a.item_id, a.floor_label, a.cubicle_seat, a.assigned_to, a.installed_flag, a.notes,
      t.type_name,
      d.department_name,
      s.status_name,
      c.condition_name,
      dd.monitor_brand, dd.monitor_serial, dd.keyboard_brand, dd.keyboard_serial, dd.mouse_serial
    from assets a
    left join asset_type_options t on t.type_id = a.type_id
    left join departments d on d.department_id = a.department_id
    left join status_options s on s.status_id = a.status_id
    left join condition_options c on c.condition_id = a.condition_id
    left join asset_desktop_details dd on dd.asset_id = a.asset_id
    where a.branch_id = ${branchId}`;

  // EF: OrderBy(FloorLabel).ThenBy(CubicleSeat).ThenBy(ItemId) — done in JS so the
  // comparison stays culture-primary instead of Postgres collation. NULL cubicles
  // sort LAST, the way Postgres evaluates `ASC` (golden.xlsx proves it: the eight
  // null-cubicle assets close each floor sheet).
  const sorted = [...rows].sort(
    (a, b) =>
      compareText(a.floor_label, b.floor_label) ||
      compareText(a.cubicle_seat, b.cubicle_seat) ||
      compareText(a.item_id, b.item_id),
  );

  // Group by trimmed floor, OrdinalIgnoreCase.
  const groups: { key: string; items: ReportAssetSource[] }[] = [];
  for (const asset of sorted) {
    const key = isBlank(asset.floor_label) ? "" : (asset.floor_label ?? "").trim();
    const existing = groups.find((g) => sameText(g.key, key));
    if (existing) existing.items.push(asset);
    else groups.push({ key, items: [asset] });
  }

  // Order groups by FloorSortKey, then the key case-insensitively.
  groups.sort((a, b) => floorSortKey(a.key) - floorSortKey(b.key) || compareText(a.key, b.key));

  const document: InventoryReportDocument = { branchName, sheets: [] };
  const usedSheetNames = new Set<string>();

  if (groups.length === 0) {
    document.sheets.push(makeSheet("", [], branchName, usedSheetNames));
    return document;
  }

  for (const group of groups)
    document.sheets.push(makeSheet(group.key, group.items, branchName, usedSheetNames));

  return document;
}

/* ----------------------------------------------------------------- rows - */

function makeSheet(
  floorLabel: string,
  assets: ReportAssetSource[],
  branchName: string,
  usedSheetNames: Set<string>,
): ReportFloorSheet {
  const display = floorLabel === "" ? "Unassigned" : formatFloorDisplay(floorLabel);
  const sheetName = uniqueSheetName(display, usedSheetNames);
  const rows = assets.map((a) => toRow(a, branchName));

  // Totals grouped by asset type (OrdinalIgnoreCase), by count desc then name.
  const totalsByKey = new Map<string, { key: string; count: number }>();
  for (const row of rows) {
    const key = isBlank(row.assetType) ? "UNKNOWN" : row.assetType.trim();
    const existing = totalsByKey.get(key.toLowerCase());
    if (existing) existing.count += 1;
    else totalsByKey.set(key.toLowerCase(), { key, count: 1 });
  }
  const totals = [...totalsByKey.values()]
    .sort((a, b) => b.count - a.count || compareText(a.key, b.key))
    .map((g) => `${g.count} ${g.key.trim().toUpperCase()}`);

  return {
    floorLabel,
    sheetName,
    floorTitle: display.toUpperCase(),
    rows,
    totals,
  };
}

function toRow(asset: ReportAssetSource, branchName: string): ReportAssetRow {
  return {
    itemId: trim(asset.item_id),
    monitor: formatMonitor(asset),
    keyboardMouse: formatKeyboardMouse(asset),
    assetType: trim(asset.type_name),
    cubicle: trim(asset.cubicle_seat),
    assignedTo: isBlank(asset.assigned_to) ? "no Assign" : (asset.assigned_to ?? "").trim(),
    department: trim(asset.department_name),
    // Matches export_excel_rows: Location column carries branch name.
    location: branchName,
    status: trim(asset.status_name),
    condition: trim(asset.condition_name),
    floor: trim(asset.floor_label),
    installed: (asset.installed_flag ?? true) ? "Yes" : "No",
    notes: trim(asset.notes),
  };
}

function formatMonitor(asset: ReportAssetSource): string {
  const brand = trim(asset.monitor_brand);
  const serial = trim(asset.monitor_serial);
  if (!brand && !serial) return "";
  if (!brand) return serial;
  if (!serial) return brand;
  return `${brand} S/N: ${serial}`;
}

function formatKeyboardMouse(asset: ReportAssetSource): string {
  const brand = trim(asset.keyboard_brand);
  const keySn = trim(asset.keyboard_serial);
  const mouseSn = trim(asset.mouse_serial);
  const serials = [keySn, mouseSn].filter(Boolean).join(" / ");
  if (!brand && !serials) return "";
  if (!brand) return serials;
  if (!serials) return brand;
  return `${brand} S/N: ${serials}`;
}

/* --------------------------------------------------------------- helpers - */

/** "1st" → "1st Floor"; values already ending in "Floor" stay unchanged. */
export function formatFloorDisplay(floorLabel: string | null): string {
  if (isBlank(floorLabel)) return "";
  const value = (floorLabel ?? "").trim();
  return /floor$/i.test(value) ? value : `${value} Floor`;
}

/** C# `FloorSortKey`: leading digits → that number, anything else → 1000, empty → int.MaxValue. */
function floorSortKey(floor: string): number {
  if (floor === "") return Number.MAX_SAFE_INTEGER;
  const digits = /^\d+/.exec(floor)?.[0] ?? "";
  if (digits === "") return 1000;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed <= 2147483647 ? parsed : 1000;
}

/** C# `UniqueSheetName` + `SanitizeSheetName` (case-insensitive used set, 31-char cap). */
function uniqueSheetName(desired: string, used: Set<string>): string {
  const base = sanitizeSheetName(desired);
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    const max = 31 - suffix.length;
    name = (base.length <= max ? base : base.slice(0, max)) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function sanitizeSheetName(name: string): string {
  let value = name.trim();
  if (!value) value = "Floor";
  value = value.replace(/[\\/?*[\]:]/g, "-");
  return value.length <= 31 ? value : value.slice(0, 31);
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

function trim(value: string | null | undefined): string {
  return value == null ? "" : value.trim();
}

function sameText(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * OrdinalIgnoreCase-style equality/ordering with Postgres `ASC` null
 * placement: `NULLS LAST`, which is how EF's `OrderBy(...).ThenBy(...)`
 * reaches the database (verified against `golden.xlsx`).
 */
function compareText(a: string | null | undefined, b: string | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
