import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import {
  departmentForPosition,
  departmentWithLocation,
} from '@swiftslip/shared/org';
import type { ObEntry, ObForm, SessionUser } from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService } from '../../attachments';
import { ProfileService } from '../../profile';
import { withDeletionReminder } from '../../retention/services/retention-notice';
import { ObEntryRepository, ObFormRepository } from '../repositories';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

class OfficialBusinessService extends BaseService<
  'ob_forms',
  ObFormRepository
> {
  private readonly entries = new ObEntryRepository();

  constructor() {
    super(new ObFormRepository());
  }

  /** The owner's forms, newest first, each with its list of destinations. */
  async list(ownerId: string) {
    try {
      const forms = await this.repository.findAll(
        { owner_id: ownerId },
        {
          // `attachment_approved` rides along so the list can badge approved
          // forms; `created_at` + `attachment_path` + `date_filed` are what the
          // retention reminder needs to tell a form that is about to be
          // deleted from one that will be kept.
          select:
            'id,employee_name,id_number,department,position,date_of_ob,attachment_approved,attachment_path,date_filed,created_at,updated_at',
          sort: { updated_at: 'desc' },
        },
      );
      if (!forms.length) return { success: true as const, documents: [] };

      // The list filters and cards both need the To field, which lives on the
      // itinerary rows. Fetch them in one query instead of one per form.
      const rows = await this.entries.findAll(
        { form_id: forms.map((form) => form.id) },
        { select: 'form_id,to_place', sort: { idx: 'asc' } },
      );
      const destinations = new Map<string, string[]>();
      for (const entry of rows) {
        const value = entry.to_place?.trim();
        if (!value) continue;
        const list = destinations.get(entry.form_id) ?? [];
        if (!list.includes(value)) list.push(value);
        destinations.set(entry.form_id, list);
      }

      const documents = await withDeletionReminder(
        'ob',
        forms.map((form) => ({
          ...form,
          destinations: destinations.get(form.id) ?? [],
        })),
      );
      return { success: true as const, documents };
    } catch (error) {
      return toFailure(error);
    }
  }

  async get(ownerId: string, id: string) {
    try {
      const form = await this.repository.findOne({ id, owner_id: ownerId });
      if (!form) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      const entries = await this.entries.findAll(
        { form_id: id },
        {
          select: 'idx,from_place,to_place,purpose,time_departure,time_return',
          sort: { idx: 'asc' },
        },
      );
      return {
        success: true as const,
        document: {
          form: form as unknown as ObForm & { id: string },
          entries: entries as unknown as ObEntry[],
          // Only the file's name travels here, and only when there is one.
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
        // The sheet's one "Department / Location" box: the department the
        // position belongs to, then the office branch it prints after the slash.
        department: departmentWithLocation(
          profile.department || departmentForPosition(profile.designation),
          profile.area,
        ),
        position: profile.designation,
        employee_signature: profile.signature,
        date_filed: input.date_filed ?? '',
      });
      await ActivityLogService.logBy(user, {
        action: 'ob.created',
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
    { form, entries }: { form: ObForm; entries: ObEntry[] },
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
          date_of_ob: form.date_of_ob,
          approved_by: form.approved_by,
          approved_via_viber: form.approved_via_viber,
          employee_signature: form.employee_signature ?? '',
          attachment_approved: form.attachment_approved ?? false,
          updated_at: new Date().toISOString(),
        },
      );
      if (!updated)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');

      // Replace the itinerary wholesale.
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
      const removed = await this.repository.delete({
        id,
        owner_id: user.id,
      });
      if (!removed)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      // Deleting the row must take its file with it (best effort).
      await AttachmentService.removeFiles([removed.attachment_path]);
      if (!quiet) {
        await ActivityLogService.logBy(user, {
          action: 'ob.deleted',
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

export default new OfficialBusinessService();
