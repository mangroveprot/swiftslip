import { BaseRepository } from '../../../core/engine';

/**
 * The HR review queue reads the same `ob_forms` rows the employee owns; there
 * is no HR-only table. The repository is separate so HR queries never inherit
 * the owner-scoped defaults of the employee module.
 */
export class HrObRepository extends BaseRepository<'ob_forms'> {
  constructor() {
    super('ob_forms');
  }
}
