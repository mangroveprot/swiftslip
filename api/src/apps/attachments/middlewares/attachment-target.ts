import { NextFunction, Request, Response } from 'express';
import type { AttachmentTarget } from '../types';

/** Tells the shared attachment controller which table the route is mounted on. */
export const attachmentTarget =
  (target: AttachmentTarget) =>
  (req: Request, res: Response, next: NextFunction): void => {
    res.locals.attachmentTarget = target;
    next();
  };
