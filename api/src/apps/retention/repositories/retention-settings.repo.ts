import { BaseRepository } from '../../../core/engine';

/**
 * The single `retention_settings` row (id = true, enforced by the table's
 * CHECK). Reads fall back to the defaults in the service when the row is
 * missing, so a database that predates the migration still answers.
 */
export class RetentionSettingsRepository extends BaseRepository<'retention_settings'> {
  constructor() {
    super('retention_settings', { updatedAtColumn: 'updated_at' });
  }

  /** The one row, or null when the table has not been seeded yet. */
  async findSingle() {
    return this.findOne({ id: true });
  }
}
