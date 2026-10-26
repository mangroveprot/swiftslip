import { NextFunction, Request, Response } from 'express';
import type { GrantableAppKey } from '@swiftslip/shared/types';
import { ErrorResponse } from '../../../common/shared/utils/error';
import { AccessService } from '../services';

/**
 * Use after `authenticate`. The server-side guard behind the route guards:
 * every read and mutation of a grantable app goes through it.
 *
 *   router.use(authenticate, requireApp('swiftslip'));
 */
export const requireApp =
  (app: GrantableAppKey) =>
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
