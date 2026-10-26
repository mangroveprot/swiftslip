import { BaseRepository } from '../../../core/engine';

export type ActivityLogPageQuery = {
  term: string;
  actions?: string[];
  /** Extra actions to match because their UI label contains the search term. */
  labelActions: string[];
  from?: string;
  to?: string;
  offset: number;
  limit: number;
};

export class ActivityLogRepository extends BaseRepository<'activity_logs'> {
  constructor() {
    super('activity_logs');
  }

  /** One filtered page, newest first, with the total before paging. */
  async page(q: ActivityLogPageQuery) {
    let query = this.from().select('*', { count: 'exact' });
    if (q.actions) query = query.in('action', q.actions);
    if (q.term) {
      const parts = [
        `actor_name.ilike.%${q.term}%`,
        `actor_number.ilike.%${q.term}%`,
        `action.ilike.%${q.term}%`,
        `target.ilike.%${q.term}%`,
        `detail.ilike.%${q.term}%`,
        `ip.ilike.%${q.term}%`,
      ];
      if (q.labelActions.length) {
        parts.push(`action.in.(${q.labelActions.join(',')})`);
      }
      query = query.or(parts.join(','));
    }
    if (q.from) query = query.gte('created_at', q.from);
    if (q.to) query = query.lt('created_at', q.to);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(q.offset, q.offset + q.limit - 1);
    if (error) this.fail(error);
    return {
      rows: (data ?? []) as Array<
        import('../../../core/engine').Row<'activity_logs'>
      >,
      count: count ?? 0,
    };
  }
}
