import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { PasswordService } from '../../../common/shared/services/password.service';
import { PASSWORD_MIN_LENGTH } from '@swiftslip/shared/schemas';
import type { AppKey, Role, SessionUser } from '@swiftslip/shared/types';
import { UserRepository } from '../../users/repositories';
import { ProfileRepository } from '../../profile/repositories';
import { ActivityLogService } from '../../activity-log/services';
import { AccessService } from '../../access/services';

/**
 * Sign-in throttling — failures allowed per ID number / per IP in the window.
 * Ten per ID leaves room for genuine typos while still capping guesses; the
 * per-IP limit catches spraying across many accounts.
 */
const FAILURE_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_ID = 10;
const MAX_FAILURES_PER_IP = 20;
/** A small pause on failure makes scripted guessing measurably slower. */
const FAILURE_DELAY_MS = 250;

export type SessionDocument = SessionUser & { apps: AppKey[] };

class AuthService {
  private users = new UserRepository();
  private profiles = new ProfileRepository();

  /** The account for that ID number + password, or UNAUTHORIZED. */
  async signIn(
    input: { idNumber: string; password: string },
    ip: string,
  ): Promise<ServiceResponse<SessionUser>> {
    try {
      const idNumber = input.idNumber.trim();

      // Checked before the password is touched: once an ID number (or an
      // address) has used up its allowance, every further attempt waits out
      // the window instead of becoming another free guess.
      const failures = await ActivityLogService.countRecentSignInFailures(
        idNumber,
        ip,
        FAILURE_WINDOW_MINUTES,
      );
      if (!failures.success) throw failures.error;
      if (
        failures.document!.byId >= MAX_FAILURES_PER_ID ||
        failures.document!.byIp >= MAX_FAILURES_PER_IP
      ) {
        throw new ErrorResponse(
          'TOO_MANY_REQUESTS',
          `Too many sign-in attempts. Please wait ${FAILURE_WINDOW_MINUTES} minutes and try again.`,
        );
      }

      const account = idNumber
        ? await this.users.findByIdNumber(idNumber)
        : null;
      const valid =
        !!account &&
        (await PasswordService.verify(input.password, account.password_hash));

      if (!account || !valid) {
        // Rejected attempts land in the admin log (ID + IP) so someone
        // spraying passwords is visible.
        await ActivityLogService.log({
          action: 'signin.failed',
          actorNumber: idNumber,
          detail: 'Wrong ID number or password',
          ip,
        });
        await new Promise<void>((resolve) =>
          setTimeout(resolve, FAILURE_DELAY_MS),
        );
        throw new ErrorResponse('UNAUTHORIZED', 'Wrong ID number or password.');
      }

      // Transparent upgrade: a correct sign-in is the only moment the
      // plaintext is available, so move a legacy / older-iteration hash to the
      // current scheme now. A failure here must never block the login.
      if (PasswordService.needsUpgrade(account.password_hash)) {
        try {
          await this.users.update(
            { id: account.id },
            { password_hash: await PasswordService.hash(input.password) },
          );
        } catch {
          /* ignore: the old hash still works */
        }
      }

      // The sidebar's "Signed in as …" uses the profile's real full name,
      // falling back to the ID number. A failed lookup must not block sign-in.
      let fullName = '';
      try {
        const profile = await this.profiles.findOne({
          access_code_id: account.id,
        });
        fullName = profile?.full_name?.trim() ?? '';
      } catch {
        /* the ID number always works */
      }

      const user: SessionUser = {
        id: account.id,
        role: account.role as Role,
        label: fullName || account.id_number,
        idNumber: account.id_number,
      };
      await ActivityLogService.log({
        action: 'signin.success',
        actorId: user.id,
        actorName: user.label,
        actorNumber: user.idNumber,
        ip,
      });
      return { success: true, document: user };
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
   * Identity plus the app grants. Grants are resolved from the database on
   * every read, so an admin changing a rule applies on the next page load.
   * UI hint only — the real gate is `requireApp`.
   */
  async session(user: SessionUser): Promise<ServiceResponse<SessionDocument>> {
    try {
      const apps = await AccessService.resolveApps(user);
      return { success: true, document: { ...user, apps } };
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

  /** Change the signed-in account's password after checking the old one. */
  async changePassword(
    user: SessionUser,
    input: { currentPassword: string; newPassword: string },
  ): Promise<ServiceResponse<SessionUser>> {
    try {
      if (input.newPassword.length < PASSWORD_MIN_LENGTH) {
        throw new ErrorResponse(
          'VALIDATION_ERROR',
          `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
        );
      }
      const row = await this.users.findOne({ id: user.id });
      if (
        !row ||
        !(await PasswordService.verify(
          input.currentPassword,
          row.password_hash,
        ))
      ) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'Current password is incorrect.',
        );
      }
      await this.users.update(
        { id: user.id },
        { password_hash: await PasswordService.hash(input.newPassword) },
      );
      return { success: true, document: user };
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

export default new AuthService();
