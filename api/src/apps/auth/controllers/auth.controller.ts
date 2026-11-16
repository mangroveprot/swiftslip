import { Request, Response } from 'express';
import {
  ApiResponse,
  ErrorResponseType,
  SuccessResponseType,
} from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { AuthService, SessionService } from '../services';

class AuthController {
  static async signIn(req: Request, res: Response): Promise<void> {
    try {
      const response = await AuthService.signIn(req.body, req.ip ?? '');
      if (response.success) {
        const user = response.document as SessionUser;
        // A re-sign-in from this browser replaces its session, so no older
        // cookie of the same browser survives the next sign-out.
        await SessionService.revokePresented(req);
        await SessionService.start(res, user, {
          ip: req.ip ?? '',
          userAgent: req.headers['user-agent'] ?? '',
          // Validated with the body: true unless the form unticked it.
          rememberMe:
            (req.body as { rememberMe?: boolean }).rememberMe !== false,
        });
        // Recorded only now: a sign-in whose session could not be created did
        // not really happen, whatever the password check said.
        await AuthService.recordSignIn(user, req.ip ?? '');
        ApiResponse.success(res, response, 200);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async signOut(req: Request, res: Response): Promise<void> {
    try {
      // Deletes the session row: the cookie, and any copy of it, stops
      // working immediately instead of at the end of its lifetime.
      await SessionService.end(req, res);
      ApiResponse.success(res, { success: true }, 200);
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /** Public on purpose: signed out is a normal answer (no `document`), not an error. */
  static async session(req: Request, res: Response): Promise<void> {
    try {
      const user = await SessionService.currentUser(req, res);
      if (!user) {
        const empty: SuccessResponseType<never> = { success: true };
        ApiResponse.success(res, empty, 200);
        return;
      }
      const response = await AuthService.session(user);
      if (response.success) {
        ApiResponse.success(res, response, 200);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as SessionUser;
      const response = await AuthService.changePassword(user, req.body);
      if (response.success) {
        // Re-issue THIS device's cookie against the new hash; every other
        // device holds the old fingerprint and is signed out on its next call.
        await SessionService.rotate(req, res, user);
        ApiResponse.success(res, { success: true }, 200);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }
}

export default AuthController;
