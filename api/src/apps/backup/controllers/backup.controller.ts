import { Request, Response } from 'express';

import {
  ApiResponse,
  ErrorResponse,
  ErrorResponseType,
} from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { config } from '../../../core/config';
import type { SessionUser } from '@swiftslip/shared/types';
import type { BackupSettingsInput } from '@swiftslip/shared/schemas';
import { backupService } from '../services';

/**
 * Settings → Backup. Admin-only, like the rest of `/admin`.
 *
 * The Google callback is the one route that does not answer JSON: Google sends
 * the browser there, so it redirects back into the admin panel with a query
 * flag the page turns into a toast.
 */
class BackupController {
  static async overview(_req: Request, res: Response): Promise<void> {
    try {
      const response = await backupService.getOverview();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async saveSettings(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as SessionUser;
      const input = req.body as BackupSettingsInput;
      const response = await backupService.saveSettings(actor, input);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /** Answers with the consent URL; the page sends the browser there. */
  static async googleStart(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as SessionUser;
      const response = await backupService.beginConnect(actor);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /**
   * Google → back here with `code` and `state`. The browser is redirected, so a
   * failure cannot be a JSON error body: it goes to the panel as `backup=error`
   * with a short reason the page shows in a toast.
   */
  static async googleCallback(req: Request, res: Response): Promise<void> {
    const base = adminUrl();
    const query = req.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    if (query.error) {
      redirect(
        res,
        `${base}?backup=denied&reason=${encodeURIComponent(query.error)}&section=backup`,
      );
      return;
    }
    if (!query.code || !query.state) {
      redirect(res, `${base}?backup=error&reason=missing_code&section=backup`);
      return;
    }

    try {
      const actor = req.user as SessionUser;
      const response = await backupService.finishConnect(
        actor,
        query.code,
        query.state,
      );
      if (response.success) {
        const who = response.document?.email ?? '';
        redirect(
          res,
          `${base}?backup=connected&account=${encodeURIComponent(who)}&section=backup`,
        );
      } else {
        redirect(
          res,
          `${base}?backup=error&reason=${encodeURIComponent(response.error.message)}&section=backup`,
        );
      }
    } catch (error) {
      const message =
        error instanceof ErrorResponse
          ? error.message
          : 'The Google connection could not be completed.';
      logger.warn(`Google callback failed: ${message}`);
      redirect(
        res,
        `${base}?backup=error&reason=${encodeURIComponent(message)}&section=backup`,
      );
    }
  }

  static async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as SessionUser;
      const response = await backupService.disconnect(actor);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async rotateLink(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as SessionUser;
      const response = await backupService.rotateLink(actor);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /** "Back up now": waits for the dump so the button can report the result. */
  static async runNow(req: Request, res: Response): Promise<void> {
    try {
      const actor = req.user as SessionUser;
      const response = await backupService.runNow(actor, 'manual');
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /**
   * The cron link. No session: the token IS the credential, compared in constant
   * time, and it can only start a backup. Answers 202 at once and works in the
   * background, because no cron service waits through a free host's cold start.
   */
  static async cron(req: Request, res: Response): Promise<void> {
    try {
      const token = String(req.params.token ?? '');
      const response = await backupService.triggerFromLink(token);
      if (response.success) {
        ApiResponse.success(res, response, 202);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }
}

/** The panel's own URL, from the site origin the API already trusts. */
function adminUrl(): string {
  const origin = config.cors.origins[0] ?? 'http://localhost:8080';
  return `${origin}/admin`;
}

function redirect(res: Response, url: string): void {
  res.redirect(302, url);
}

export default BackupController;
