/**
 * Asset queries for the RGC inventory database — the online replacement for the
 * original app's EF Core calls (`LoadAllAsync`, `LoadAssetsAsync`, `HandleSave`,
 * `ConfirmDelete`). Offline sync (SQLite/outbox) is intentionally not ported:
 * every operation talks to the RGC database directly.
 */
import type {
  AssetSaveRequest,
  InventoryAsset,
  InventoryBranch,
  InventoryData,
  InventoryDepartment,
  InventoryConditionOption,
  InventoryDesktopDetail,
  InventoryLocation,
  InventoryStatusOption,
  InventoryAssetTypeOption,
} from "@/shared/inventory";

import { errorMessage, getRgcSql, utcNow } from "./client.server";

type AssetJoinRow = {
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
  t_id: number | null;
  t_name: string | null;
  t_category: string | null;
  b_id: number | null;
  b_name: string | null;
  l_id: number | null;
  l_name: string | null;
  d_id: number | null;
  d_name: string | null;
  s_id: number | null;
  s_name: string | null;
  s_color_tag: string | null;
  c_id: number | null;
  c_name: string | null;
  dd_asset_id: number | null;
  monitor_brand: string | null;
  monitor_serial: string | null;
  keyboard_brand: string | null;
  keyboard_serial: string | null;
  mouse_serial: string | null;
};

/** Assets + the option lists the inventory shell needs (sidebar branches, filters, drawer choices). */
export async function listInventory(): Promise<InventoryData> {
  const sql = getRgcSql();

  const [branches, departments, statusOptions, conditionOptions, assetTypes, rows] =
    await Promise.all([
      sql<InventoryBranch[]>`
        select branch_id, branch_code, branch_name, status_indicator,
               created_at::text as created_at
        from branches
        order by branch_id`,
      sql<InventoryDepartment[]>`
        select department_id, department_name
        from departments
        order by department_id`,
      sql<InventoryStatusOption[]>`
        select status_id, status_name, color_tag
        from status_options
        order by status_id`,
      sql<InventoryConditionOption[]>`
        select condition_id, condition_name
        from condition_options
        order by condition_id`,
      sql<InventoryAssetTypeOption[]>`
        select type_id, type_name, category
        from asset_type_options
        order by type_id`,
      sql<AssetJoinRow[]>`
        select
          a.asset_id, a.item_id, a.type_id, a.branch_id, a.location_id, a.cubicle_seat,
          a.assigned_to, a.department_id, a.status_id, a.condition_id, a.floor_label,
          a.installed_flag, a.notes,
          a.created_at::text as created_at, a.updated_at::text as updated_at,
          t.type_id as t_id, t.type_name as t_name, t.category as t_category,
          b.branch_id as b_id, b.branch_name as b_name,
          l.location_id as l_id, l.location_name as l_name,
          d.department_id as d_id, d.department_name as d_name,
          s.status_id as s_id, s.status_name as s_name, s.color_tag as s_color_tag,
          c.condition_id as c_id, c.condition_name as c_name,
          dd.asset_id as dd_asset_id, dd.monitor_brand, dd.monitor_serial,
          dd.keyboard_brand, dd.keyboard_serial, dd.mouse_serial
        from assets a
        left join asset_type_options t on t.type_id = a.type_id
        left join branches b on b.branch_id = a.branch_id
        left join locations l on l.location_id = a.location_id
        left join departments d on d.department_id = a.department_id
        left join status_options s on s.status_id = a.status_id
        left join condition_options c on c.condition_id = a.condition_id
        left join asset_desktop_details dd on dd.asset_id = a.asset_id
        order by a.item_id asc nulls last`,
    ]);

  return {
    branches,
    departments,
    statusOptions,
    conditionOptions,
    assetTypes,
    assets: rows.map(mapAssetRow),
  };
}

