import { BaseService } from '../../../core/engine';
import type { Row } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import type { EmployeeProfile } from '@swiftslip/shared/types';
import { ProfileRepository } from '../repositories';

const emptyProfile = (): EmployeeProfile => ({
  emp_no: '',
  full_name: '',
  designation: '',
  area: '',
  department: '',
  signature: '',
  supervisor: '',
});

const toProfile = (row: Row<'profiles'>): EmployeeProfile => ({
  emp_no: row.emp_no ?? '',
  full_name: row.full_name ?? '',
  designation: row.designation ?? '',
  area: row.area ?? '',
  department: row.department ?? '',
  signature: row.signature ?? '',
  supervisor: row.supervisor ?? '',
});

class ProfileService extends BaseService<'profiles', ProfileRepository> {
  constructor() {
    super(new ProfileRepository());
  }

  /** The signed-in person's profile (empty fields until they fill it in). */
  async getMine(userId: string): Promise<ServiceResponse<EmployeeProfile>> {
    try {
      const row = await this.repository.findOne({ access_code_id: userId });
      return { success: true, document: row ? toProfile(row) : emptyProfile() };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  async saveMine(
    userId: string,
    profile: EmployeeProfile,
  ): Promise<ServiceResponse<EmployeeProfile>> {
    try {
      const row = await this.repository.upsert(
        {
          access_code_id: userId,
          emp_no: profile.emp_no,
          full_name: profile.full_name,
          designation: profile.designation,
          area: profile.area,
          department: profile.department,
          signature: profile.signature,
          supervisor: profile.supervisor,
          updated_at: new Date().toISOString(),
        },
        'access_code_id',
      );
      return { success: true, document: toProfile(row) };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }
}

export default new ProfileService();
