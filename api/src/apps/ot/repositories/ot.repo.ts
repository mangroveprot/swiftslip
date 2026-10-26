import { BaseRepository } from '../../../core/engine';

export class OtFormRepository extends BaseRepository<'ot_forms'> {
  constructor() {
    super('ot_forms');
  }
}

/** Overtime lines behind an OT form (`form_id` → `ot_forms.id`). */
export class OtEntryRepository extends BaseRepository<'ot_entries'> {
  constructor() {
    super('ot_entries');
  }
}
