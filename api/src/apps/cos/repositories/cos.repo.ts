import { BaseRepository } from '../../../core/engine';

export class CosFormRepository extends BaseRepository<'cos_forms'> {
  constructor() {
    super('cos_forms');
  }
}

/** Schedule lines behind a change-of-schedule form (`form_id` → `cos_forms.id`). */
export class CosScheduleRepository extends BaseRepository<'cos_schedules'> {
  constructor() {
    super('cos_schedules');
  }
}
