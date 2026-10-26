import type {
  AssetSaveRequest,
  InventoryAsset,
  InventoryData,
  InventoryDesktopDetail,
} from '@swiftslip/shared/inventory';
import type { SessionUser } from '@swiftslip/shared/types';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { ActivityLogService } from '../../activity-log';
import { InventoryAssetRepository } from '../repositories';
import type { AssetJoinRow } from '../types';

class InventoryAssetService {
  private readonly repository = new InventoryAssetRepository();

  /** Assets + the option lists the inventory shell needs (branches, filters, drawer choices). */
  async list(): Promise<ServiceResponse<InventoryData>> {
    try {
      const [
        [branches, departments, statusOptions, conditionOptions, assetTypes],
        rows,
      ] = await Promise.all([
        this.repository.lookups(),
        this.repository.findAllJoined(),
      ]);
      return {
        success: true,
        document: {
          branches,
          departments,
          statusOptions,
          conditionOptions,
          assetTypes,
          assets: rows.map(mapAssetRow),
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** Create (`assetId` null) or update one asset (+ desktop detail). */
  async save(
    actor: SessionUser,
    input: AssetSaveRequest,
  ): Promise<ServiceResponse<{ assetId: number }>> {
    try {
      const assetId = await this.repository.saveWithDetail(input);
      await ActivityLogService.logBy(actor, {
        action: input.assetId == null ? 'asset.created' : 'asset.updated',
        target: input.itemId ? `Asset ${input.itemId}` : `Asset #${assetId}`,
        detail: input.assignedTo || null,
      });
      return { success: true, document: { assetId } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** One or many rows — the original `ConfirmDelete` (`RemoveRange`). */
  async removeMany(
    ids: number[],
  ): Promise<ServiceResponse<{ deleted: number }>> {
    try {
      const deleted = await this.repository.deleteMany(ids);
      return { success: true, document: { deleted } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }
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
        : {
            type_id: row.t_id,
            type_name: row.t_name,
            category: row.t_category ?? '',
          },
    branch:
      row.b_id == null || row.b_name == null
        ? null
        : { branch_id: row.b_id, branch_name: row.b_name },
    location:
      row.l_id == null || row.l_name == null
        ? null
        : {
            location_id: row.l_id,
            branch_id: row.branch_id,
            location_name: row.l_name,
          },
    department:
      row.d_id == null || row.d_name == null
        ? null
        : { department_id: row.d_id, department_name: row.d_name },
    status:
      row.s_id == null || row.s_name == null
        ? null
        : {
            status_id: row.s_id,
            status_name: row.s_name,
            color_tag: row.s_color_tag,
          },
    condition:
      row.c_id == null || row.c_name == null
        ? null
        : { condition_id: row.c_id, condition_name: row.c_name },
    desktop_detail: desktop,
  };
}

export default new InventoryAssetService();
