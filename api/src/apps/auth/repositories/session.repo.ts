import { BaseRepository } from '../../../core/engine';

/**
 * Sign-in sessions: one row per device.
 *
 * The cookie carries a random session id; the row keeps only its sha256, so a
 * copy of this table cannot be replayed as a signed-in session. Rows go away
 * when the session is revoked (sign-out, admin action) or when an account is
 * deleted (the foreign key cascades).
 */
export class SessionRepository extends BaseRepository<'sessions'> {
  constructor() {
    super('sessions');
  }

  /** The row a cookie names, or null. Expiry is the caller's check. */
  findByTokenHash(tokenHash: string) {
    return this.findOne({ token_hash: tokenHash });
  }

  /** Sessions that have not run out, most recently used first. */
  live(now = new Date()) {
    return this.findAll(
      { expires_at: { gt: now.toISOString() } },
      { sort: { last_seen_at: 'desc' } },
    );
  }

  /**
   * Drop rows that have already expired. Called after a successful sign-in:
   * the only moment the table is guaranteed some traffic, and cheap enough at
   * this size for a housekeeping step.
   */
  pruneExpired(now = new Date()) {
    return this.deleteMany({ expires_at: { lt: now.toISOString() } });
  }
}
