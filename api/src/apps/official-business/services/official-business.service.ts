import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import {
  departmentForPosition,
  departmentWithLocation,
} from '@swiftslip/shared/org';
import {
  isObLocked,
  needsReapprovalAfterSave,
  obSupervisorDone,
  type ObHrFields,
  type ObHrStatus,
  type ObResubmitEvent,
  type ObSubmitSnapshot,
} from '@swiftslip/shared/hr';
import {
  obResubmitChanges,
  obSubmitSnapshot,
} from '@swiftslip/shared/ob-resubmit';
import {
  obMissingRequiredFields,
  obRequiredMessage,
} from '@swiftslip/shared/ob-required';
import type {
  ObEntry,
  ObForm,
  SessionUser,
  StorageBackend,
} from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService } from '../../attachments';
import { HrService } from '../../hr';
import { NotificationService } from '../../notifications';
import { ProfileService } from '../../profile';
import { withDeletionReminder } from '../../retention/services/retention-notice';
import { ObEntryRepository, ObFormRepository } from '../repositories';
import {
  resolveObResubmitReviewers,
  resolveObSigners,
} from '../utils/ob-signers';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

/**
 * Everything the employee actually wrote on the form, minus the supervisor
 * approval fields. A save that changes only `approved_by` / the Viber note /
 * the approval-slip tick is a supervisor-only update, not an edit to content HR
 * already approved.
 */
function contentSignature(form: ObForm): string {
  return JSON.stringify([
    form.id_number ?? '',
    form.employee_name ?? '',
    form.department ?? '',
    form.position ?? '',
    form.date_filed ?? '',
    form.date_of_ob ?? '',
    form.employee_signature ?? '',
  ]);
}

function entriesSignature(entries: ObEntry[]): string {
  return JSON.stringify(
    [...entries]
      .sort((left, right) => left.idx - right.idx)
      .map((entry) => [
        entry.from_place ?? '',
        entry.to_place ?? '',
        entry.purpose ?? '',
        entry.time_departure ?? '',
        entry.time_return ?? '',
      ]),
  );
}

class OfficialBusinessService extends BaseService<
  'ob_forms',
  ObFormRepository
