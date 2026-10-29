/**
 * The admin panel's audit trail: one best-effort row per notable action.
 * Writing a log must never break the action it describes — `log()` swallows
 * every failure and only reports it to the server log.
 */
import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { ACTION_LABELS } from '@swiftslip/shared/activity';
import {
  ACTIVITY_LOG_PAGE_SIZE,
  type ActivityLogActionFilter,
  type ActivityLogCounts,
  type ActivityLogFeed,
} from '@swiftslip/shared/schemas';
import type { SessionUser } from '@swiftslip/shared/types';
import { ActivityLogRepository } from '../repositories';
import type { ActivityEntry } from '../types';

/** Rows older than this are dropped by the table's trigger and by reads. */
const RETENTION_DAYS = 30;

/** Which actions each dashboard side-panel feed shows. */
const FORM_ACTIONS = [
  'ob.created',
  'ob.deleted',
  'loa.created',
  'loa.deleted',
  'cos.created',
  'cos.deleted',
  'ot.created',
  'ot.deleted',
  'record.created',
  'record.deleted',
  'attachment.uploaded',
  'attachment.removed',
  'asset.created',
  'asset.updated',
  'report.downloaded',
  'cleanup.forms',
];

const FEED_ACTIONS: Record<ActivityLogFeed, string[]> = {
  security: ['signin.success', 'signin.failed'],
  activity: [
    ...FORM_ACTIONS,
    // Admin-panel changes belong in Latest activity too.
    'user.created',
    'user.updated',
    'user.deleted',
    'access.updated',
    'org.updated',
  ],
};

/** Filter tokens → the `action` rows they cover (see activityLogActionFilter). */
const ACTION_GROUPS: Record<ActivityLogActionFilter, string[]> = {
  signin: ['signin.success'],
  'signin-failed': ['signin.failed'],
  access: ['access.updated'],
  accounts: ['user.created', 'user.updated', 'user.deleted'],
  records: [...FORM_ACTIONS, 'org.updated'],
};

type LogRange = { from?: string | undefined; to?: string | undefined };

class ActivityLogService extends BaseService<
  'activity_logs',
  ActivityLogRepository
> {
  constructor() {
    super(new ActivityLogRepository());
  }

  /** Append one row. Best effort — never throws. */
  async log(entry: ActivityEntry): Promise<void> {
    try {
      await this.repository.create({
        action: entry.action,
        actor_id: entry.actorId ?? null,
        actor_name: entry.actorName ?? null,
        actor_number: entry.actorNumber ?? null,
        target: entry.target ?? null,
        detail: entry.detail ?? null,
        ip: entry.ip ?? null,
      });
    } catch (error) {
      logger.error('[activity-log] could not write', error as Error);
    }
  }

  /** Log an action performed by a signed-in person. */
  logBy(
    actor: SessionUser,
    entry: Omit<ActivityEntry, 'actorId' | 'actorName' | 'actorNumber'>,
  ): Promise<void> {
    return this.log({
      ...entry,
      actorId: actor.id,
      actorName: actor.label,
      actorNumber: actor.idNumber,
    });
  }

  /**
   * Failed sign-ins inside the rolling window, per ID number and per IP.
   * Backed by `activity_logs` so the limit holds across restarts and instances.
   */
  async countRecentSignInFailures(
    actorNumber: string,
    ip: string,
    windowMinutes: number,
  ): Promise<ServiceResponse<{ byId: number; byIp: number }>> {
    try {
      const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
      const [byId, byIp] = await Promise.all([
        this.repository.count({
          action: 'signin.failed',
          actor_number: actorNumber,
          created_at: { gte: since },
        }),
        ip
          ? this.repository.count({
              action: 'signin.failed',
              ip,
              created_at: { gte: since },
            })
          : Promise.resolve(0),
      ]);
      return { success: true, document: { byId, byIp } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** Drop rows past the 30-day window before anyone can see them. */
  private pruneExpired() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    return this.repository.deleteMany({
      created_at: { lt: cutoff.toISOString() },
    });
  }

  /** The newest `limit` rows of one dashboard feed. */
  async feed(feed: ActivityLogFeed, limit: number) {
    try {
      await this.pruneExpired();
      const documents = await this.repository.findAll(
        { action: FEED_ACTIONS[feed] },
        { sort: { created_at: 'desc' }, limit },
      );
      return { success: true as const, documents, results: documents.length };
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /**
   * The category counts plus the total, for one date range. Counts ignore the
   * text search and active tab on purpose, so the tabs stay stable.
   */
  async counts(range: LogRange): Promise<ServiceResponse<ActivityLogCounts>> {
    try {
      const createdAt = {
        ...(range.from ? { gte: range.from } : {}),
        ...(range.to ? { lt: range.to } : {}),
      };
      const countFor = (actions?: string[]) =>
        this.repository.count({
          ...(actions ? { action: actions } : {}),
          ...(Object.keys(createdAt).length ? { created_at: createdAt } : {}),
        });

      const [all, signin, signinFailed, access, accounts, records] =
        await Promise.all([
          countFor(),
          countFor(ACTION_GROUPS.signin),
          countFor(ACTION_GROUPS['signin-failed']),
          countFor(ACTION_GROUPS.access),
          countFor(ACTION_GROUPS.accounts),
          countFor(ACTION_GROUPS.records),
        ]);

      return {
        success: true,
        document: {
          all,
          signin,
          'signin-failed': signinFailed,
          access,
          accounts,
          records,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** One filtered page of the log: text search, date range, newest first. */
  async search(filters: {
    search: string;
    action?: ActivityLogActionFilter | undefined;
    from?: string | undefined;
    to?: string | undefined;
    page: number;
  }) {
    try {
      await this.pruneExpired();

      // Commas / percent / parens are PostgREST `or=` syntax — drop them.
      const term = filters.search
        .replace(/[,%()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // "signed in", "approval slip"… The raw action names are machine keys,
      // so also match the labels the UI actually shows.
      let labelActions: string[] = [];
      if (term.length >= 3) {
        const lowered = term.toLowerCase();
        const tokens = lowered.split(/\s+/).filter(Boolean);
        labelActions = Object.entries(ACTION_LABELS)
          .filter(([, label]) => {
            const text = label.toLowerCase();
            return (
              text.includes(lowered) || tokens.every((t) => text.includes(t))
            );
          })
          .map(([action]) => action);
      }

      const { rows, count } = await this.repository.page({
        term,
        labelActions,
        offset: (filters.page - 1) * ACTIVITY_LOG_PAGE_SIZE,
        limit: ACTIVITY_LOG_PAGE_SIZE,
        ...(filters.action ? { actions: ACTION_GROUPS[filters.action] } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      });

      return {
        success: true as const,
        documents: rows,
        total: count,
        results: rows.length,
        page: filters.page,
        limit: ACTIVITY_LOG_PAGE_SIZE,
      };
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }
}

export default new ActivityLogService();
