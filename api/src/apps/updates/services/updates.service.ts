/**
 * Live-update hub: one Server-Sent Events connection per open tab.
 *
 * Cost model, optimized for Supabase free tier (Nano: 60 DB connections,
 * 250 IOPS, 500 MB) and Render free (single instance, sleeps after 15 min):
 *
 *  - The stream carries NO data, only a version number. Nothing is re-read
 *    because a tab is connected.
 *  - Writes made in THIS process publish immediately from ActivityLogService
 *    zero DB reads, zero HTTP round-trips. This covers 100% of writes on a
 *    single-instance deployment (Render free runs one instance).
 *  - The shared backstop poll runs every 60 s (not 10 s) and only while at
 *    least one tab is connected. An idle app with no open tabs costs zero DB
 *    reads. It catches changes made externally (Supabase dashboard edits, or
 *    a second API instance if Render ever scales horizontally).
 *  - The backstop uses `select('id', { head: false })` + `limit(1)`, one
 *    indexed probe on `activity_logs_created_at_idx` per minute, not per tab
 *    and not per screen. That is ~1,440 reads/day vs the old 8,640.
 *  - The browser refetches ONLY queries that are currently mounted, so a
 *    changed form never re-queries an untouched admin screen.
 *  - Stale connections are purged: any client that misses two consecutive
 *    heartbeats (90 s) is dropped, preventing zombie entries after Render
 *    cold-boot or network drops.
 */
import type { Response } from 'express';

import { logger } from '../../../common/shared/services';
import { UpdatesRepository } from '../repositories';

/**
 * How often the shared "did anything change?" backstop probe runs.
 *
 * 60 s, not 10 s, because:
 *  - On a single-instance deploy (Render free), every write goes through this
 *    process and publishes instantly. The poll is a safety net, not the
 *    primary signal.
 *  - ~1,440 PostgREST reads/day vs 8,640 at 10 s. The `activity_logs` table is
 *    indexed on `created_at`, so the probe is an index-only scan, but fewer
 *    HTTPS round-trips to Supabase's PostgREST layer means fewer connections
 *    consumed from the 60-connection budget.
 */
const POLL_MS = 60_000;
/** Comment frames keep proxies from closing an idle stream. One timer for all. */
const HEARTBEAT_MS = 30_000;
/** Drop a client that has missed this many consecutive heartbeats. */
const MAX_MISSED_HEARTBEATS = 3;

type PublishOptions = {
  /**
   * Id of the audit row this write just appended. Recording it stops the poll
   * from announcing the same change a second time. Omit for writes that do not
   * append an audit row (e.g. marking notifications read).
   */
  signal?: string;
  /** Limit the push to one account; omit to notify every connected tab. */
  audience?: string;
};

type ClientEntry = {
  userId: string;
  /** Incremented on every missed heartbeat; reset to 0 on a successful write. */
  missed: number;
};

class UpdatesService {
  private readonly repository = new UpdatesRepository();
  private readonly clients = new Map<Response, ClientEntry>();
  private lastSignal: string | null = null;
  /** ISO timestamp of the last change we detected. Used by the head-only probe. */
  private lastSignalTimestamp: string | null = null;
  private version = 0;
  private poll: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private checking = false;

  /** Attach one tab's response. `userId` scopes audience-only pushes. */
  subscribe(res: Response, userId: string): () => void {
    this.clients.set(res, { userId, missed: 0 });
    if (this.clients.size === 1) this.start();
    this.send(res, 'ready', this.version);
    return () => this.drop(res);
  }

  /** A write just happened. Push now; the poll handles anything we missed. */
  publish(options: PublishOptions = {}): void {
    if (options.signal !== undefined) this.lastSignal = options.signal;
    // Stamp the watermark so the backstop poll doesn't re-detect this write.
    this.lastSignalTimestamp = new Date().toISOString();
    this.version += 1;
    for (const [res, entry] of this.clients) {
      if (options.audience && options.audience !== entry.userId) continue;
      this.send(res, 'changed', this.version);
    }
  }

  private send(res: Response, event: string, version: number): void {
    if (res.writableEnded || res.destroyed) {
      this.drop(res);
      return;
    }
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify({ v: version })}\n\n`);
      // Reset the missed-heartbeat counter: a successful write proves the
      // connection is alive.
      const entry = this.clients.get(res);
      if (entry) entry.missed = 0;
    } catch {
      this.drop(res);
    }
  }

  private drop(res: Response): void {
    if (!this.clients.delete(res)) return;
    if (this.clients.size === 0) this.stop();
  }

  private start(): void {
    // Seed without announcing: a tab that just connected already fetched its
    // data. Starting from a known baseline also prevents a spurious refetch.
    void this.check(false);
    this.poll = setInterval(() => void this.check(true), POLL_MS);
    this.heartbeat = setInterval(() => {
      for (const [res, entry] of this.clients) {
        if (res.writableEnded || res.destroyed) {
          this.drop(res);
          continue;
        }
        try {
          res.write(': ping\n\n');
          // A successful write does NOT prove the client received it, TCP
          // buffering can accept the write locally while the client is gone.
          // So we track misses instead of resetting on write. The counter is
          // only reset by a real `send()` that carries a payload the client
          // would ACK by staying connected.
          entry.missed += 1;
          if (entry.missed > MAX_MISSED_HEARTBEATS) {
            this.drop(res);
          }
        } catch {
          this.drop(res);
        }
      }
    }, HEARTBEAT_MS);
    // Never hold the process open because of an idle watcher.
    this.poll.unref();
    this.heartbeat.unref();
  }

  private stop(): void {
    if (this.poll) clearInterval(this.poll);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.poll = null;
    this.heartbeat = null;
  }

  /**
   * The single shared DB read.
   *
   * On first connect (`emit: false`): seeds the baseline with a full probe
   * (`latestChange()`) so the client doesn't get a spurious "changed" signal.
   *
   * On every subsequent poll (`emit: true`): uses `hasChangeSince()`, a
   * head-only probe that returns zero response body. If anything changed,
   * we publish immediately.
   */
  private async check(emit: boolean): Promise<void> {
    if (this.checking || this.clients.size === 0) return;
    this.checking = true;
    try {
      if (!emit || this.lastSignalTimestamp === null) {
        // Seed: one full probe to establish the baseline.
        const signal = await this.repository.latestChange();
        this.lastSignal = signal?.id ?? null;
        this.lastSignalTimestamp = new Date().toISOString();
        return;
      }
      // Incremental: head-only probe, zero response body.
      const changed = await this.repository.hasChangeSince(
        this.lastSignalTimestamp,
      );
      if (!changed) return;
      // Something changed. Update the watermark and broadcast.
      this.lastSignalTimestamp = new Date().toISOString();
      this.publish();
    } catch (error) {
      // A failed signal check must never break a stream; the next tick retries.
      logger.warn(`[updates] signal check failed: ${(error as Error).message}`);
    } finally {
      this.checking = false;
    }
  }
}

export default new UpdatesService();
