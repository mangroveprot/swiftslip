import rateLimit from 'express-rate-limit';
import { config } from '../../../core/config';
import { logger } from '../services';
import { ApiResponse } from '../utils/response';
import { ErrorResponse } from '../utils/error';

export const apiRateLimiter = rateLimit({
  windowMs: config.rate.limit,
  max: config.rate.max,
  standardHeaders: true,
  legacyHeaders: false,
  // The live-update stream is one long-lived connection per tab: it makes a
  // single request, then holds it open for the session and reconnects only on
  // a dropped socket. Counting each reconnect against the API quota would let a
  // flaky network trip the limiter and turn a blip into a death spiral, so the
  // stream is exempt. Every *real* data fetch still goes through this limiter.
  skip: (req) => req.originalUrl?.startsWith('/api/updates/stream') ?? false,
  handler: (req, res) => {
    logger.warn(`Too many requests from IP: ${req.ip}`);
    ApiResponse.error(res, {
      success: false,
      error: new ErrorResponse('TOO_MANY_REQUESTS'),
    });
  },
});
