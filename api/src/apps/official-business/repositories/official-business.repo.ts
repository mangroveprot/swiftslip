import { BaseRepository } from '../../../core/engine';

export class ObFormRepository extends BaseRepository<'ob_forms'> {
  constructor() {
    super('ob_forms');
  }
}

/** Itinerary rows behind an OB form (`form_id` → `ob_forms.id`). */
export class ObEntryRepository extends BaseRepository<'ob_entries'> {
  constructor() {
    super('ob_entries');
  }
}
