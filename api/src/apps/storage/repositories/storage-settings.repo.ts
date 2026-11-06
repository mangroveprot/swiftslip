import { BaseRepository } from '../../../core/engine';
import { config } from '../../../core/config';

/**
 * The single `storage_settings` row (id = true, enforced by the table's
 * CHECK). Reads fall back to the defaults in the service when the row is
 * missing, so a database that predates the migration still answers.
 */
export class StorageSettingsRepository extends BaseRepository<'storage_settings'> {
  constructor() {
    super('storage_settings', { updatedAtColumn: 'updated_at' });
  }

  /**
   * The one row, or null when the table has not been seeded yet.
   * Throws on any error *except* a missing table (42P01 / PGRST205), which
   * returns null so the service can fall back to its defaults.
   */
  async findSingle() {
    const { data, error } = await this.from()
      .select('*')
      .eq('id', true)
      .maybeSingle();
    if (error) {
      // 42P01 = undefined table, PGRST205 = table not in schema cache
      if (error.code === '42P01' || error.code === 'PGRST205') return null;
      this.fail(error);
    }
    return data as ReturnType<BaseRepository<'storage_settings'>['findOne']>;
  }
}
