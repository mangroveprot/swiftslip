import { BaseRepository } from '../../../core/engine';

export class RecordRepository extends BaseRepository<'dtr_records'> {
  constructor() {
    super('dtr_records');
  }
}

/** Day rows behind a DTR record (`record_id` → `dtr_records.id`). */
export class RecordEntryRepository extends BaseRepository<'dtr_entries'> {
  constructor() {
    super('dtr_entries');
  }
}
