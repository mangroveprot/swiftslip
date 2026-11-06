import { BaseRepository } from '../../../core/engine';

/** One bell event per recipient (`notifications`, migration 0035). */
export class NotificationRepository extends BaseRepository<'notifications'> {
  constructor() {
    super('notifications');
  }
}
