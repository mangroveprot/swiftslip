import { Response } from 'express';
import { config } from '../../../../core/config';
import { ErrorResponseType, SuccessResponseType } from '../../types';
import ErrorResponse from '../error/response';

const isErrorResponseType = (value: unknown): value is ErrorResponseType =>
  typeof value === 'object' &&
  value !== null &&
  (value as ErrorResponseType).error instanceof ErrorResponse;

export class ApiResponse {
  static success<T>(
    res: Response,
    data: SuccessResponseType<T>,
    statusCode: number = 200,
  ): Response {
    return res.status(statusCode).json(data);
  }

  /**
   * Accepts what controllers actually have in their `catch`: a failed service
   * response, an ErrorResponse, or anything else that was thrown.
   */
  static error(res: Response, error: ErrorResponseType | unknown): Response {
    const err = ApiResponse.toErrorResponse(error);
    return res.status(err.statusCode).json({
      success: false,
      error: {
        status: err.statusCode,
        code: err.code,
        message: err.message,
        suggestions: err.suggestions,
      },
    });
  }

  private static toErrorResponse(error: unknown): ErrorResponse {
    if (error instanceof ErrorResponse) return error;
    if (isErrorResponseType(error)) return error.error;
    // Something unexpected was thrown: don't leak internals in production.
    return new ErrorResponse(
      'INTERNAL_SERVER_ERROR',
      config.runningProd || !(error instanceof Error)
        ? undefined
        : error.message,
    );
  }
}

export default ApiResponse;
