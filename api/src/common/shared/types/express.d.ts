import type { SessionUser } from '@swiftslip/shared/types';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware on every protected route. */
      user?: SessionUser;
      /** The live `sessions` row behind the cookie, set with `user`. */
      sessionId?: string;
    }
  }
}

export {};
