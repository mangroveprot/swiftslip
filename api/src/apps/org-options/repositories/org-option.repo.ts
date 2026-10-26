import { BaseRepository } from '../../../core/engine';

export class OrgDesignationRepository extends BaseRepository<'org_designations'> {
  constructor() {
    super('org_designations');
  }
}

export class OrgDepartmentRepository extends BaseRepository<'org_departments'> {
  constructor() {
    super('org_departments');
  }
}

export class OrgPositionRepository extends BaseRepository<'org_positions'> {
  constructor() {
    super('org_positions');
  }
}
