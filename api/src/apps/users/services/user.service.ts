import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { PasswordService } from '../../../common/shared/services/password.service';
import { PASSWORD_MIN_LENGTH } from '@swiftslip/shared/schemas';
import type { AccountPhoto, Role, SessionUser } from '@swiftslip/shared/types';
import { ProfileRepository } from '../../profile/repositories';
import { photoUrl } from '../../profile/services/photo-storage';
import { ActivityLogService } from '../../activity-log/services';
import { UserRepository } from '../repositories';
import { AttachmentService } from '../../attachments/services';
import { FileService } from '../../files/services';

/**
 * How many ids one photo batch will answer for. The admin lists ask for the
 * ids they are rendering (a page of logs, a page of people), which is well
 * under this; the cap only stops a hand-written URL from pulling every photo
 * in the company in one response.
 */
const USER_PHOTO_LIMIT = 100;

/**
 * The profile columns a roster needs — everything except `photo` and
 * `signature`. Both are large data URLs, and a full-table scan that pulls them
 * only to read a name wastes bandwidth and memory on every admin page load.
 */
const PROFILE_NAME_COLUMNS = 'access_code_id,full_name,area,department,designation';

/** One row in user management: the account joined with its profile. */
export type AccountListItem = {
  id: string;
  id_number: string;
  role: Role;
  created_at: string;
  full_name: string;
  /** The office / branch — `profiles.area`. */
  designation: string;
  department: string;
  /** The job title — `profiles.designation`. */
  position: string;
};

export type AccountInput = {
  idNumber: string;
  role: Role;
  /** Blank/omitted on an edit keeps the password. Required when creating. */
  password?: string | undefined;
  /** Omitted (not blank) leaves the stored value unchanged. */
  designation?: string | undefined;
  department?: string | undefined;
  position?: string | undefined;
};

class UserService extends BaseService<'users', UserRepository> {
  private profiles = new ProfileRepository();

  constructor() {
    super(new UserRepository());
    this.allowedFilterFields = ['role'];
    this.searchFields = ['id_number'];
  }

