/**
 * The ONE database read the live-update watcher makes.
 *
 * `activity_logs` is the app's audit trail: every create / update / delete /
 * status change that goes through the API appends exactly one row there. Its
 * newest row is therefore a cheap stand-in for "did any screen's data change?"
 *
 * Optimization for Supabase free tier (Nano: 60 connections, 250 IOPS):
 * Instead of fetching the newest row's `id` (full HTTP response body + JSON
 * parse), we filter on `created_at > lastKnown` with `head: true`. PostgREST
 * translates `head: true` to a `SELECT count(*)` or exists probe, the response
 * has NO body, only a `Content-Range` header. This is the lightest possible
 * HTTP round-trip: no JSON payload, minimal wire bytes, one indexed scan.
 *
 * On first connect (`lastKnown` is null) we do one full probe to seed the
 * baseline so the client doesn't get a spurious "changed" on connect.
 *
 * Direct edits made in the Supabase dashboard do not append an audit row, so
 * they are picked up only on the next reconnect / tab focus. That is the
 * deliberate trade-off for a free-tier-safe signal: zero schema changes,
 * zero Realtime subscriptions, zero per-row listeners.
 */
import { ErrorResponse } from '../../../common/shared/utils/error';
import { getDb } from '../../../core/framework/databases/supabase';

export type ChangeSignal = {
  /** Identity of the newest audit row. Changes on every logged write. */
  id: string;
};

export class UpdatesRepository {
  /**
   * Seed probe: returns the newest row's id. Called once on connect to
   * establish a baseline. Uses a full (but tiny) select, one row, one column.
   */
  async latestChange(): Promise<ChangeSignal | null> {
    const { data, error } = await getDb()
      .from('activity_logs')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw new ErrorResponse('DATABASE_ERROR', error.message);
    const row = data?.[0];
    return row ? { id: row.id } : null;
  }

  /**
   * Incremental probe: returns true if any audit row exists newer than
   * `afterIso`. Uses `head: true` so PostgREST sends NO response body,
   * just a `Content-Range` header. This is the lightest possible check:
   * one indexed scan, zero payload bytes on the wire.
   *
   * Called every POLL_MS (60 s) as the backstop safety net.
   */
  async hasChangeSince(afterIso: string): Promise<boolean> {
    const { count, error } = await getDb()
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', afterIso);

    if (error) throw new ErrorResponse('DATABASE_ERROR', error.message);
    return (count ?? 0) > 0;
  }
}
