import { BaseRepository } from '../../../core/engine';

export class LoaFormRepository extends BaseRepository<'loa_forms'> {
  constructor() {
    super('loa_forms');
  }
}
