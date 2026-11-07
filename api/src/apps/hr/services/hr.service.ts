/**
 * HR approval for Official Business forms.
 *
 * SCOPE — Official Business only (HR_APPROVAL_SPEC.md §1). LOA / COS / OT / DTR
 * keep their existing flows.
 *
 * The employee hands a form over with `POST /official-business/:id/submit`;
 * this module owns everything after that. Every transition re-reads the row and
 * checks the current state, so two reviewers acting at the same time cannot
 * skip a step: the second call sees the new state and is refused.
 */
import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import type {
  HrObDetail,
  HrObSummary,
  ObEmployeeProfile,
} from '@swiftslip/shared/api-types';
import {
  HR_DEPARTMENT,
  obSupervisorDone,
  type ObHrStatus,
  type ObResubmitEvent,
} from '@swiftslip/shared/hr';
import type { ObEntry, ObForm, SessionUser } from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { NotificationService } from '../../notifications';
import { OrgPositionRepository } from '../../org-options/repositories';
import { ProfileRepository } from '../../profile/repositories';
import { photoUrl } from '../../profile/services/photo-storage';
import { ObEntryRepository } from '../../official-business/repositories';
import {
  resolveObResubmitReviewers,
  resolveObSigners,
} from '../../official-business/utils/ob-signers';
import FileStorageService from '../../storage/services/file-storage.service';
import { backendOf } from '../../storage/utils/backend';
import { HrObRepository } from '../repositories';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

/** States that are not drafts — what the HR queue shows. */
const QUEUE_STATUSES: ObHrStatus[] = [
  'submitted',
  'waiting_supervisor',
  'approved',
  'rejected',
  'departed',
  'completed',
];

type ObRow = Awaited<ReturnType<HrObRepository['findOne']>>;

/** Shape the DB row as the employee form + HR columns the shared types expect. */
function asDetail(form: NonNullable<ObRow>, entries: ObEntry[]): HrObDetail {
  return {
    form: form as unknown as ObForm & HrObDetail['form'],
    entries: entries as unknown as ObEntry[],
    ...(form.attachment_name
      ? { attachment: { name: form.attachment_name } }
      : {}),
  };
}

class HrService extends BaseService<'ob_forms', HrObRepository> {
  private readonly entries = new ObEntryRepository();
  private readonly profiles = new ProfileRepository();
  private readonly positions = new OrgPositionRepository();

  constructor() {
    super(new HrObRepository());
  }

  /**
   * Everyone who should see HR notifications: profiles filed under the HR
   * department, plus anyone holding a position that sits under it. Read from
   * the admin-maintained org lists so a new HR position needs no code change.
   */
  async hrRecipients(excludeId?: string | null): Promise<string[]> {
    try {
      const [positions, byDepartment] = await Promise.all([
        this.positions.findAll(
          { department: HR_DEPARTMENT },
          { select: 'value' },
        ),
        this.profiles.findAll(
          { department: HR_DEPARTMENT },
          { select: 'access_code_id' },
        ),
      ]);

      const positionValues = positions.map((position) => position.value);
      const byPosition = positionValues.length
        ? await this.profiles.findAll(
            { designation: positionValues },
            { select: 'access_code_id' },
          )
        : [];

      const ids = new Set<string>();
      for (const profile of [...byDepartment, ...byPosition]) {
        const id = profile.access_code_id;
        if (id && id !== excludeId) ids.add(id);
      }
      return [...ids];
    } catch {
      // A missing org list must never block the approval itself.
      return [];
    }
  }

  /**
   * Profile pictures for a set of accounts, keyed by account id and already
   * signed for this response. Best effort: a profile row that is missing (or
   * a storage hiccup) just leaves the map short, and the queue falls back to
   * initials rather than failing to load.
   */
  private async photoMap(ownerIds: string[]): Promise<Map<string, string>> {
    const photos = new Map<string, string>();
    if (!ownerIds.length) return photos;
    try {
      const rows = await this.profiles.findAll(
        { access_code_id: ownerIds },
        { select: 'access_code_id,photo' },
      );
      await Promise.all(
        rows.map(async (row) => {
          const url = await photoUrl(row.photo ?? '');
          if (url) photos.set(row.access_code_id, url);
        }),
      );
    } catch {
      // A missing profile must never blank the queue.
    }
    return photos;
  }

  /**
   * The employee behind a form, for the detail page's profile banner: the face
   * plus the org facts the sheet has no box for (office, supervisor) and their
   * newest OB forms — so a reviewer sees who they are reviewing, not four
   * denormalised cells. Null when the form has no owner profile to resolve.
   */
  private async employeeProfile(
    form: NonNullable<ObRow>,
  ): Promise<ObEmployeeProfile | null> {
    if (!form.owner_id) return null;
    try {
      const [profile, recent] = await Promise.all([
        this.profiles.findOne({ access_code_id: form.owner_id }),
        this.repository.findAll(
          { owner_id: form.owner_id },
          {
            select: 'id,date_of_ob,hr_status,updated_at',
            sort: { updated_at: 'desc' },
            limit: 5,
          },
        ),
      ]);
      return {
        photo: await photoUrl(profile?.photo ?? ''),
        full_name: profile?.full_name || form.employee_name,
        emp_no: profile?.emp_no || form.id_number,
        department: profile?.department || form.department,
        position: profile?.designation || form.position,
        area: profile?.area ?? '',
        supervisor: profile?.supervisor || form.approved_by,
        recent: recent.map((row) => ({
          id: row.id,
          date_of_ob: row.date_of_ob,
          hr_status: row.hr_status as ObHrStatus,
          updated_at: row.updated_at,
        })),
      };
    } catch {
      return null;
    }
  }

