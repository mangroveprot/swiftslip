import { BaseRepository } from '../../../core/engine';

export class AccessRuleRepository extends BaseRepository<'app_access_rules'> {
  constructor() {
    super('app_access_rules');
  }
}