> {
  private readonly entries = new ObEntryRepository();

  constructor() {
    super(new ObFormRepository());
  }

  /**
   * The itinerary as the submit check reads it — every persisted stop, in
   * order, with the three cells the sheet marks required.
   */
  private async readEntries(id: string): Promise<ObEntry[]> {
    const rows = await this.entries.findAll(
      { form_id: id },
      {
        select: 'idx,from_place,to_place,purpose,time_departure,time_return',
        sort: { idx: 'asc' },
      },
    );
    return rows as unknown as ObEntry[];
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
            'id,employee_name,id_number,department,position,date_of_ob,attachment_approved,attachment_path,date_filed,hr_status,resubmit_count,resubmit_history,created_at,updated_at',
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
      // The same resolved signers the HR detail uses, so the employee's preview
      // prints the completed exit-clearance boxes too. The resubmit history is
      // decorated with the reviewer behind each old rejection so the historical
      // record stays complete after the live `hr_rejected_*` columns are cleared
      // on resubmit. The waiting-for-HR card no longer repeats that old
      // rejection; rejection facts belong to the rejected card only.
      const [signers, resubmitHistory] = await Promise.all([
        resolveObSigners(form),
        resolveObResubmitReviewers(
          (form.resubmit_history ?? []) as ObResubmitEvent[],
        ),
      ]);
      return {
        success: true as const,
        document: {
          form: {
            ...(form as unknown as ObForm & ObHrFields & { id: string }),
            resubmit_history: resubmitHistory,
          },
          entries: entries as unknown as ObEntry[],
          signers,
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
    user: SessionUser,
    id: string,
    { form, entries }: { form: ObForm; entries: ObEntry[] },
  ): Promise<ServiceResponse<{ hr_status: ObHrStatus }>> {
    try {
      const ownerId = user.id;
      // Only the state that is actually in HR's queue is locked (D6) — check
      // before writing, not after, so an auto-save cannot overwrite it. An
      // approved / departed / completed form is editable again; the save below
      // sends it back to HR instead of silently changing approved content.
      const current = await this.repository.findOne({ id, owner_id: ownerId });
      if (!current)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      const currentStatus = current.hr_status as ObHrStatus;
      if (isObLocked(currentStatus)) {
        throw new ErrorResponse(
          'FORM_LOCKED',
          'This form is with HR for review and can no longer be edited.',
        );
      }

      // HR's approval covers the content it reviewed. Adding the supervisor's
      // name / ticking the slip is not a content edit: it keeps a form that is
      // already out on OB out on OB, and promotes a waiting form to ready for
      // departure. Anything else while HR-approved sends it back to the queue.
      const supervisorEditable =
        currentStatus === 'waiting_supervisor' || currentStatus === 'departed';
      const currentEntries = supervisorEditable
        ? ((await this.entries.findAll(
            { form_id: id },
            {
              select:
                'idx,from_place,to_place,purpose,time_departure,time_return',
              sort: { idx: 'asc' },
            },
          )) as unknown as ObEntry[])
        : [];
      const contentUnchanged =
        supervisorEditable &&
        contentSignature(current as unknown as ObForm) ===
          contentSignature(form) &&
        entriesSignature(currentEntries) === entriesSignature(entries);
      const resubmitted =
        currentStatus === 'waiting_supervisor'
          ? !contentUnchanged
          : needsReapprovalAfterSave(currentStatus) &&
            !(currentStatus === 'departed' && contentUnchanged);

      // HR approved but the supervisor had not signed yet: this save is what
      // completes the supervisor half, so move on to "Ready for departure"
      // without asking HR to approve the same content twice.
      const supervisorDone =
        currentStatus === 'waiting_supervisor' && obSupervisorDone(form);
      const nextStatus: ObHrStatus = resubmitted
        ? 'submitted'
        : supervisorDone
          ? 'approved'
          : currentStatus;

      const now = new Date().toISOString();
      // A content save on an approved form is a resubmit: diff the content HR
      // approved (the stored snapshot) against what is being saved now, and
      // replace the snapshot so the next trip has a fresh baseline.
      const submittedSnapshot = obSubmitSnapshot(form, entries);
      const submittedChanges = resubmitted
        ? obResubmitChanges(
            (current.submit_snapshot ?? null) as ObSubmitSnapshot | null,
            submittedSnapshot,
          )
        : [];
      // The supervisor half is complete the moment the approval slip is ticked:
      // stamp it only on that false → true transition, so a later save leaves
      // the original approval time alone (and an already-true slip never
      // restamps it).
      const attachmentApproved = form.attachment_approved ?? false;
      const supervisorApprovedNow =
        !current.attachment_approved && attachmentApproved;
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
          attachment_approved: attachmentApproved,
          hr_status: nextStatus,
          updated_at: now,
          ...(supervisorApprovedNow ? { supervisor_approved_at: now } : {}),
          ...(resubmitted
            ? {
                submitted_at: now,
                // A save that revokes an approval is a resubmit too: the form
                // is back in HR's queue, and the badge must say so (0037).
                resubmit_count: (current.resubmit_count ?? 0) + 1,
                resubmit_history: [
                  ...(current.resubmit_history ?? []),
                  {
                    at: now,
                    how: 'edited' as const,
                    ...(submittedChanges.length
                      ? { changes: submittedChanges }
                      : {}),
                  },
                ],
                submit_snapshot: submittedSnapshot,
                hr_reject_reason: '',
                hr_rejected_at: null,
                hr_rejected_by: null,
                hr_approved_by: null,
                hr_approved_at: null,
                departure_signed_by: null,
                departure_signed_at: null,
                arrival_date: '',
                arrival_time: '',
                arrival_signed_by: null,
                arrival_signed_at: null,
              }
            : {}),
        },
      );
      if (!updated)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');

      // Replace the itinerary wholesale.
      await this.entries.deleteMany({ form_id: id });
      await this.entries.createMany(
        entries.map((entry) => ({ ...entry, form_id: id })),
      );

      if (resubmitted) {
        await ActivityLogService.logBy(user, {
          action: 'ob.submitted',
          target: `${form.employee_name || user.label} (${form.id_number || user.idNumber})`,
          detail: `Form ${id} (edited after HR approval)`,
        });
        await NotificationService.notify({
          recipients: await HrService.hrRecipients(user.id),
          actorId: user.id,
          kind: 'ob_resubmitted',
          title: 'Official Business edited after approval',
          body: `${form.employee_name || user.label} edited an OB form${form.date_of_ob ? ` for ${form.date_of_ob}` : ''}. It needs HR approval again.`,
          link: `/hr/ob/${id}`,
        });
      } else if (supervisorDone) {
        // The employee completed their supervisor's half while the form was
        // parked as waiting_supervisor; it is now "Ready for departure" and HR
        // can sign the employee out. Log it so the live-update signal refreshes
        // any HR screen showing this form, and tell HR it is actionable.
        await ActivityLogService.logBy(user, {
          action: 'ob.supervisor_approved',
          target: `${form.employee_name || user.label} (${form.id_number || user.idNumber})`,
          detail: `Form ${id} (ready for departure)`,
        });
        await NotificationService.notify({
          recipients: await HrService.hrRecipients(user.id),
          actorId: user.id,
          kind: 'ob_approved',
          title: 'Official Business ready for departure',
          body: `${form.employee_name || user.label} completed supervisor approval${form.date_of_ob ? ` for ${form.date_of_ob}` : ''}. HR can now sign the departure.`,
          link: `/hr/ob/${id}`,
        });
      }

      return { success: true, document: { hr_status: nextStatus } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `draft | rejected → submitted` — the employee hands the form to HR.
   *
   * A resubmission after a rejection notifies HR with its own event so the
   * queue can tell a new form from one that was bounced back (D5). The reject
   * reason is cleared because it no longer describes the form.
   */
  async submit(user: SessionUser, id: string): Promise<ServiceResponse<never>> {
    try {
      const form = await this.repository.findOne({ id, owner_id: user.id });
      if (!form) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');

      const current = form.hr_status as ObHrStatus;
      if (current !== 'draft' && current !== 'rejected') {
        throw new ErrorResponse(
          'FORM_LOCKED',
          'This form is already with HR and cannot be submitted again.',
        );
      }

      // The asterisks are enforced here, not only in the editor: a stale tab,
      // a resubmit of a half-fixed rejection or a direct POST must not hand HR
      // a form the paper sheet would not accept (shared list = one meaning of
      // "required" for the highlight and this check).
      const entries = await this.readEntries(id);
      const missing = obMissingRequiredFields(
        form as unknown as ObForm,
        entries,
      );
      if (missing.length) {
        throw new ErrorResponse(
          'REQUIRED_FIELD_MISSING',
          obRequiredMessage(missing),
          missing.map((field) => field.label),
        );
      }

      const resubmitted = current === 'rejected';
      const previousReason = (form.hr_reject_reason ?? '').trim();
      const previousRejectedAt = form.hr_rejected_at ?? null;
      const previousRejectedBy = form.hr_rejected_by ?? null;
      const history = (form.resubmit_history ?? []) as ObResubmitEvent[];
      // What HR last reviewed is the previous snapshot; the form row already
      // holds the edited content, so the diff is snapshot → current.
      const snapshot = obSubmitSnapshot(form as unknown as ObForm, entries);
      const changes = obResubmitChanges(
        (form.submit_snapshot ?? null) as ObSubmitSnapshot | null,
        snapshot,
      );
      const now = new Date().toISOString();
      await this.repository.update(
        { id, owner_id: user.id },
        {
          hr_status: 'submitted',
          submitted_at: now,
          hr_reject_reason: '',
          hr_rejected_at: null,
          hr_rejected_by: null,
          updated_at: now,
          // The baseline for the next resubmit. Written on a first submit too,
          // so the first edit after it has something to diff against.
          submit_snapshot: snapshot,
          // Only a re-entry counts: a first submission leaves the counter and
          // the history exactly as they were.
          ...(resubmitted
            ? {
                resubmit_count: (form.resubmit_count ?? 0) + 1,
                resubmit_history: [
                  ...history,
                  {
                    at: now,
                    how: 'rejected' as const,
                    ...(previousReason ? { reason: previousReason } : {}),
                    ...(previousRejectedAt
                      ? { rejected_at: previousRejectedAt }
                      : {}),
                    ...(previousRejectedBy
                      ? { rejected_by: previousRejectedBy }
                      : {}),
                    ...(changes.length ? { changes } : {}),
                  },
                ],
              }
            : {}),
        },
      );

      await ActivityLogService.logBy(user, {
        action: 'ob.submitted',
        target: `${form.employee_name || user.label} (${form.id_number || user.idNumber})`,
        detail: `Form ${id}${resubmitted ? ' (resubmitted)' : ''}`,
      });
      await NotificationService.notify({
        recipients: await HrService.hrRecipients(user.id),
        actorId: user.id,
        kind: resubmitted ? 'ob_resubmitted' : 'ob_submitted',
        title: resubmitted
          ? 'Official Business resubmitted'
          : 'New Official Business request',
        body: `${form.employee_name || user.label} ${resubmitted ? 'resubmitted' : 'submitted'} an OB form${form.date_of_ob ? ` for ${form.date_of_ob}` : ''}.`,
        link: `/hr/ob/${id}`,
      });
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
      // Any owner may delete their own form in any state — including a
      // completed one. HR cannot delete: the HR module has no delete route and
      // every query here is scoped to `owner_id`.
      const removed = await this.repository.delete({
        id,
        owner_id: user.id,
      });
      if (!removed)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      // Deleting the row must take its file with it (best effort).
      const refs: { key: string; backend?: StorageBackend }[] = [];
      if (removed.attachment_path) {
        refs.push({
          key: removed.attachment_path,
          backend: (removed as Record<string, unknown>)
            .attachment_backend as StorageBackend,
        });
      }
      await AttachmentService.removeFiles(refs);
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
