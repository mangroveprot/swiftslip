import type {
  AssetSaveRequest,
  InventoryAssetTypeOption,
  InventoryBranch,
  InventoryConditionOption,
  InventoryDepartment,
  InventoryStatusOption,
} from '@swiftslip/shared/inventory';
import { RgcRepository } from '../../../core/engine';
import { utcNow } from '../../../core/framework/databases/postgres';
import { ErrorResponse } from '../../../common/shared';
import type { AssetJoinRow } from '../types';

/** Raw SQL against the RGC `assets` tables. Nothing else may query them. */
export class InventoryAssetRepository extends RgcRepository {
  /** The five lookup lists the inventory shell needs. */
  lookups() {
    return this.run((sql) =>
      Promise.all([
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
      ]),
    );
  }

  /** Every asset with its joins, ordered by item id. */
  findAllJoined() {
    return this.run(
      (sql) => sql<AssetJoinRow[]>`
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
    );
  }

  /**
   * Insert (`assetId` null) or update one asset plus its optional desktop
   * detail row, in ONE transaction: a guard-trigger failure rolls the asset
   * write back too. The `assets_generate_item_id` trigger fills a blank `item_id`.
   */
  saveWithDetail(req: AssetSaveRequest): Promise<number> {
    const now = utcNow();
    return this.run((sql) =>
      sql.begin(async (tx) => {
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
          if (created == null) {
            throw new ErrorResponse('DATABASE_ERROR', 'Failed to save asset.');
          }
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
          if (updated[0]?.asset_id == null) {
            throw new ErrorResponse('NOT_FOUND_ERROR', 'Asset not found.');
          }
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
      }),
    );
  }

  /** Returns how many rows were deleted. */
  deleteMany(ids: number[]): Promise<number> {
    return this.run(async (sql) => {
      const result = await sql`delete from assets where asset_id = any(${ids})`;
      return result.count;
    });
  }
}
