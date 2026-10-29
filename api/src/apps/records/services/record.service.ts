import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import {
  departmentForPosition,
  departmentWithLocation,
} from '@swiftslip/shared/org';
import type { DtrEntry, DtrHeader, SessionUser } from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService } from '../../attachments';
import { ProfileService } from '../../profile';
import { withDeletionReminder } from '../../retention/services/retention-notice';
import { RecordEntryRepository, RecordRepository } from '../repositories';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

class RecordService extends BaseService<'dtr_records', RecordRepository> {
  private readonly entries = new RecordEntryRepository();

  constructor() {
    super(new RecordRepository());
  }

  async list(ownerId: string) {
    try {
      const rows = await this.repository.findAll(
        { owner_id: ownerId },
        {
          // `attachment_path` rides along so the list can badge records: on
          // DTRs the attached file IS the approval (no approval flag exists).
          // `created_at` is what the retention reminder measures age from.
          select:
            'id,name,emp_no,designation,area,month,year,period,attachment_path,created_at,updated_at',
          sort: { updated_at: 'desc' },
        },
      );
      const documents = await withDeletionReminder('dtr', rows);
      return { success: true as const, documents };
    } catch (error) {
      return toFailure(error);
    }
  }

  async get(ownerId: string, id: string) {
    try {
      const record = await this.repository.findOne({ id, owner_id: ownerId });
      if (!record)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Record not found.');
      const entries = await this.entries.findAll(
        { record_id: id },
        {
          select: 'day,time_in,time_out,schedule,remarks',
          sort: { day: 'asc' },
        },
      );
      return {
        success: true as const,
        document: {
          record: record as unknown as DtrHeader & { id: string },
          entries: entries as unknown as DtrEntry[],
          ...(record.attachment_name
            ? { attachment: { name: record.attachment_name } }
            : {}),
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** New record for a month/period, prefilled from the signed-in profile. */
  async createFromProfile(
    user: SessionUser,
    input: { month: number; year: number; period: DtrHeader['period'] },
  ): Promise<ServiceResponse<{ id: string }>> {
    try {
      const mine = await ProfileService.getMine(user.id);
      if (!mine.success) throw mine.error;
      const profile = mine.document!;

      const row = await this.repository.create({
        owner_id: user.id,
        month: input.month,
        year: input.year,
        period: input.period,
        emp_no: profile.emp_no,
        name: profile.full_name,
        designation: profile.designation,
        // The sheet's AREA row carries the same pair as the OB/OT/LOA
        // "Department / Location" box ("IT DEP/RGC Dipolog Sat Office").
        area: departmentWithLocation(
          profile.department || departmentForPosition(profile.designation),
          profile.area,
        ),
        employee_signature: profile.signature,
      });
      await ActivityLogService.logBy(user, {
        action: 'record.created',
        target: `${profile.full_name} (${profile.emp_no})`,
        detail: `Record ${row.id}`,
      });
      return { success: true, document: { id: row.id } };
    } catch (error) {
      return toFailure(error);
    }
  }

  async save(
    ownerId: string,
    id: string,
    { header, entries }: { header: DtrHeader; entries: DtrEntry[] },
  ): Promise<ServiceResponse<never>> {
    try {
      const updated = await this.repository.update(
        { id, owner_id: ownerId },
        {
          emp_no: header.emp_no,
          name: header.name,
          designation: header.designation,
          area: header.area,
          month: header.month,
          year: header.year,
          period: header.period,
          certified_by: header.certified_by,
          employee_signature: header.employee_signature ?? '',
          updated_at: new Date().toISOString(),
        },
      );
      if (!updated)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Record not found.');

      // Replace the day rows wholesale.
      await this.entries.deleteMany({ record_id: id });
      await this.entries.createMany(
        entries.map((entry) => ({ ...entry, record_id: id })),
      );
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `quiet` = the app sweeping an untouched scaffold: no activity-log row. */
  async remove(
    user: SessionUser,
    id: string,
    quiet = false,
  ): Promise<ServiceResponse<never>> {
    try {
      const removed = await this.repository.delete({ id, owner_id: user.id });
      if (!removed)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Record not found.');
      await AttachmentService.removeFiles([removed.attachment_path]);
      if (!quiet) {
        await ActivityLogService.logBy(user, {
          action: 'record.deleted',
          target: `${removed.name || user.label} (${removed.emp_no || user.idNumber})`,
          detail: `Record ${removed.id}`,
        });
      }
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }
}

export default new RecordService();
