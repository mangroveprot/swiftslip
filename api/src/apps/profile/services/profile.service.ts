import { BaseService } from '../../../core/engine';
import type { Row } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import type {
  EmployeeProfile,
  PhotoCrop,
  SessionUser,
} from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log/services';
import { UserRepository } from '../../users/repositories';
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
  employer: 1,
  signature: '',
  photo: '',
  photo_crop: { zoom: 1, x: 0, y: 0 },
  supervisor: '',
});

/**
 * One readable sentence for the activity log: which profile fields changed.
 * The photo is excluded (saved separately), as is the signature VALUE, which
 * can be a long data URL; only the fact that it changed is recorded.
 */
function profileChanges(
  before: EmployeeProfile,
  after: EmployeeProfile,
): string {
  const parts: string[] = [];
  const add = (label: string, from: string, to: string) => {
    if (from === to) return;
    parts.push(`${label}: ${from || '(none)'} → ${to || '(none)'}`);
  };

  add('Employee ID', before.emp_no.trim(), after.emp_no.trim());
  add('Name', before.full_name, after.full_name);
  add('Designation', before.area, after.area);
  add('Department', before.department, after.department);
  add('Position', before.designation, after.designation);
  add('Supervisor', before.supervisor, after.supervisor);
  if (before.signature !== after.signature) {
    parts.push(after.signature ? 'Signature updated' : 'Signature cleared');
  }
  return parts.join(', ');
}

const toProfile = (row: Row<'profiles'>): EmployeeProfile => ({
  emp_no: row.emp_no ?? '',
  full_name: row.full_name ?? '',
  designation: row.designation ?? '',
  area: row.area ?? '',
  department: row.department ?? '',
  employer: row.employer === 0 ? 0 : 1,
  signature: row.signature ?? '',
  photo: row.photo ?? '',
  photo_crop: {
    zoom: row.photo_zoom ?? 1,
    x: row.photo_x ?? 0,
    y: row.photo_y ?? 0,
  },
  supervisor: row.supervisor ?? '',
});

class ProfileService extends BaseService<'profiles', ProfileRepository> {
  private users = new UserRepository();

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
    actor: SessionUser,
    profile: EmployeeProfile,
  ): Promise<ServiceResponse<EmployeeProfile>> {
    try {
      const userId = actor.id;
      const existing = await this.repository.findOne({
        access_code_id: userId,
      });
      const previous = existing ? toProfile(existing) : emptyProfile();
      const empNo = profile.emp_no.trim();
      // Sign-in and the employee number are the same ID. A change here moves
      // the account row too, so there is never one ID on the profile and a
      // different one on the login screen.
      const idChanged = empNo !== previous.emp_no.trim();

      if (idChanged) {
        if (!empNo) {
          throw new ErrorResponse(
            'VALIDATION_ERROR',
            'Enter your Employee ID. It is also the ID you sign in with.',
          );
        }
        if (await this.users.idNumberInUse(empNo, userId)) {
          throw new ErrorResponse(
            'UNIQUE_FIELD_ERROR',
            'That Employee ID is already in use.',
          );
        }

        // The account row is what the sign-in screen reads, so write it first:
        // a unique-index race is caught here, before the profile changes.
        const account = await this.users.update(
          { id: userId },
          { id_number: empNo },
        );
        if (!account) {
          throw new ErrorResponse(
            'NOT_FOUND_ERROR',
            'That account no longer exists.',
          );
        }
      }

      let row: Row<'profiles'>;
      try {
        row = await this.repository.upsert(
          {
            access_code_id: userId,
            emp_no: empNo,
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
      } catch (error) {
        if (idChanged) {
          // Keep the two in step if the profile write failed after the account
          // row already moved.
          try {
            await this.users.update(
              { id: userId },
              { id_number: actor.idNumber },
            );
          } catch {
            // Best effort: the profile is untouched, so the next save can try
            // again with the account row's current value.
          }
        }
        throw error;
      }

      await this.logProfileChange(actor, previous, profile, empNo);
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

  /** One audit row for a profile save, but only when something changed. */
  private logProfileChange(
    actor: SessionUser,
    before: EmployeeProfile,
    after: EmployeeProfile,
    empNo: string,
  ) {
    const next = { ...after, emp_no: empNo };
    const detail = profileChanges(before, next);
    if (!detail) return Promise.resolve();

    return ActivityLogService.logBy(actor, {
      action: 'profile.updated',
      target: empNo || actor.idNumber,
      detail,
    });
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
   *
   * `crop` is the framing the cropper showed. It only matters for an animated
   * GIF, which is stored whole; a still is already framed inside its square.
   */
  async savePhoto(
    actor: SessionUser,
    photo: string,
    crop: PhotoCrop = { zoom: 1, x: 0, y: 0 },
  ): Promise<ServiceResponse<EmployeeProfile>> {
    try {
      const userId = actor.id;
      const existing = await this.repository.findOne({
        access_code_id: userId,
      });
      const previous = existing?.photo ?? '';

      if (!photo) {
        await this.repository.upsert(
          {
            access_code_id: userId,
            photo: '',
            // Nothing to frame, so the next photo starts centred rather than
            // inheriting the removed GIF's framing.
            photo_zoom: 1,
            photo_x: 0,
            photo_y: 0,
            updated_at: new Date().toISOString(),
          },
          'access_code_id',
        );
        await removePhoto(previous);
        await this.logPhotoChange(actor, existing?.emp_no ?? '', false);
        return this.getMine(userId);
      }

      const path = await storePhoto(userId, photo);

      try {
        await this.repository.upsert(
          {
            access_code_id: userId,
            photo: path,
            // A still is already framed inside its 256 px square, so the crop
            // arrives as the identity; a GIF is stored whole and keeps the
            // framing chosen in the cropper.
            photo_zoom: crop.zoom,
            photo_x: crop.x,
            photo_y: crop.y,
            updated_at: new Date().toISOString(),
          },
          'access_code_id',
        );
      } catch (error) {
        // The row still points at the old photo (or nothing), drop the object
        // we just wrote rather than leave it unreferenced.
        if (previous !== path) await removePhoto(path);
        throw error;
      }

      // Replaced, and the extension changed (png → webp): the old object is now
      // unreachable, so remove it before it turns up in the orphan list.
      if (isStoredPath(previous) && previous !== path) {
        await removePhoto(previous);
      }

      await this.logPhotoChange(actor, existing?.emp_no ?? '', true);
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

  /** The photo is saved by its own request, so it gets its own audit row. */
  private logPhotoChange(actor: SessionUser, empNo: string, updated: boolean) {
    return ActivityLogService.logBy(actor, {
      action: 'profile.updated',
      target: empNo.trim() || actor.idNumber,
      detail: updated ? 'Profile photo updated' : 'Profile photo removed',
    });
  }
}

export default new ProfileService();
