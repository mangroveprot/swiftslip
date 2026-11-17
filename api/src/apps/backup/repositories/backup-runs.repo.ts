import { BaseRepository, type Row, type UpdateRow } from '../../../core/engine';
import type { BackupTargetId, BackupTrigger } from '@swiftslip/shared/schemas';

/**
 * One row per dump, kept forever.
 *
 * A run covers every configured database, so a single "Back up now" writes one
 * row per database — each with its own status, so one dead connection string
 * cannot hide a successful dump of the other. A run is written BEFORE the dump
 * starts (status `running`), so a process that dies mid-run (a deploy, a free
 * host spinning down) leaves evidence instead of silence. `failStale()` closes
 * those rows on the next run: without it the page would show "running" for a
 * backup that stopped weeks ago.
 */
export class BackupRunsRepository extends BaseRepository<'backup_runs'> {
  constructor() {
    super('backup_runs');
  }

  start(input: {
    triggeredBy: BackupTrigger;
    target: BackupTargetId;
    actorId?: string | null;
    actorName?: string | null;
  }): Promise<Row<'backup_runs'>> {
    return this.create({
      triggered_by: input.triggeredBy,
      target: input.target,
      actor_id: input.actorId ?? null,
      actor_name: input.actorName ?? null,
    });
  }

  /**
   * Whether `backup_runs.target` exists (migration 0044).
   *
   * Without it a run cannot record which database it dumped, so the page says
   * "run 0044" instead of failing on the first insert. PostgREST answers an
   * unknown column with 42703 (Postgres) or PGRST204 (schema cache).
   */
  async targetColumnExists(): Promise<boolean> {
    const { error } = await this.from().select('target').limit(1);
    if (!error) return true;
    if (
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      error.code === '42P01' ||
      error.code === 'PGRST205'
    ) {
      return false;
    }
    this.fail(error);
    return false;
  }

  finish(
    id: string,
    patch: UpdateRow<'backup_runs'>,
  ): Promise<Row<'backup_runs'> | null> {
    return this.update({ id }, patch);
  }

  /** Newest first; the page shows a short history, not an archive. */
  recent(limit: number): Promise<Row<'backup_runs'>[]> {
    return this.findAll({}, { sort: { started_at: 'desc' }, limit });
  }

  /**
   * Close any run still marked `running` from before `minutes` ago. Called at
   * the start of a run, when nothing else can legitimately be running.
   */
  async failStale(minutes: number): Promise<void> {
    const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
    await this.updateMany(
      { status: 'running', started_at: { lt: cutoff } },
      {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: 'The server stopped before the backup finished.',
      },
    );
  }
}
