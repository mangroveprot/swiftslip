import type {
  ShowroomUpdate,
  ShowroomUpdateChange,
  ShowroomUpdateEvent,
  ShowroomUpdateSaveRequest,
} from '@swiftslip/shared/showroom-updates';
import {
  showroomUpdateRemarksMeta,
  showroomUpdateResponsibleMeta,
  showroomUpdateSheetDate,
  showroomUpdateStatusMeta,
  showroomUpdateVehicleMeta,
} from '@swiftslip/shared/showroom-updates';
import type { SessionUser } from '@swiftslip/shared/types';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { ActivityLogService } from '../../activity-log';
import { ShowroomUpdateRepository } from '../repositories';

/** What a cleared cell reads as in the audit line. */
const EMPTY = '—';

function asText(value: string | null): string {
  return value?.trim() ? value : EMPTY;
}

/**
 * Only the fields that actually moved, with their display labels, so an edit
 * reads as "Status: OPEN → READY" instead of a JSON dump.
 */
function describeChanges(
  before: ShowroomUpdate,
  after: ShowroomUpdateSaveRequest,
): ShowroomUpdateChange[] {
  const changes: ShowroomUpdateChange[] = [];
  const add = (field: string, from: string, to: string) => {
    if (from !== to) changes.push({ field, from, to });
  };

  add(
    'Showroom name',
    asText(before.showroom_name),
    asText(after.showroomName),
  );
  add('Location', asText(before.location), asText(after.location));
  add('Map link', asText(before.map_url), asText(after.mapUrl));
  add('Map label', asText(before.map_label), asText(after.mapLabel));
  add(
    'Status',
    showroomUpdateStatusMeta(before.status)?.label ?? EMPTY,
    showroomUpdateStatusMeta(after.status)?.label ?? EMPTY,
  );
  add('Requirements', asText(before.requirements), asText(after.requirements));
  add(
    'Action required',
    asText(before.action_required),
    asText(after.actionRequired),
  );
  add(
    'Responsible person',
    showroomUpdateResponsibleMeta(before.responsible_person)?.label ?? EMPTY,
    showroomUpdateResponsibleMeta(after.responsiblePerson)?.label ?? EMPTY,
  );
  add(
    'Remarks',
    showroomUpdateRemarksMeta(before.remarks)?.label ?? EMPTY,
    showroomUpdateRemarksMeta(after.remarks)?.label ?? EMPTY,
  );
  add(
    'Date open',
    showroomUpdateSheetDate(before.open_date) || EMPTY,
    showroomUpdateSheetDate(after.openDate) || EMPTY,
  );
  add(
    'Vehicle',
    showroomUpdateVehicleMeta(before.vehicle)?.label ?? EMPTY,
    showroomUpdateVehicleMeta(after.vehicle)?.label ?? EMPTY,
  );

  return changes;
}

/** A row where nothing is set, so a new showroom's audit trail reads "— → …". */
const BLANK_ROW: ShowroomUpdate = {
  update_id: 0,
  sr_no: 0,
  showroom_name: '',
  location: '',
  status: null,
  requirements: null,
  action_required: null,
  responsible_person: null,
  remarks: null,
  open_date: null,
  vehicle: null,
  map_url: null,
  map_label: null,
  updated_by: null,
  updated_at: null,
};

function normalized(
  input: ShowroomUpdateSaveRequest,
): ShowroomUpdateSaveRequest {
  return {
    ...input,
    requirements: input.requirements?.trim() || null,
    actionRequired: input.actionRequired?.trim() || null,
    mapUrl: input.mapUrl?.trim() || null,
    mapLabel: input.mapLabel?.trim() || null,
  };
}

/**
 * The board's reads and its one write. Every method answers `ServiceResponse`
 * and never throws; the repository is the only place that speaks SQL.
 */
class ShowroomUpdateService {
  private readonly repository = new ShowroomUpdateRepository();

  async list(): Promise<ServiceResponse<ShowroomUpdate>> {
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

  async history(
    updateId: number,
  ): Promise<ServiceResponse<ShowroomUpdateEvent>> {
    try {
      const documents = await this.repository.findEvents(updateId);
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

  async save(
    actor: SessionUser,
    updateId: number,
    input: ShowroomUpdateSaveRequest,
  ): Promise<ServiceResponse<ShowroomUpdate>> {
    try {
      const before = await this.repository.findById(updateId);
      if (!before) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'That showroom is no longer on the board.',
        );
      }

      // The seed's text carries trailing spaces in a couple of cells; trimming
      // here keeps the board and the export equal without rejecting the save.
      const clean = normalized(input);

      const changes = describeChanges(before, clean);
      if (changes.length === 0) {
        return { success: true, document: before };
      }

      const document = await this.repository.save(
        updateId,
        clean,
        actor,
        changes,
      );

      await ActivityLogService.logBy(actor, {
        action: 'showroom_update.saved',
        target: `${before.showroom_name} (No. ${before.sr_no})`,
        detail: changes
          .map((change) => `${change.field}: ${change.from} → ${change.to}`)
          .join(' · '),
      });

      return { success: true, document };
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

  /**
   * Add a showroom. Every field except the name and location may be empty, so
   * a place can be put on the board before its papers arrive. The No. is the
   * repository's job; the audit line records the starting values.
   */
  async create(
    actor: SessionUser,
    input: ShowroomUpdateSaveRequest,
  ): Promise<ServiceResponse<ShowroomUpdate>> {
    try {
      const clean = normalized(input);
      const changes = describeChanges(BLANK_ROW, clean);
      const document = await this.repository.create(clean, actor, changes);

      await ActivityLogService.logBy(actor, {
        action: 'showroom_update.created',
        target: `${document.showroom_name} (No. ${document.sr_no})`,
        detail: changes
          .map((change) => `${change.field}: ${change.from} → ${change.to}`)
          .join(' · '),
      });

      return { success: true, document };
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

  /**
   * Remove the ticked showrooms in one statement. Their history cascades; the
   * activity log keeps one line for the batch, like the board's other writes.
   */
  async removeMany(
    actor: SessionUser,
    ids: number[],
  ): Promise<ServiceResponse<{ deleted: number }>> {
    try {
      const removed = await this.repository.deleteMany(ids);
      if (removed.length > 0) {
        const names = removed.map(
          (row) => `${row.showroom_name} (No. ${row.sr_no})`,
        );
        await ActivityLogService.logBy(actor, {
          action: 'showroom_update.deleted',
          target: names.length === 1 ? names[0] : `${names.length} showrooms`,
          detail: names.join(' · '),
        });
      }
      return { success: true, document: { deleted: removed.length } };
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

export default new ShowroomUpdateService();
