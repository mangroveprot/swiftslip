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
  handler: (req, res) => {
    logger.warn(`Too many requests from IP: ${req.ip}`);
    ApiResponse.error(res, {
      success: false,
      error: new ErrorResponse('TOO_MANY_REQUESTS'),
    });
  },
});
