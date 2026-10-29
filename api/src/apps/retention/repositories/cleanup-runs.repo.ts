import { BaseRepository } from '../../../core/engine';

/** `cleanup_runs` — the permanent history of what each cleanup deleted. */
export class CleanupRunsRepository extends BaseRepository<'cleanup_runs'> {
  constructor() {
    super('cleanup_runs');
  }

  /** The newest run, or null when nothing has ever been cleaned up. */
  async findLatest() {
    const rows = await this.findAll({}, { sort: { ran_at: 'desc' }, limit: 1 });
    return rows[0] ?? null;
  }
}