  /** The queue: every submitted / waiting-supervisor / approved / rejected /
   *  departed / completed form (drafts excluded). */
  async list(): Promise<ServiceResponse<HrObSummary>> {
    try {
      const forms = await this.repository.findAll(
        { hr_status: QUEUE_STATUSES },
        {
          // `owner_id` is how the employee's picture resolves; `resubmit_count`
          // and `resubmit_history` are what the row says under its status when
          // the form has been here before.
          select:
            'id,owner_id,employee_name,id_number,department,position,date_of_ob,attachment_approved,approved_by,hr_status,resubmit_count,resubmit_history,updated_at',
          sort: { updated_at: 'desc' },
        },
      );
      if (!forms.length) return { success: true, documents: [] };

      const photos = await this.photoMap([
        ...new Set(
          forms
            .map((form) => form.owner_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ]);

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

      const documents: HrObSummary[] = forms.map((form) => ({
        id: form.id,
        employee_name: form.employee_name,
        id_number: form.id_number,
        department: form.department,
        position: form.position,
        date_of_ob: form.date_of_ob,
        attachment_approved: form.attachment_approved,
        approved_by: form.approved_by,
        hr_status: form.hr_status as ObHrStatus,
        destinations: destinations.get(form.id) ?? [],
        updated_at: form.updated_at,
        resubmit_count: form.resubmit_count ?? 0,
        resubmit_history: (form.resubmit_history ?? []) as ObResubmitEvent[],
        employee_photo: form.owner_id
          ? (photos.get(form.owner_id) ?? null)
          : null,
      }));
      return { success: true, documents };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** Full detail for the reviewer — any owner's form, never scoped by owner. */
  async get(id: string): Promise<ServiceResponse<HrObDetail>> {
    try {
      const form = await this.repository.findOne({ id });
      if (!form) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      const entries = await this.entries.findAll(
        { form_id: id },
        {
          select: 'idx,from_place,to_place,purpose,time_departure,time_return',
          sort: { idx: 'asc' },
        },
      );
      // The sheet prints names + signatures, but the row only stores ids.
      // The profile banner reads the same owner row, in one parallel call. The
      // old rejection's reviewer is resolved from `resubmit_history` too —
      // the live columns were cleared when the form came back.
      const [signers, employee, resubmitHistory] = await Promise.all([
        resolveObSigners(form),
        this.employeeProfile(form),
        resolveObResubmitReviewers(
          (form.resubmit_history ?? []) as ObResubmitEvent[],
        ),
      ]);
      const detail = asDetail(form, entries);
      return {
        success: true,
        document: {
          ...detail,
          form: { ...detail.form, resubmit_history: resubmitHistory },
          signers,
          employee,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Signed link to the supervisor's approval slip. HR is not the row's owner,
   * so the employee attachment endpoint cannot serve this; the HR route is
   * gated by `requireApp('hr')` instead. The link keeps the storage provider's
   * own TTL (B2 signs for five minutes, Supabase for an hour).
   */
  async attachmentUrl(
    id: string,
  ): Promise<ServiceResponse<{ url: string; name: string }>> {
    try {
      const form = await this.repository.findOne({ id });
      if (!form) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
      const row = form as typeof form & {
        attachment_path: string | null;
        attachment_name: string | null;
        attachment_backend: string | null;
      };
      if (!row.attachment_path) return { success: true };
      const url = await FileStorageService.requireSignedUrl(
        row.attachment_path,
        backendOf(row.attachment_backend),
      );
      return {
        success: true,
        document: { url, name: row.attachment_name ?? 'attachment' },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `submitted → waiting_supervisor | approved`. The supervisor indicator never
   * blocks the approval itself (D3): if the supervisor has not signed yet, the
   * form parks in `waiting_supervisor` and the employee's next save (with the
   * signature in place) moves it to `approved` — no second HR approval needed.
   */
  async approve(
    actor: SessionUser,
    id: string,
  ): Promise<ServiceResponse<never>> {
    try {
      const form = await this.requireState(id, 'submitted', 'approved');
      const supervisorDone = obSupervisorDone(form);
      const next: ObHrStatus = supervisorDone
        ? 'approved'
        : 'waiting_supervisor';
      const now = new Date().toISOString();
      await this.repository.update(
        { id },
        {
          hr_status: next,
          hr_approved_by: actor.id,
          hr_approved_at: now,
          hr_reject_reason: '',
          hr_rejected_at: null,
          hr_rejected_by: null,
          updated_at: now,
        },
      );

      await ActivityLogService.logBy(actor, {
        action: 'ob.hr_approved',
        target: `${form.employee_name || actor.label} (${form.id_number || actor.idNumber})`,
        detail: `Form ${id}${supervisorDone ? '' : ' (waiting for supervisor)'}`,
      });
      await NotificationService.notify({
        recipients: form.owner_id ? [form.owner_id] : [],
        actorId: actor.id,
        kind: 'ob_approved',
        title: 'Official Business approved',
        body: supervisorDone
          ? `HR approved your OB form${form.date_of_ob ? ` for ${form.date_of_ob}` : ''}.`
          : `HR approved your OB form${form.date_of_ob ? ` for ${form.date_of_ob}` : ''}. HR can sign your departure now; completion still needs your supervisor's approval.`,
        link: `/official-business/${id}`,
      });
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `submitted → rejected`, reason required. The employee can edit and resubmit. */
  async reject(
    actor: SessionUser,
    id: string,
    reason: string,
  ): Promise<ServiceResponse<never>> {
    try {
      const form = await this.requireState(id, 'submitted', 'rejected');
      const now = new Date().toISOString();
      await this.repository.update(
        { id },
        {
          hr_status: 'rejected',
          hr_reject_reason: reason.trim(),
          hr_rejected_at: now,
          hr_rejected_by: actor.id,
          updated_at: now,
        },
      );

      await ActivityLogService.logBy(actor, {
        action: 'ob.hr_rejected',
        target: `${form.employee_name || actor.label} (${form.id_number || actor.idNumber})`,
        detail: reason.trim(),
      });
      await NotificationService.notify({
        recipients: form.owner_id ? [form.owner_id] : [],
        actorId: actor.id,
        kind: 'ob_rejected',
        title: 'Official Business rejected',
        body: reason.trim(),
        link: `/official-business/${id}`,
      });
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `approved | waiting_supervisor → departed`. HR signs the employee out (D7).
   * Departure only needs HR's approval: the supervisor gate is on completion,
   * not on leaving the office.
   */
  async signDeparture(
    actor: SessionUser,
    id: string,
    input: {
      date: string;
      time: string;
      residence: string;
      destination: string;
    },
  ): Promise<ServiceResponse<never>> {
    try {
      const form = await this.requireState(
        id,
        ['approved', 'waiting_supervisor'],
        'departed',
      );
      const now = new Date().toISOString();
      await this.repository.update(
        { id },
        {
          hr_status: 'departed',
          departure_date: input.date.trim(),
          departure_time: input.time.trim(),
          residence: input.residence.trim(),
          destination: input.destination.trim(),
          departure_signed_by: actor.id,
          departure_signed_at: now,
          updated_at: now,
        },
      );

      await ActivityLogService.logBy(actor, {
        action: 'ob.departure_signed',
        target: `${form.employee_name || actor.label} (${form.id_number || actor.idNumber})`,
        detail: `${input.date} ${input.time}`.trim(),
      });
      await NotificationService.notify({
        recipients: form.owner_id ? [form.owner_id] : [],
        actorId: actor.id,
        kind: 'ob_departure_signed',
        title: 'Official Business departure signed',
        body: `HR signed you out${input.date ? ` on ${input.date}` : ''}${input.time ? ` at ${input.time}` : ''}.`,
        link: `/official-business/${id}`,
      });
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `departed → completed`. HR signs the employee back in. Completion needs
   * both approvals, so a departed form whose supervisor has not signed is
   * refused here. No bell event: the user did not ask for an arrival
   * notification (D8).
   */
  async signArrival(
    actor: SessionUser,
    id: string,
    input: { date: string; time: string },
  ): Promise<ServiceResponse<never>> {
    try {
      const form = await this.requireState(id, 'departed', 'completed');
      if (!obSupervisorDone(form)) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'The supervisor must approve this form before it can be completed.',
        );
      }
      const now = new Date().toISOString();
      await this.repository.update(
        { id },
        {
          hr_status: 'completed',
          arrival_date: input.date.trim(),
          arrival_time: input.time.trim(),
          arrival_signed_by: actor.id,
          arrival_signed_at: now,
          updated_at: now,
        },
      );

      await ActivityLogService.logBy(actor, {
        action: 'ob.arrival_signed',
        target: `${form.employee_name || actor.label} (${form.id_number || actor.idNumber})`,
        detail: `${input.date} ${input.time}`.trim(),
      });
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Read the row and refuse a transition the state machine does not allow.
   * Returning the row keeps the caller from reading it twice.
   */
  private async requireState(
    id: string,
    expected: ObHrStatus | ObHrStatus[],
    next: ObHrStatus,
  ) {
    const form = await this.repository.findOne({ id });
    if (!form) throw new ErrorResponse('NOT_FOUND_ERROR', 'Form not found.');
    const current = form.hr_status as ObHrStatus;
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.includes(current)) {
      throw new ErrorResponse(
        'BAD_REQUEST',
        `This form is ${current}; it can only be ${next} from ${allowed.join(' or ')}.`,
      );
    }
    return form;
  }
}

export default new HrService();