  /**
   * Profile photos for a batch of account ids — what the admin lists call to
   * put a face beside a name.
   *
   * Only ids that actually have a photo come back: the caller draws initials
   * for the rest, so "not in the answer" is the normal case, not an error.
   * Deleted accounts simply never match, which is what keeps an old activity
   * log readable.
   */
  async photos(ids: string[]): Promise<ServiceResponse<AccountPhoto>> {
    try {
      const wanted = [...new Set(ids)]
        .filter(Boolean)
        .slice(0, USER_PHOTO_LIMIT);
      if (wanted.length === 0) {
        return { success: true, documents: [], total: 0 };
      }

      const rows = await this.profiles.findAll({ access_code_id: wanted });
      // The column holds an object path; the browser needs a signed URL.
      const resolved = await Promise.all(
        rows
          .filter((row) => row.photo)
          .map(async (row) => ({
            id: row.access_code_id,
            photo: await photoUrl(row.photo),
          })),
      );
      // A link that could not be minted is the same as no photo: the caller
      // draws initials instead of a broken image.
      const documents = resolved.filter((row) => row.photo);

      return { success: true, documents, total: documents.length };
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

  /** Every account with the real name / org fields from its profile. */
  async listWithProfiles(): Promise<ServiceResponse<AccountListItem>> {
    try {
      const [accounts, profiles] = await Promise.all([
        this.repository.findAll({}, { sort: { created_at: 'asc' } }),
        // Never `*` here. This scan is for names and org fields only, and since
        // 0032 `*` would drag every user's base64 photo out of the database and
        // into memory on every visit to User management — for nothing.
        this.profiles.findAll({}, { select: PROFILE_NAME_COLUMNS }),
      ]);
      // The real name lives on the profile ("My Account"), not the account row.
      const details = new Map(profiles.map((p) => [p.access_code_id, p]));
      const documents = accounts.map((account) => {
        const p = details.get(account.id);
        return {
          id: account.id,
          id_number: account.id_number,
          role: account.role as Role,
          created_at: account.created_at,
          full_name: p?.full_name ?? '',
          designation: p?.area ?? '',
          department: p?.department ?? '',
          position: p?.designation ?? '',
        };
      });
      return {
        success: true,
        documents,
        total: documents.length,
        results: documents.length,
      };
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

  async createAccount(
    actor: SessionUser,
    input: AccountInput,
  ): Promise<ServiceResponse<never>> {
    try {
      const idNumber = input.idNumber.trim();
      this.assertPassword(input.password, true);
      await this.assertIdNumberFree(idNumber);

      const created = await this.repository.create({
        id_number: idNumber,
        role: input.role,
        password_hash: await PasswordService.hash(input.password as string),
      });

      // Seed the profile so the sign-in ID is also the employee number on
      // DTR / OB forms — one fewer thing to retype.
      await this.profiles.upsert(
        {
          access_code_id: created.id,
          emp_no: idNumber,
          area: input.designation ?? '',
          department: input.department ?? '',
          designation: input.position ?? '',
        },
        'access_code_id',
      );

      await this.logChange(actor, 'user.created', idNumber, input, false);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.duplicateToFriendly(
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
        ),
      };
    }
  }

  async updateAccount(
    actor: SessionUser,
    id: string,
    input: AccountInput,
  ): Promise<ServiceResponse<never>> {
    try {
      const idNumber = input.idNumber.trim();
      const existing = await this.repository.findOne({ id });
      if (!existing) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'That account no longer exists.',
        );
      }

      // Don't let the last administrator be demoted — it would lock everyone out.
      if (
        existing.role === 'admin' &&
        input.role !== 'admin' &&
        (await this.repository.countAdmins(id)) === 0
      ) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'Keep at least one administrator account.',
        );
      }
      this.assertPassword(input.password, false);
      await this.assertIdNumberFree(idNumber, id);

      // Hash only when a new password was supplied, so an edit that changes
      // the role leaves the hash untouched.
      const passwordHash = input.password
        ? await PasswordService.hash(input.password)
        : undefined;
      await this.repository.update(
        { id },
        {
          id_number: idNumber,
          role: input.role,
          ...(passwordHash ? { password_hash: passwordHash } : {}),
        },
      );

      if (
        input.designation !== undefined ||
        input.department !== undefined ||
        input.position !== undefined
      ) {
        await this.writeProfileDetails(id, input);
      }

      await this.logChange(actor, 'user.updated', idNumber, input, true);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.duplicateToFriendly(
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
        ),
      };
    }
  }

  async deleteAccount(
    actor: SessionUser,
    id: string,
  ): Promise<ServiceResponse<never>> {
    try {
      const row = await this.repository.findOne({ id });
      if (!row) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'That account no longer exists.',
        );
      }
      if (
        row.role === 'admin' &&
        (await this.repository.countAdmins(id)) === 0
      ) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'Keep at least one administrator account.',
        );
      }
      await this.repository.delete({ id });
      await AttachmentService.removeUserFiles(id);
      // Same best-effort cleanup for the optional B2 store (no-op when it has
      // no files for this account or is not configured).
      await FileService.removeUserFiles(id);
      await ActivityLogService.logBy(actor, {
        action: 'user.deleted',
        target: row.id_number,
      });
      return { success: true };
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

  // ── helpers (throw ErrorResponse; callers are the try/catch above) ───────

  private assertPassword(password: string | undefined, required: boolean) {
    if (!password && !required) return;
    if (!password || password.length < PASSWORD_MIN_LENGTH) {
      throw new ErrorResponse(
        'VALIDATION_ERROR',
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      );
    }
  }

  private async assertIdNumberFree(idNumber: string, excludingId?: string) {
    if (await this.repository.idNumberInUse(idNumber, excludingId)) {
      throw new ErrorResponse(
        'UNIQUE_FIELD_ERROR',
        'That ID number is already in use.',
      );
    }
  }

  /** The unique index has the final word on a race the check above can't see. */
  private duplicateToFriendly(error: ErrorResponse): ErrorResponse {
    return error.code === 'UNIQUE_FIELD_ERROR'
      ? new ErrorResponse(
          'UNIQUE_FIELD_ERROR',
          'That ID number is already in use.',
        )
      : error;
  }

  /**
   * Write the org fields an admin can set from user management. Only the
   * fields actually supplied change — an edit that touches just the role must
   * not wipe a Designation the employee typed under "My Account".
   */
  private async writeProfileDetails(id: string, input: AccountInput) {
    const existing = await this.profiles.findOne({ access_code_id: id });
    await this.profiles.upsert(
      {
        access_code_id: id,
        area: input.designation ?? existing?.area ?? '',
        department: input.department ?? existing?.department ?? '',
        designation: input.position ?? existing?.designation ?? '',
      },
      'access_code_id',
    );
  }

  private logChange(
    actor: SessionUser,
    action: 'user.created' | 'user.updated',
    idNumber: string,
    input: AccountInput,
    isEdit: boolean,
  ) {
    return ActivityLogService.logBy(actor, {
      action,
      target: idNumber,
      detail: [
        `role: ${input.role}`,
        isEdit && input.password ? 'password reset' : null,
        input.designation ? `designation: ${input.designation}` : null,
        input.department ? `department: ${input.department}` : null,
        input.position ? `position: ${input.position}` : null,
      ]
        .filter(Boolean)
        .join(', '),
    });
  }
}

export default new UserService();
