import { BaseRepository } from '../../../core/engine';
import { escapeLike } from '../../../helpers';

export class UserRepository extends BaseRepository<'users'> {
  constructor() {
    super('users');
  }

  /**
   * Exact match, deliberately: the unique index on `id_number` is
   * case-sensitive, so sign-in must compare the same way the index does.
   */
  findByIdNumber(idNumber: string) {
    return this.findOne({ id_number: idNumber });
  }

  /** Case-insensitive, so "jd123" cannot be created beside "JD123". */
  async idNumberInUse(
    idNumber: string,
    excludingId?: string,
  ): Promise<boolean> {
    let query = this.from()
      .select('id', { count: 'exact', head: true })
      .ilike('id_number', escapeLike(idNumber));
    if (excludingId) query = query.neq('id', excludingId);
    const { count, error } = await query;
    if (error) this.fail(error);
    return (count ?? 0) > 0;
  }

  countAdmins(excludingId?: string): Promise<number> {
    return this.count({
      role: 'admin',
      ...(excludingId ? { id: { neq: excludingId } } : {}),
    });
  }
}
