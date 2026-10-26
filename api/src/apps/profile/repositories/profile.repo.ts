import { BaseRepository } from '../../../core/engine';

/** One profile per account; `access_code_id` is the owning `users.id`. */
export class ProfileRepository extends BaseRepository<'profiles'> {
  constructor() {
    super('profiles', { primaryKey: 'access_code_id' });
  }
}
