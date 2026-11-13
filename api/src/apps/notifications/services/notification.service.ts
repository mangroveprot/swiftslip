/**
 * The in-app notification bell.
 *
 * A notification belongs to ONE recipient. The API is the only reader/writer
 * (the service-role key bypasses RLS), so every query here is scoped to the
 * signed-in account, never to an id a caller passed in.
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
import { photoUrl } from '../../profile/services/photo-storage';
import { UpdatesService } from '../../updates/services';
import { NotificationRepository } from '../repositories';

export type NotifyInput = {
  /** Account ids (`users.id` = `profiles.access_code_id`) to notify. */
  recipients: string[];
  /** Who triggered it, for the row's provenance. */
  actorId?: string | null;
  kind: ObNotificationKind;
  title: string;
  body: string;
  /** Relative path inside this app, `/hr/ob/<id>` or `/official-business/<id>`. */
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
   * `actor_name`, `actor_position` and `actor_photo` are resolved here (one
   * extra read for the small set of actors in the list) because the table only
   * stores the actor id, the bell shows a face and a title, not an id.
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
            { select: 'access_code_id,full_name,designation,photo' },
          )
        : [];
      const byId = new Map(
        actors.map((actor) => [actor.access_code_id, actor] as const),
      );
      // One signed link per distinct actor, not per row: the same reviewer
      // appears on most of the list.
      const photos = new Map<string, string>();
      await Promise.all(
        actors.map(async (actor) => {
          const url = await photoUrl(actor.photo ?? '');
          if (url) photos.set(actor.access_code_id, url);
        }),
      );

      const documents: NotificationRow[] = rows.map((row) => {
        const actor = row.actor_id ? byId.get(row.actor_id) : undefined;
        return {
          id: row.id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          link: row.link,
          read_at: row.read_at,
          created_at: row.created_at,
          actor_name: actor?.full_name ?? null,
          actor_position: actor?.designation || null,
          actor_photo: row.actor_id ? (photos.get(row.actor_id) ?? null) : null,
        };
      });

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
      // No audit row is written for this, and nobody else's bell changed:
      // target only this account's other tabs.
      UpdatesService.publish({ audience: recipientId });
      return { success: true };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Delete the caller's own notifications, one row or a selection.
   *
   * `recipient_id` is part of the filter, so a guessed or forged id can only
   * ever match nothing — the caller can never delete somebody else's row.
   */
  async remove(
    recipientId: string,
    ids: string[],
  ): Promise<ServiceResponse<{ deleted: number }>> {
    try {
      const { deletedCount } = await this.repository.deleteMany({
        recipient_id: recipientId,
        id: ids,
      });
      // The badge count changed; refresh this account's other open tabs.
      if (deletedCount > 0) UpdatesService.publish({ audience: recipientId });
      return { success: true, document: { deleted: deletedCount } };
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
      // The activity log that accompanies the action publishes its signal
      // BEFORE this row exists, so a bell in another tab can refetch a
      // millisecond too early and miss the notification. Push it again now
      // that it is written, one targeted ping per recipient.
      for (const recipientId of recipients) {
        UpdatesService.publish({ audience: recipientId });
      }
    } catch (error) {
      logger.error('[notifications] could not write', error as Error);
    }
  }
}

export default new NotificationService();
