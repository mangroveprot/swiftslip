import { NextFunction, Request, Response } from 'express';
import { ErrorResponse } from '../../../common/shared/utils/error';
import { SessionService } from '../services/session.service';

/** Requires a valid session cookie; puts the user on `req.user`. */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await SessionService.currentUser(req, res);
    if (!user) {
      next(new ErrorResponse('UNAUTHORIZED'));
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/** Use after `authenticate`. */
export const authorizeAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.user?.role !== 'admin') {
    next(new ErrorResponse('FORBIDDEN', 'Only an administrator can do this.'));
    return;
  }
  next();
};
