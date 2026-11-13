import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import {
  departmentForPosition,
  departmentWithLocation,
} from '@swiftslip/shared/org';
import {
  isObLocked,
  latestObResubmit,
  obSupervisorDone,
  type ObFormContent,
  type ObHrFields,
  type ObHrStatus,
  type ObResubmitEvent,
  type ObResubmitHrSnapshot,
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

/**
 * The employee-written part of a form, as the pending/previous content columns
 * store it. HR-owned columns are deliberately left out so restoring a draft can
 * never resurrect a status or sign-off that did not belong to that version.
 */
function editableContent(form: ObForm): ObForm {
  return {
    id_number: form.id_number ?? '',
    employee_name: form.employee_name ?? '',
    department: form.department ?? '',
    position: form.position ?? '',
    date_filed: form.date_filed ?? '',
    date_of_ob: form.date_of_ob ?? '',
    approved_by: form.approved_by ?? '',
    approved_via_viber: form.approved_via_viber ?? false,
    employee_signature: form.employee_signature ?? '',
    attachment_approved: form.attachment_approved ?? false,
  };
}

/** A live row with one stored content version laid over its employee fields. */
function withContent<T extends ObForm>(live: T, content: ObFormContent): T {
  return { ...live, ...editableContent(content.form) };
}

/** True for the states where HR has already approved the form's content. */
function isPostApproval(status: ObHrStatus): boolean {
  return (
    status === 'approved' ||
    status === 'departed' ||
    status === 'completed' ||
    status === 'waiting_supervisor'
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
   * The itinerary as the submit check reads it, every persisted stop, in
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
            'id,employee_name,id_number,department,position,date_of_ob,attachment_approved,attachment_path,date_filed,hr_status,resubmit_count,resubmit_history,pending_content,created_at,updated_at',
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
        forms.map((form) => {
          // The blob itself never leaves the API; the card only needs to know
          // that a saved edit is waiting to go back to HR.
          const { pending_content, ...rest } = form;
          return {
            ...rest,
            destinations: destinations.get(form.id) ?? [],
            pending_changes: pending_content !== null,
          };
        }),
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
      // An edit made after HR approved is held as a draft: the employee sees
      // their draft, while the live row (and HR's queue) keeps the approved
      // version. HR-owned columns still come from the live row.
      const pending = (form.pending_content ?? null) as ObFormContent | null;
      // Both content blobs are internal (they carry a full signature each), so
      // they never travel to the browser; only the effective content does.
      const effective = pending
        ? withContent(form as unknown as ObForm, pending)
        : ({ ...form } as unknown as ObForm);
      const formOut = effective as unknown as Record<string, unknown>;
      delete formOut.pending_content;
      delete formOut.previous_content;
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
            ...(effective as unknown as ObForm & ObHrFields & { id: string }),
            resubmit_history: resubmitHistory,
          },
          entries: (pending
            ? pending.entries
            : entries) as unknown as ObEntry[],
          pending_changes: Boolean(pending),
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
  ): Promise<
    ServiceResponse<{ hr_status: ObHrStatus; pending_changes: boolean }>
  > {
    try {
      const ownerId = user.id;
      // Only the state that is actually in HR's queue is locked (D6), check
      // before writing, not after, so an auto-save cannot overwrite it. An
      // approved / departed / completed form is editable again; a content edit
      // on one of those is held as a draft and never touches the version HR
      // reviewed.
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

      // The live row is the version HR last reviewed. Compare the incoming save
      // with THAT, not with the employee's own draft: the draft is what they are
      // editing, so it would always look unchanged.
      const liveForm = current as unknown as ObForm;
      const liveEntries = await this.readEntries(id);
      const contentChanged =
        contentSignature(liveForm) !== contentSignature(form) ||
        entriesSignature(liveEntries) !== entriesSignature(entries);

      const now = new Date().toISOString();
      // The supervisor half is not content HR reviews: recording it is always a
      // live write, even while the rest of the form waits as a draft.
      const attachmentApproved = form.attachment_approved ?? false;
      const supervisorApprovedNow =
        !current.attachment_approved && attachmentApproved;
      const supervisorColumns = {
        approved_by: form.approved_by,
        approved_via_viber: form.approved_via_viber,
        attachment_approved: attachmentApproved,
        ...(supervisorApprovedNow ? { supervisor_approved_at: now } : {}),
      };
      // HR approved but the supervisor had not signed yet: completing the
      // supervisor half moves the form to "Ready for departure" without asking
      // HR to approve the same content twice.
      const supervisorDone =
        currentStatus === 'waiting_supervisor' && obSupervisorDone(form);

      // HR already reviewed this content, so a content edit is a draft: the
      // live row (and HR's queue) keeps the approved version until the employee
      // presses "Resubmit to HR". A supervisor-only save still lands live.
      if (isPostApproval(currentStatus) && contentChanged) {
        await this.repository.update(
          { id, owner_id: ownerId },
          {
            ...supervisorColumns,
            pending_content: {
              form: editableContent(form),
              entries,
            },
            updated_at: now,
          },
        );
        return {
          success: true,
          document: { hr_status: currentStatus, pending_changes: true },
        };
      }

      if (isPostApproval(currentStatus)) {
        // No content change: only supervisor fields moved (or the employee put
        // the form back the way HR approved it). Drop a draft they reverted.
        const nextStatus: ObHrStatus = supervisorDone
          ? 'approved'
          : currentStatus;
        await this.repository.update(
          { id, owner_id: ownerId },
          {
            ...supervisorColumns,
            ...(current.pending_content ? { pending_content: null } : {}),
            hr_status: nextStatus,
            updated_at: now,
          },
        );
        if (supervisorDone) {
          // The employee completed their supervisor's half while the form was
          // parked as waiting_supervisor; it is now "Ready for departure" and
          // HR can sign the employee out. Log it so the live-update signal
          // refreshes any HR screen showing this form, and tell HR it is
          // actionable.
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
        return {
          success: true,
          document: { hr_status: nextStatus, pending_changes: false },
        };
      }

      // draft / rejected, HR has not approved this content yet (or has just
      // rejected it), so the ordinary save writes the live row.
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
          hr_status: currentStatus,
          updated_at: now,
          ...(supervisorApprovedNow ? { supervisor_approved_at: now } : {}),
          // A leftover draft from an earlier approved state must not shadow
          // content that now lives on the row.
          pending_content: null,
          previous_content: null,
        },
      );
      if (!updated)
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');

      // Replace the itinerary wholesale.
      await this.entries.deleteMany({ form_id: id });
      await this.entries.createMany(
        entries.map((entry) => ({ ...entry, form_id: id })),
      );

      return {
        success: true,
        document: { hr_status: currentStatus, pending_changes: false },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `draft | rejected → submitted` hands a new form to HR. An approved /
   * departed / completed / waiting-for-supervisor form goes back only when it
   * has a draft (`pending_content`): the draft becomes the live content HR
   * reviews, while the version it approved is stashed in `previous_content` so
   * the resubmission can still be withdrawn.
   *
   * A resubmission notifies HR with its own event so the queue can tell a new
   * form from one that came back (D5). The reject reason is cleared because it
   * no longer describes the form.
   */
  async submit(user: SessionUser, id: string): Promise<ServiceResponse<never>> {
    try {
      const form = await this.repository.findOne({ id, owner_id: user.id });
      if (!form) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');

      const current = form.hr_status as ObHrStatus;
      const pending = (form.pending_content ?? null) as ObFormContent | null;
      const postApproval = isPostApproval(current);
      if (current === 'submitted') {
        throw new ErrorResponse(
          'FORM_LOCKED',
          'This form is already with HR and cannot be submitted again.',
        );
      }
      if (!postApproval && current !== 'draft' && current !== 'rejected') {
        throw new ErrorResponse(
          'FORM_LOCKED',
          'This form cannot be submitted.',
        );
      }
      if (postApproval && !pending) {
        throw new ErrorResponse(
          'VALIDATION_ERROR',
          'There are no unsent changes to send to HR.',
        );
      }

      const liveForm = form as unknown as ObForm;
      const liveEntries = await this.readEntries(id);
      // A resubmit sends the employee's draft; a first submit (or one after a
      // rejection) sends what is already on the row.
      const effectiveForm = pending ? withContent(liveForm, pending) : liveForm;
      const effectiveEntries = pending ? pending.entries : liveEntries;

      // The asterisks are enforced here, not only in the editor: a stale tab,
      // a resubmit of a half-fixed rejection or a direct POST must not hand HR
      // a form the paper sheet would not accept (shared list = one meaning of
      // "required" for the highlight and this check).
      const missing = obMissingRequiredFields(effectiveForm, effectiveEntries);
      if (missing.length) {
        throw new ErrorResponse(
          'REQUIRED_FIELD_MISSING',
          obRequiredMessage(missing),
          missing.map((field) => field.label),
        );
      }

      const resubmitted = current === 'rejected' || postApproval;
      const history = (form.resubmit_history ?? []) as ObResubmitEvent[];
      // What HR last reviewed is the previous snapshot; the diff is
      // snapshot → the content now being sent.
      const snapshot = obSubmitSnapshot(effectiveForm, effectiveEntries);
      const changes = obResubmitChanges(
        (form.submit_snapshot ?? null) as ObSubmitSnapshot | null,
        snapshot,
      );
      const now = new Date().toISOString();

      if (postApproval) {
        // Keep the approved version so a cancel can put it back, then make the
        // draft the live content HR will review.
        const previous: ObFormContent = {
          form: editableContent(liveForm),
          entries: liveEntries,
        };
        const hrSnapshot: ObResubmitHrSnapshot = {
          hr_approved_by: form.hr_approved_by ?? null,
          hr_approved_at: form.hr_approved_at ?? null,
          departure_date: form.departure_date ?? '',
          departure_time: form.departure_time ?? '',
          departure_signed_by: form.departure_signed_by ?? null,
          departure_signed_at: form.departure_signed_at ?? null,
          residence: form.residence ?? '',
          destination: form.destination ?? '',
          arrival_date: form.arrival_date ?? '',
          arrival_time: form.arrival_time ?? '',
          arrival_signed_by: form.arrival_signed_by ?? null,
          arrival_signed_at: form.arrival_signed_at ?? null,
          supervisor_approved_at: form.supervisor_approved_at ?? null,
        };
        await this.repository.update(
          { id, owner_id: user.id },
          {
            ...editableContent(effectiveForm),
            hr_status: 'submitted',
            submitted_at: now,
            updated_at: now,
            submit_snapshot: snapshot,
            pending_content: null,
            previous_content: previous,
            resubmit_count: (form.resubmit_count ?? 0) + 1,
            resubmit_history: [
              ...history,
              {
                at: now,
                how: 'edited' as const,
                from_status: current,
                previous_submitted_at: form.submitted_at ?? null,
                hr: hrSnapshot,
                ...(changes.length ? { changes } : {}),
              },
            ],
            hr_reject_reason: '',
            hr_rejected_at: null,
            hr_rejected_by: null,
            // The content those sign-offs covered is no longer live.
            hr_approved_by: null,
            hr_approved_at: null,
            departure_signed_by: null,
            departure_signed_at: null,
            arrival_date: '',
            arrival_time: '',
            arrival_signed_by: null,
            arrival_signed_at: null,
          },
        );
        // Replace the itinerary with the draft HR is about to review.
        await this.entries.deleteMany({ form_id: id });
        await this.entries.createMany(
          effectiveEntries.map((entry) => ({ ...entry, form_id: id })),
        );
      } else {
        const previousReason = (form.hr_reject_reason ?? '').trim();
        const previousRejectedAt = form.hr_rejected_at ?? null;
        const previousRejectedBy = form.hr_rejected_by ?? null;
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
            pending_content: null,
            previous_content: null,
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
      }

      await ActivityLogService.logBy(user, {
        action: 'ob.submitted',
        target: `${effectiveForm.employee_name || user.label} (${effectiveForm.id_number || user.idNumber})`,
        detail: `Form ${id}${resubmitted ? ' (resubmitted)' : ''}`,
      });
      await NotificationService.notify({
        recipients: await HrService.hrRecipients(user.id),
        actorId: user.id,
        kind: resubmitted ? 'ob_resubmitted' : 'ob_submitted',
        title: resubmitted
          ? 'Official Business resubmitted'
          : 'New Official Business request',
        body: `${effectiveForm.employee_name || user.label} ${resubmitted ? 'resubmitted' : 'submitted'} an OB form${effectiveForm.date_of_ob ? ` for ${effectiveForm.date_of_ob}` : ''}.`,
        link: `/hr/ob/${id}`,
      });
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Withdraw an edited form from HR's queue. HR gets back the exact version
   * (and sign-offs) it approved; the employee keeps the content they sent as an
   * unsent draft, so nothing they typed is lost.
   */
  async cancelResubmit(
    user: SessionUser,
    id: string,
  ): Promise<ServiceResponse<never>> {
    try {
      const form = await this.repository.findOne({ id, owner_id: user.id });
      if (!form) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      if (form.hr_status !== 'submitted') {
        throw new ErrorResponse(
          'FORM_LOCKED',
          'Only a form that is waiting for HR can be withdrawn.',
        );
      }

      const history = (form.resubmit_history ?? []) as ObResubmitEvent[];
      const latest = latestObResubmit(history);
      const previous = (form.previous_content ?? null) as ObFormContent | null;
      if (
        !latest ||
        latest.how !== 'edited' ||
        !latest.from_status ||
        !previous
      ) {
        throw new ErrorResponse(
          'VALIDATION_ERROR',
          'This submission cannot be withdrawn.',
        );
      }

      const liveForm = form as unknown as ObForm;
      const liveEntries = await this.readEntries(id);
      // The content that was just sent becomes the employee's draft again.
      const draft: ObFormContent = {
        form: editableContent(liveForm),
        entries: liveEntries,
      };
      const now = new Date().toISOString();
      await this.repository.update(
        { id, owner_id: user.id },
        {
          ...editableContent(previous.form),
          hr_status: latest.from_status,
          submitted_at: latest.previous_submitted_at ?? null,
          updated_at: now,
          // The baseline HR last reviewed is the version being restored.
          submit_snapshot: obSubmitSnapshot(previous.form, previous.entries),
          pending_content: draft,
          previous_content: null,
          resubmit_count: Math.max(0, (form.resubmit_count ?? 0) - 1),
          resubmit_history: history.slice(0, -1),
          ...(latest.hr ?? {}),
        },
      );
      await this.entries.deleteMany({ form_id: id });
      await this.entries.createMany(
        previous.entries.map((entry) => ({ ...entry, form_id: id })),
      );

      await ActivityLogService.logBy(user, {
        action: 'ob.resubmit_cancelled',
        target: `${liveForm.employee_name || user.label} (${liveForm.id_number || user.idNumber})`,
        detail: `Form ${id} (withdrawn from HR review)`,
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
      // Any owner may delete their own form in any state, including a
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
