import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import {
  departmentForPosition,
  departmentWithLocation,
} from '@swiftslip/shared/org';
import type { OtEntry, OtForm, SessionUser } from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService, readOtherFiles } from '../../attachments';
import { ProfileService } from '../../profile';
import { withDeletionReminder } from '../../retention/services/retention-notice';
import { OtEntryRepository, OtFormRepository } from '../repositories';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

class OtService extends BaseService<'ot_forms', OtFormRepository> {
  private readonly entries = new OtEntryRepository();

  constructor() {
    super(new OtFormRepository());
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
            'id,employee_name,id_number,department,position,date_filed,attachment_approved,attachment_path,created_at,updated_at',
          sort: { updated_at: 'desc' },
        },
      );
      const documents = await withDeletionReminder('ot', rows);
      return { success: true as const, documents };
    } catch (error) {
      return toFailure(error);
    }
  }

  async get(ownerId: string, id: string) {
    try {
      const row = await this.repository.findOne({ id, owner_id: ownerId });
      if (!row) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      const entries = await this.entries.findAll(
        { form_id: id },
        {
          select:
            'idx,date_of_ot,regular_from,regular_to,actual_from,actual_to,total_hours,validation',
          sort: { idx: 'asc' },
        },
      );
      // The additional supporting files travel as a plain list — pulled out
      // of the row so `form` remains an exact OtForm.
      const { other_attachments, ...rest } = row;
      return {
        success: true as const,
        document: {
          form: rest as unknown as OtForm & { id: string },
          entries: entries as unknown as OtEntry[],
          ...(row.attachment_name
            ? { attachment: { name: row.attachment_name } }
            : {}),
          others: readOtherFiles(other_attachments),
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
        department: departmentWithLocation(
          profile.department || departmentForPosition(profile.designation),
          profile.area,
        ),
        position: profile.designation,
        employee_signature: profile.signature,
        date_filed: input.date_filed ?? '',
      });
      await ActivityLogService.logBy(user, {
        action: 'ot.created',
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
    { form, entries }: { form: OtForm; entries: OtEntry[] },
  ): Promise<ServiceResponse<never>> {
    try {
      const updated = await this.repository.update(
        { id, owner_id: ownerId },
        {
          id_number: form.id_number,
          employee_name: form.employee_name,
          department: form.department,
          position: form.position,
          date_filed: form.date_filed,
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

      // Replace the OT lines wholesale.
      await this.entries.deleteMany({ form_id: id });
      await this.entries.createMany(
        entries.map((entry) => ({ ...entry, form_id: id })),
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
      await AttachmentService.removeFiles([
        removed.attachment_path,
        ...readOtherFiles(removed.other_attachments).map((file) => file.path),
      ]);
      if (!quiet) {
        await ActivityLogService.logBy(user, {
          action: 'ot.deleted',
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

export default new OtService();