function mapAssetRow(row: AssetJoinRow): InventoryAsset {
  const desktop: InventoryDesktopDetail | null =
    row.dd_asset_id == null
      ? null
      : {
          asset_id: row.dd_asset_id,
          monitor_brand: row.monitor_brand,
          monitor_serial: row.monitor_serial,
          keyboard_brand: row.keyboard_brand,
          keyboard_serial: row.keyboard_serial,
          mouse_serial: row.mouse_serial,
        };

  return {
    asset_id: row.asset_id,
    item_id: row.item_id,
    type_id: row.type_id,
    branch_id: row.branch_id,
    location_id: row.location_id,
    cubicle_seat: row.cubicle_seat,
    assigned_to: row.assigned_to,
    department_id: row.department_id,
    status_id: row.status_id,
    condition_id: row.condition_id,
    floor_label: row.floor_label,
    installed_flag: row.installed_flag,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    type:
      row.t_id == null || row.t_name == null
        ? null
        : { type_id: row.t_id, type_name: row.t_name, category: row.t_category ?? "" },
    branch:
      row.b_id == null || row.b_name == null
        ? null
        : { branch_id: row.b_id, branch_name: row.b_name },
    location:
      row.l_id == null || row.l_name == null
        ? null
        : { location_id: row.l_id, branch_id: row.branch_id, location_name: row.l_name },
    department:
      row.d_id == null || row.d_name == null
        ? null
        : { department_id: row.d_id, department_name: row.d_name },
    status:
      row.s_id == null || row.s_name == null
        ? null
        : { status_id: row.s_id, status_name: row.s_name, color_tag: row.s_color_tag },
    condition:
      row.c_id == null || row.c_name == null
        ? null
        : { condition_id: row.c_id, condition_name: row.c_name },
    desktop_detail: desktop,
  };
}

/**
 * Insert or update one asset plus its optional desktop detail row — the online
 * equivalent of the original `HandleSave`. Runs in a single transaction like
 * EF's `SaveChanges`, so a guard-trigger failure (e.g. desktop details on a
 * non-desktop type) rolls the asset write back too. The `assets_generate_item_id`
 * trigger fills `item_id` when the drawer leaves it blank.
 */
export async function saveAsset(req: AssetSaveRequest): Promise<{ ok: true; assetId: number }> {
  const sql = getRgcSql();
  const now = utcNow();

  const assetId = await sql.begin(async (tx) => {
    let id: number;

    if (req.assetId == null) {
      const inserted = await tx<[{ asset_id: number }]>`
        insert into assets (
          item_id, type_id, branch_id, location_id, cubicle_seat, assigned_to,
          department_id, status_id, condition_id, floor_label, notes, updated_at
        ) values (
          ${req.itemId ?? null}, ${req.typeId}, ${req.branchId}, ${req.locationId ?? null},
          ${req.cubicleSeat ?? null}, ${req.assignedTo ?? null}, ${req.departmentId ?? null},
          ${req.statusId}, ${req.conditionId ?? null}, ${req.floorLabel ?? null},
          ${req.notes ?? null}, ${now}
        )
        returning asset_id`;
      const created = inserted[0]?.asset_id;
      if (created == null) throw new Error("Failed to save asset.");
      id = created;
    } else {
      const updated = await tx<[{ asset_id: number }]>`
        update assets set
          item_id = ${req.itemId ?? null},
          type_id = ${req.typeId},
          branch_id = ${req.branchId},
          location_id = ${req.locationId ?? null},
          cubicle_seat = ${req.cubicleSeat ?? null},
          assigned_to = ${req.assignedTo ?? null},
          department_id = ${req.departmentId ?? null},
          status_id = ${req.statusId},
          condition_id = ${req.conditionId ?? null},
          floor_label = ${req.floorLabel ?? null},
          notes = ${req.notes ?? null},
          updated_at = ${now}
        where asset_id = ${req.assetId}
        returning asset_id`;
      if (updated[0]?.asset_id == null) throw new Error("Asset not found.");
      id = req.assetId;
    }

    if (req.isDesktop) {
      await tx`
        insert into asset_desktop_details (
          asset_id, monitor_brand, monitor_serial, keyboard_brand, keyboard_serial, mouse_serial
        ) values (
          ${id}, ${req.monitorBrand ?? null}, ${req.monitorSerial ?? null},
          ${req.keyboardBrand ?? null}, ${req.keyboardSerial ?? null}, ${req.mouseSerial ?? null}
        )
        on conflict (asset_id) do update set
          monitor_brand = excluded.monitor_brand,
          monitor_serial = excluded.monitor_serial,
          keyboard_brand = excluded.keyboard_brand,
          keyboard_serial = excluded.keyboard_serial,
          mouse_serial = excluded.mouse_serial`;
    } else {
      // Non-desktop types drop any existing detail row (original: EF `Remove`).
      await tx`delete from asset_desktop_details where asset_id = ${id}`;
    }

    return id;
  });

  return { ok: true, assetId };
}

/** One or many rows — the original `ConfirmDelete` (`RemoveRange`). */
export async function deleteAssets(ids: number[]): Promise<{ ok: true; deleted: number }> {
  const sql = getRgcSql();
  try {
    const result = await sql`delete from assets where asset_id = any(${ids})`;
    return { ok: true, deleted: result.count };
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}
