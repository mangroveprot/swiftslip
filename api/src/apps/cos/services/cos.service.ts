import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import type {
  CosForm,
  CosSchedule,
  SessionUser,
} from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService } from '../../attachments';
import { ProfileService } from '../../profile';
import { withDeletionReminder } from '../../retention/services/retention-notice';
import { CosFormRepository, CosScheduleRepository } from '../repositories';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

class CosService extends BaseService<'cos_forms', CosFormRepository> {
  private readonly schedules = new CosScheduleRepository();

  constructor() {
    super(new CosFormRepository());
  }

  async list(ownerId: string) {
    try {
      const rows = await this.repository.findAll(
        { owner_id: ownerId },
        {
          // `attachment_approved` rides along so the list can badge approved
          // forms; `created_at` + `attachment_path` + `date_filed` are what the
          // retention reminder needs to tell a form that is about to be
          // deleted from one that will be kept.
          select:
            'id,employee_name,id_number,plant_location,position,change_type,attachment_approved,attachment_path,date_filed,created_at,updated_at',
          sort: { updated_at: 'desc' },
        },
      );
      const documents = await withDeletionReminder('cos', rows);
      return { success: true as const, documents };
    } catch (error) {
      return toFailure(error);
    }
  }

  async get(ownerId: string, id: string) {
    try {
      const form = await this.repository.findOne({ id, owner_id: ownerId });
      if (!form) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      const schedules = await this.schedules.findAll(
        { form_id: id },
        {
          select:
            'idx,effectivity_date,from_date,from_start,from_end,to_date,to_start,to_end',
          sort: { idx: 'asc' },
        },
      );
      return {
        success: true as const,
        document: {
          form: form as unknown as CosForm & { id: string },
          schedules: schedules as unknown as CosSchedule[],
          ...(form.attachment_name
            ? { attachment: { name: form.attachment_name } }
            : {}),
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** New form, prefilled from the signed-in person's profile. */
  async createFromProfile(
    user: SessionUser,
    input: { date_filed?: string | undefined },
  ): Promise<ServiceResponse<{ id: string }>> {
    try {
      const mine = await ProfileService.getMine(user.id);
      if (!mine.success) throw mine.error;
      const profile = mine.document!;

      const row = await this.repository.create({
        owner_id: user.id,
        id_number: profile.emp_no,
        employee_name: profile.full_name,
        plant_location: profile.area,
        position: profile.designation,
        employee_signature: profile.signature,
        date_filed: input.date_filed ?? '',
      });
      await ActivityLogService.logBy(user, {
        action: 'cos.created',
        target: `${profile.full_name} (${profile.emp_no})`,
        detail: `Form ${row.id}`,
      });
      return { success: true, document: { id: row.id } };
    } catch (error) {
      return toFailure(error);
    }
  }

  async save(
    ownerId: string,
    id: string,
    { form, schedules }: { form: CosForm; schedules: CosSchedule[] },
  ): Promise<ServiceResponse<never>> {
    try {
      const updated = await this.repository.update(
        { id, owner_id: ownerId },
        {
          id_number: form.id_number,
          employee_name: form.employee_name,
          plant_location: form.plant_location,
          position: form.position,
          date_filed: form.date_filed,
          change_type: form.change_type,
          employee_signature: form.employee_signature ?? '',
          reasons: form.reasons,
          approved_by: form.approved_by,
          received_by: form.received_by,
          processed_by: form.processed_by,
          approved_via_viber: form.approved_via_viber,
          attachment_approved: form.attachment_approved ?? false,
          updated_at: new Date().toISOString(),
        },
      );
      if (!updated)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');

      // Replace the schedule lines wholesale.
      await this.schedules.deleteMany({ form_id: id });
      await this.schedules.createMany(
        schedules.map((row) => ({ ...row, form_id: id })),
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
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      await AttachmentService.removeFiles([removed.attachment_path]);
      if (!quiet) {
        await ActivityLogService.logBy(user, {
          action: 'cos.deleted',
          target: `${removed.employee_name || user.label} (${removed.id_number || user.idNumber})`,
          detail: `Form ${removed.id}`,
        });
      }
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }
}

export default new CosService();
