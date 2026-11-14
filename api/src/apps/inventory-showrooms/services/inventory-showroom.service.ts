import type {
  Showroom,
  ShowroomSaveRequest,
  ShowroomStock,
  ShowroomStockRequest,
} from '@swiftslip/shared/showrooms';
import {
  cctvConnectionLabel,
  cctvInstalledLabel,
  internetLabel,
} from '@swiftslip/shared/showrooms';
import type { SessionUser } from '@swiftslip/shared/types';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { ActivityLogService } from '../../activity-log';
import { InventoryShowroomRepository } from '../repositories';

/** "CCTV: Active (Offline) · Internet: Needs request" - the create/delete note. */
function statusSummary(row: {
  cctv_installed: Showroom['cctv_installed'];
  cctv_connection: Showroom['cctv_connection'];
  internet: Showroom['internet'];
}): string {
  const cctv =
    row.cctv_installed === 'active'
      ? `${cctvInstalledLabel(row.cctv_installed)} (${cctvConnectionLabel(row.cctv_connection)})`
      : cctvInstalledLabel(row.cctv_installed);
  return `CCTV: ${cctv} · Internet: ${internetLabel(row.internet)}`;
}

/**
 * Only the fields that actually moved, so an edit reads as an audit line
 * ("CCTV connection: Offline → Online") instead of a dump of the whole row.
 */
function describeChanges(before: Showroom, after: ShowroomSaveRequest): string {
  const parts: string[] = [];

  if (before.showroom_name !== after.showroomName) {
    parts.push(`Renamed from "${before.showroom_name}"`);
  }
  if (before.cctv_installed !== after.cctvInstalled) {
    parts.push(
      `CCTV installed: ${cctvInstalledLabel(before.cctv_installed)} → ${cctvInstalledLabel(after.cctvInstalled)}`,
    );
  }
  if (before.cctv_connection !== after.cctvConnection) {
    parts.push(
      `CCTV connection: ${cctvConnectionLabel(before.cctv_connection)} → ${cctvConnectionLabel(after.cctvConnection)}`,
    );
  }

  const beforeCctvNote = before.cctv_note?.trim() ?? '';
  const afterCctvNote = after.cctvNote?.trim() ?? '';
  if (beforeCctvNote !== afterCctvNote) {
    parts.push(
      afterCctvNote ? `CCTV note: "${afterCctvNote}"` : 'CCTV note cleared',
    );
  }

  if (before.internet !== after.internet) {
    parts.push(
      `Internet: ${internetLabel(before.internet)} → ${internetLabel(after.internet)}`,
    );
  }

  const beforeNotes = before.notes?.trim() ?? '';
  const afterNotes = after.notes?.trim() ?? '';
  if (beforeNotes !== afterNotes) {
    parts.push(afterNotes ? 'Notes updated' : 'Notes cleared');
  }

  return parts.length ? parts.join(' · ') : 'Saved with no field changes';
}

class InventoryShowroomService {
  private readonly repository = new InventoryShowroomRepository();

  /** Every showroom plus nothing else: the page filters and searches client-side. */
  async list(): Promise<ServiceResponse<Showroom>> {
    try {
      const documents = await this.repository.findAll();
      return { success: true, documents };
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

  /** Create (`showroomId` null) or update one showroom. */
  async save(
    actor: SessionUser,
    showroomId: number | null,
    input: ShowroomSaveRequest,
  ): Promise<ServiceResponse<{ showroomId: number }>> {
    try {
      // The DB index is the real guard; this pre-check exists so the owner
      // reads "That showroom already exists." instead of driver noise.
      if (
        await this.repository.nameExists(
          input.showroomName,
          showroomId ?? undefined,
        )
      ) {
        throw new ErrorResponse(
          'UNIQUE_FIELD_ERROR',
          'That showroom already exists.',
        );
      }

      const before =
        showroomId == null ? null : await this.repository.findById(showroomId);
      const saved = await this.repository.save(showroomId, input);

      await ActivityLogService.logBy(actor, {
        action: before == null ? 'showroom.created' : 'showroom.updated',
        target: input.showroomName,
        detail: before
          ? describeChanges(before, input)
          : statusSummary({
              cctv_installed: input.cctvInstalled,
              cctv_connection: input.cctvConnection,
              internet: input.internet,
            }),
      });

      return { success: true, document: { showroomId: saved } };
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

  async remove(
    actor: SessionUser,
    showroomId: number,
  ): Promise<ServiceResponse<{ deleted: number }>> {
    try {
      const before = await this.repository.findById(showroomId);
      const deleted = await this.repository.remove(showroomId);
      if (deleted === 0 || before == null) {
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Showroom not found.');
      }
      await ActivityLogService.logBy(actor, {
        action: 'showroom.deleted',
        target: before.showroom_name,
        detail: statusSummary(before),
      });
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

  /** The one editable number in the header card: total CCTV units. */
  async getStock(): Promise<ServiceResponse<ShowroomStock>> {
    try {
      const cctvTotalUnits = await this.repository.getCctvTotalUnits();
      return { success: true, document: { cctvTotalUnits } };
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

  async saveStock(
    actor: SessionUser,
    input: ShowroomStockRequest,
  ): Promise<ServiceResponse<ShowroomStock>> {
    try {
      const before = await this.repository.getCctvTotalUnits();
      const cctvTotalUnits = await this.repository.setCctvTotalUnits(
        input.cctvTotalUnits,
      );
      await ActivityLogService.logBy(actor, {
        action: 'showroom.stock_updated',
        target: 'CCTV units',
        detail:
          before === cctvTotalUnits
            ? `Stayed at ${cctvTotalUnits} units`
            : `${before} → ${cctvTotalUnits} units`,
      });
      return { success: true, document: { cctvTotalUnits } };
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

export default new InventoryShowroomService();
