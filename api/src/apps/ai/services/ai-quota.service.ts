import { ErrorResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import type { SessionUser } from '@swiftslip/shared/types';
import { ActivityLogRepository } from '../../activity-log/repositories';

/**
 * Per-account and app-wide AI quota, counted from the activity log.
 *
 * There is no counter table: every successful AI call writes one `ai.request`
 * row, and the quota is a count over the last 24 hours. That keeps the limit
 * shared across processes and restarts — an in-memory counter would reset on
 * every deploy.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
/** How many AI calls one account may make in a rolling 24 hours. */
const PER_USER_LIMIT = 100;
/** Ceiling for the whole app, however many accounts are active. */
const GLOBAL_LIMIT = 1000;

class AiQuotaService {
  private readonly logs = new ActivityLogRepository();

  private async countRequests(since: string, actorId?: string) {
    try {
      return await this.logs.count({
        action: 'ai.request',
        created_at: { gte: since },
        ...(actorId ? { actor_id: actorId } : {}),
      });
    } catch (error) {
      // Fail open: a broken count must not take the AI features offline.
      logger.error('[ai-quota] could not count requests', error as Error);
      return 0;
    }
  }

  /** Throws an ErrorResponse when the caller has used up today's allowance. */
  async assert(user: SessionUser): Promise<void> {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const [mine, all] = await Promise.all([
      this.countRequests(since, user.id),
      this.countRequests(since),
    ]);

    if (mine >= PER_USER_LIMIT) {
      throw new ErrorResponse(
        'TOO_MANY_REQUESTS',
        "You've reached today's AI limit. Please try again tomorrow.",
      );
    }
    if (all >= GLOBAL_LIMIT) {
      throw new ErrorResponse(
        'TOO_MANY_REQUESTS',
        'The AI helper is at capacity right now. Please try again later.',
      );
    }
  }
}

export default new AiQuotaService();
