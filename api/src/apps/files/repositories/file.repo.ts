import { BaseRepository } from '../../../core/engine';

/**
 * One row per object uploaded through the optional B2 store. `key` is the
 * object key in the bucket — never a full URL (STORAGE_GUIDE.md §4).
 */
export class FileRepository extends BaseRepository<'files'> {
  constructor() {
    super('files');
  }
}
