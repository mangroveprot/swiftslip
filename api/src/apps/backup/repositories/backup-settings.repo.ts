import {
  BaseRepository,
  type InsertRow,
  type Row,
  type UpdateRow,
} from '../../../core/engine';
import { ErrorResponse } from '../../../common/shared';

/**
 * The single `backup_settings` row (id = true, enforced by the table's CHECK).
 *
 * Two rules, both learned from `storage_settings`:
 *   - a missing table is not an error, it is "migration 0043 has not run yet",
 *     so the page can say so instead of showing a Postgres code;
 *   - the row may be missing even when the table exists (a manual run of the
 *     SQL without the seed INSERT), so `ensure()` creates it on first use.
 */
export class BackupSettingsRepository extends BaseRepository<'backup_settings'> {
  constructor() {
    super('backup_settings', { updatedAtColumn: 'updated_at' });
  }

  /** The one row, or null when the table has not been created yet. */
  async findSingle(): Promise<Row<'backup_settings'> | null> {
    const { data, error } = await this.from()
      .select('*')
      .eq('id', true)
      .maybeSingle();
    if (error) {
      // 42P01 = undefined table, PGRST205 = table not in schema cache
      if (error.code === '42P01' || error.code === 'PGRST205') return null;
      this.fail(error);
    }
    return (data ?? null) as Row<'backup_settings'> | null;
  }

  /** The row, created from its column defaults when the seed INSERT was skipped. */
  async ensure(): Promise<Row<'backup_settings'>> {
    const existing = await this.findSingle();
    if (existing) return existing;
    try {
      return await this.create({ id: true } as InsertRow<'backup_settings'>);
    } catch (error) {
      // Two admins opening the page at once: the loser reads the winner's row.
      const again = await this.findSingle();
      if (again) return again;
      throw error;
    }
  }

  /**
   * Whether the table exists at all. A missing table is a pending migration,
   * not an outage, and the two must read differently on the page; every other
   * database error still throws.
   */
  async tableExists(): Promise<boolean> {
    const { error } = await this.from().select('id').limit(1);
    if (!error) return true;
    if (error.code === '42P01' || error.code === 'PGRST205') return false;
    this.fail(error);
    return false;
  }

  /** Write the row. Never creates one: the caller reads first. */
  async patch(
    input: UpdateRow<'backup_settings'>,
  ): Promise<Row<'backup_settings'>> {
    const updated = await this.update({ id: true }, input);
    if (!updated) {
      throw new ErrorResponse(
        'BACKUP_FAILED',
        'The backup settings row is missing. Run migration 0043_backup.sql, then reload this page.',
      );
    }
    return updated;
  }
}
