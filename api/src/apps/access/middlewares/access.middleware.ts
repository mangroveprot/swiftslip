import { NextFunction, Request, Response } from 'express';
import type { InternalAppKey } from '@swiftslip/shared/types';
import { ErrorResponse } from '../../../common/shared/utils/error';
import { AccessService } from '../services';

/**
 * Use after `authenticate`. The server-side guard behind the route guards:
 * every read and mutation of a grantable app goes through it.
 *
 *   router.use(authenticate, requireApp('swiftslip'));
 *
 * Typed to this host's own apps: an app on another host has no route here, so
 * asking for a guard on one is a compile error instead of a permanent 403.
 */
export const requireApp =
  (app: InternalAppKey) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        next(new ErrorResponse('UNAUTHORIZED'));
        return;
      }
      if (!(await AccessService.canAccess(user, app))) {
        next(
          new ErrorResponse(
            'FORBIDDEN',
            'You do not have access to this application.',
          ),
        );
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
