import type { SessionUser } from '@swiftslip/shared/types';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware on every protected route. */
      user?: SessionUser;
    }
  }
}

export {};
