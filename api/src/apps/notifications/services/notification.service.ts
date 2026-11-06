/**
 * The in-app notification bell.
 *
 * A notification belongs to ONE recipient. The API is the only reader/writer
 * (the service-role key bypasses RLS), so every query here is scoped to the
 * signed-in account — never to an id a caller passed in.
 *
 * Writing a notification is best effort, like the activity log: a bell event
 * must never break the action that produced it.
 */
import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import type { NotificationRow } from '@swiftslip/shared/api-types';
import type { ObNotificationKind } from '@swiftslip/shared/hr';
import { ProfileRepository } from '../../profile/repositories';
import { NotificationRepository } from '../repositories';

export type NotifyInput = {
  /** Account ids (`users.id` = `profiles.access_code_id`) to notify. */
  recipients: string[];
  /** Who triggered it, for the row's provenance. */
  actorId?: string | null;
  kind: ObNotificationKind;
  title: string;
  body: string;
  /** Relative path inside this app — `/hr/ob/<id>` or `/official-business/<id>`. */
  link: string;
};

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

/**
 * The list answer carries two different shapes on purpose: `document` is the
 * unread count the bell badge needs, `documents` is the rows themselves.
 */
type NotificationListDocument = { unread: number } | NotificationRow;

class NotificationService extends BaseService<
  'notifications',
  NotificationRepository
> {
  private readonly profiles = new ProfileRepository();

  constructor() {
    super(new NotificationRepository());
  }

  /**
   * The caller's newest notifications plus the unread count.
   *
   * `actor_name` is resolved here (one extra read for the small set of actors
   * in the list) because the table only stores the actor id.
   */
  async list(
    recipientId: string,
  ): Promise<ServiceResponse<NotificationListDocument>> {
    try {
      const [rows, unread] = await Promise.all([
        this.repository.findAll(
          { recipient_id: recipientId },
          { sort: { created_at: 'desc' }, limit: 50 },
        ),
        this.repository.count({ recipient_id: recipientId, read_at: null }),
      ]);

      const actorIds = [
        ...new Set(
          rows
            .map((row) => row.actor_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const actors = actorIds.length
        ? await this.profiles.findAll(
            { access_code_id: actorIds },
            { select: 'access_code_id,full_name' },
          )
        : [];
      const names = new Map(
        actors.map((actor) => [actor.access_code_id, actor.full_name] as const),
      );

      const documents: NotificationRow[] = rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        link: row.link,
        read_at: row.read_at,
        created_at: row.created_at,
        actor_name: row.actor_id ? (names.get(row.actor_id) ?? null) : null,
      }));

      return { success: true, document: { unread }, documents };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** Mark every unread notification of the caller as read. */
  async markAllRead(recipientId: string): Promise<ServiceResponse<never>> {
    try {
      await this.repository.updateMany(
        { recipient_id: recipientId, read_at: null },
        { read_at: new Date().toISOString() },
      );
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Write one row per recipient. Best effort: a failed insert is logged and
   * swallowed so it cannot fail the submit / approve / reject it describes.
   */
  async notify(input: NotifyInput): Promise<void> {
    const recipients = [
      ...new Set(input.recipients.filter((id) => Boolean(id))),
    ];
    if (!recipients.length) return;
    try {
      await this.repository.createMany(
        recipients.map((recipientId) => ({
          recipient_id: recipientId,
          actor_id: input.actorId ?? null,
          kind: input.kind,
          title: input.title,
          body: input.body,
          link: input.link,
        })),
      );
    } catch (error) {
      logger.error('[notifications] could not write', error as Error);
    }
  }
}

export default new NotificationService();
