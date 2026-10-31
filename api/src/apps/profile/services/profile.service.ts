import { BaseService } from '../../../core/engine';
import type { Row } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import type { EmployeeProfile } from '@swiftslip/shared/types';
import { ProfileRepository } from '../repositories';
import {
  isStoredPath,
  photoUrl,
  removePhoto,
  storePhoto,
} from './photo-storage';

const emptyProfile = (): EmployeeProfile => ({
  emp_no: '',
  full_name: '',
  designation: '',
  area: '',
  department: '',
  signature: '',
  photo: '',
  supervisor: '',
});

const toProfile = (row: Row<'profiles'>): EmployeeProfile => ({
  emp_no: row.emp_no ?? '',
  full_name: row.full_name ?? '',
  designation: row.designation ?? '',
  area: row.area ?? '',
  department: row.department ?? '',
  signature: row.signature ?? '',
  photo: row.photo ?? '',
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
      return { success: true, document: await this.withPhoto(row) };
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

  /**
   * The row as the browser sees it: the stored photo PATH is swapped for a
   * freshly signed URL, because links expire and a cached one would rot.
   */
  private async withPhoto(
    row: Row<'profiles'> | null,
  ): Promise<EmployeeProfile> {
    const profile = row ? toProfile(row) : emptyProfile();
    profile.photo = await photoUrl(row?.photo ?? '');
    return profile;
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
          // `photo` is deliberately absent: the client sends back the signed
          // URL it was given, and writing that into the column would replace
          // the object path with a link that expires. The photo is only ever
          // written by `savePhoto`.
          supervisor: profile.supervisor,
          updated_at: new Date().toISOString(),
        },
        'access_code_id',
      );
      return { success: true, document: await this.withPhoto(row) };
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

  /**
   * Write ONLY the photo, and hand the whole profile back.
   *
   * The profile page calls this the moment the cropper's "Use photo" is
   * pressed, so it deliberately touches nothing else: a half-typed supervisor
   * name must not be committed by a photo upload. The upsert sends just these
   * columns, so an existing row keeps every other value, and a first save
   * leaves the rest at their table defaults.
   *
   * The bytes go to object storage; the column keeps the object path. An empty
   * string means "remove": the row is cleared and the object deleted, so no
   * orphan is left behind for the cleanup job to find.
   */
  async savePhoto(
    userId: string,
    photo: string,
  ): Promise<ServiceResponse<EmployeeProfile>> {
    try {
      const existing = await this.repository.findOne({
        access_code_id: userId,
      });
      const previous = existing?.photo ?? '';

      if (!photo) {
        await this.repository.upsert(
          {
            access_code_id: userId,
            photo: '',
            updated_at: new Date().toISOString(),
          },
          'access_code_id',
        );
        await removePhoto(previous);
        return this.getMine(userId);
      }

      const path = await storePhoto(userId, photo);

      try {
        await this.repository.upsert(
          {
            access_code_id: userId,
            photo: path,
            updated_at: new Date().toISOString(),
          },
          'access_code_id',
        );
      } catch (error) {
        // The row still points at the old photo (or nothing) — drop the object
        // we just wrote rather than leave it unreferenced.
        if (previous !== path) await removePhoto(path);
        throw error;
      }

      // Replaced, and the extension changed (png → webp): the old object is now
      // unreachable, so remove it before it turns up in the orphan list.
      if (isStoredPath(previous) && previous !== path) {
        await removePhoto(previous);
      }

      return this.getMine(userId);
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
