import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { departmentForPosition } from '@swiftslip/shared/org';
import { liqLineTotal } from '@swiftslip/shared/liq';
import type {
  LiqExpense,
  LiqForm,
  SessionUser,
  StorageBackend,
} from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService } from '../../attachments';
import { ProfileService } from '../../profile';
import { withDeletionReminder } from '../../retention/services/retention-notice';
import { LiqExpenseRepository, LiqFormRepository } from '../repositories';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

/** What the list rows carry; the expense lines are summed separately. */
const LIST_SELECT =
  'id,department,section_location,prepared_by,date_prepared,trip_to,purpose,currency,attachment_approved,created_at,updated_at';

class LiquidationService extends BaseService<'liq_forms', LiqFormRepository> {
  private readonly expenses = new LiqExpenseRepository();

  constructor() {
    super(new LiqFormRepository());
  }

  async list(ownerId: string) {
    try {
      const rows = await this.repository.findAll(
        { owner_id: ownerId },
        { select: LIST_SELECT, sort: { updated_at: 'desc' } },
      );

      // The list shows each form's grand total, so the child rows come along
      // in one query rather than one per form.
      const ids = rows.map((row) => row.id);
      const lines = ids.length
        ? await this.expenses.findAll(
            { form_id: { in: ids } },
            {
              select:
                'form_id,idx,transpo,fuel_gas,meals,office_supplies,load_accommodation,entertainment_gifts,other_expenses',
            },
          )
        : [];

      const totals = new Map<string, number>();
      for (const line of lines) {
        const formId = line.form_id as string;
        totals.set(
          formId,
          (totals.get(formId) ?? 0) + liqLineTotal(line as LiqExpense),
        );
      }

      const documents = await withDeletionReminder(
        'liq',
        rows.map((row) => ({
          ...row,
          grand_total: totals.get(row.id) ?? 0,
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
      const entries = await this.expenses.findAll(
        { form_id: id },
        {
          select:
            'idx,expense_date,description,transpo,fuel_gas,meals,office_supplies,load_accommodation,entertainment_gifts,other_expenses',
          sort: { idx: 'asc' },
        },
      );
      return {
        success: true as const,
        document: {
          form: form as unknown as LiqForm & { id: string },
          entries: entries as unknown as LiqExpense[],
          ...((form as { attachment_name?: string | null }).attachment_name
            ? {
                attachment: {
                  name: (form as { attachment_name: string }).attachment_name,
                },
              }
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
    input: { date_prepared?: string | undefined },
  ): Promise<ServiceResponse<{ id: string }>> {
    try {
      const mine = await ProfileService.getMine(user.id);
      if (!mine.success) throw mine.error;
      const profile = mine.document!;

      const row = await this.repository.create({
        owner_id: user.id,
        // DEPARTMENT box: the department the position belongs to.
        department:
          profile.department || departmentForPosition(profile.designation),
        // SECTION/LOCATION box: the office / branch the person works at.
        section_location: profile.area || profile.designation,
        date_prepared: input.date_prepared ?? '',
        prepared_by: profile.full_name,
        approved_by: profile.supervisor,
        employee_signature: profile.signature,
        currency: 'PESOS',
      });
      await ActivityLogService.logBy(user, {
        action: 'liq.created',
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
    { form, entries }: { form: LiqForm; entries: LiqExpense[] },
  ): Promise<ServiceResponse<never>> {
    try {
      const updated = await this.repository.update(
        { id, owner_id: ownerId },
        {
          department: form.department,
          section_location: form.section_location,
          cost_center: form.cost_center,
          date_prepared: form.date_prepared,
          trip_to: form.trip_to,
          purpose: form.purpose,
          currency: form.currency === 'DOLLARS' ? 'DOLLARS' : 'PESOS',
          prepared_by: form.prepared_by,
          approved_by: form.approved_by,
          employee_signature: form.employee_signature,
          attachment_approved: form.attachment_approved,
          approved_via_viber: form.approved_via_viber,
          updated_at: new Date().toISOString(),
        },
      );
      if (!updated)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');

      // Replace the expense lines wholesale, like COS schedules / OT entries.
      await this.expenses.deleteMany({ form_id: id });
      await this.expenses.createMany(
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
      // Deleting the row must take its uploaded slip with it (best effort).
      const refs: { key: string; backend?: StorageBackend }[] = [];
      if (removed.attachment_path) {
        refs.push({
          key: removed.attachment_path,
          backend: (removed as Record<string, unknown>)
            .attachment_backend as StorageBackend,
        });
      }
      await AttachmentService.removeFiles(refs);
      // The child rows cascade with the header (liq_expenses.form_id).
      if (!quiet) {
        await ActivityLogService.logBy(user, {
          action: 'liq.deleted',
          target: `${removed.prepared_by || user.label}`,
          detail: `Form ${removed.id}`,
        });
      }
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }
}

export default new LiquidationService();
