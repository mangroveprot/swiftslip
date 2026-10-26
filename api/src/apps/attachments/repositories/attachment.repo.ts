import { BaseRepository } from '../../../core/engine';
import type { AttachmentTable } from '../types';

/**
 * One repository per document-carrying table. `id`, `owner_id`,
 * `attachment_path` and `attachment_name` exist on all of them.
 */
export class AttachmentRepository extends BaseRepository<AttachmentTable> {
  constructor(table: AttachmentTable) {
    super(table);
  }
}
