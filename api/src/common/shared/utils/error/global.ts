import { Request, Response, NextFunction } from 'express';
import { config } from '../../../../core/config';
import { logger } from '../../services';
import { ApiResponse } from '../response';
import ErrorResponse from './response';

/** Errors raised by express/body-parser before any controller runs. */
const fromFramework = (err: {
  type?: string;
  status?: number;
  message?: string;
}): ErrorResponse | null => {
  if (err.type === 'entity.parse.failed') {
    return new ErrorResponse(
      'BAD_REQUEST',
      'The request body is not valid JSON.',
    );
  }
  if (err.type === 'entity.too.large') {
    return new ErrorResponse('PAYLOAD_TOO_LARGE');
  }
  return null;
};

const errorHandler = (
  err: Error & { type?: string; status?: number },
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  void next;

  if (err instanceof ErrorResponse) {
    if (err.statusCode >= 500) logger.error(err.message, err);
    ApiResponse.error(res, { success: false, error: err });
    return;
  }

  const framework = fromFramework(err);
  if (framework) {
    ApiResponse.error(res, { success: false, error: framework });
    return;
  }

  // Anything else is a bug. Log everything, tell the client very little.
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
  const generic = new ErrorResponse(
    'GENERAL_ERROR',
    config.runningProd ? undefined : err.message,
  );
  ApiResponse.error(res, { success: false, error: generic });
};

export default errorHandler;
