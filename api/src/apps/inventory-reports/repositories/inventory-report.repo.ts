import { RgcRepository } from '../../../core/engine';
import type { ReportAssetSource } from '../types';

/** Raw SQL feeding the branch report. */
export class InventoryReportRepository extends RgcRepository {
  /** `undefined` when the branch does not exist. */
  findBranchName(branchId: number): Promise<string | undefined> {
    return this.run(async (sql) => {
      const rows = await sql<{ branch_name: string }[]>`
        select branch_name from branches where branch_id = ${branchId}`;
      return rows[0]?.branch_name;
    });
  }

  /** Unsorted: the document builder orders and groups them. */
  findAssetsForBranch(branchId: number): Promise<ReportAssetSource[]> {
    return this.run(
      (sql) => sql<ReportAssetSource[]>`
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
        where a.branch_id = ${branchId}`,
    );
  }
}
