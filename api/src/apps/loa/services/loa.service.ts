import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import {
  departmentForPosition,
  departmentWithLocation,
} from '@swiftslip/shared/org';
import type { LoaForm, SessionUser } from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService, readOtherFiles } from '../../attachments';
import { ProfileService } from '../../profile';
import { withDeletionReminder } from '../../retention/services/retention-notice';
import { LoaFormRepository } from '../repositories';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

class LoaService extends BaseService<'loa_forms', LoaFormRepository> {
  constructor() {
    super(new LoaFormRepository());
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
            'id,employee_name,id_number,department,position,date_from,date_to,attachment_approved,attachment_path,date_filed,created_at,updated_at',
          sort: { updated_at: 'desc' },
        },
      );
      const documents = await withDeletionReminder('loa', rows);
      return { success: true as const, documents };
    } catch (error) {
      return toFailure(error);
    }
  }

  async get(ownerId: string, id: string) {
    try {
      const row = await this.repository.findOne({ id, owner_id: ownerId });
      if (!row) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      // The additional supporting files travel as a plain list (their bytes
      // stay in storage) — pulled out so `form` remains an exact LoaForm.
      const { other_attachments, ...form } = row;
      return {
        success: true as const,
        document: {
          form: form as unknown as LoaForm & { id: string },
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
        // The sheet's one "Department / Location" box.
        department: departmentWithLocation(
          profile.department || departmentForPosition(profile.designation),
          profile.area,
        ),
        position: profile.designation,
        employee_signature: profile.signature,
        date_filed: input.date_filed ?? '',
      });
      await ActivityLogService.logBy(user, {
        action: 'loa.created',
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
    { form }: { form: LoaForm },
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
          date_from: form.date_from,
          date_to: form.date_to,
          days_applied: form.days_applied,
          leave_type: form.leave_type,
          leave_type_other: form.leave_type_other,
          pay_status: form.pay_status,
          reasons: form.reasons,
          report_back_date: form.report_back_date,
          approved_by: form.approved_by,
          approved_via_viber: form.approved_via_viber,
          employee_signature: form.employee_signature ?? '',
          attachment_approved: form.attachment_approved ?? false,
          updated_at: new Date().toISOString(),
        },
      );
      if (!updated)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
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
      // Deleting the row must take its files with it (best effort).
      await AttachmentService.removeFiles([
        removed.attachment_path,
        ...readOtherFiles(removed.other_attachments).map((file) => file.path),
      ]);
      if (!quiet) {
        await ActivityLogService.logBy(user, {
          action: 'loa.deleted',
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

export default new LoaService();
