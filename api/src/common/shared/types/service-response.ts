import type { ErrorResponse } from '../utils/error';

/**
 * What every service method returns. `success` is a literal, so checking it
 * narrows the type — no `as SuccessResponseType<...>` casts needed:
 *
 *   const res = await UserService.findOne({ id });
 *   if (!res.success) throw res;      // res is ErrorResponseType here
 *   res.document;                      // and a success response here
 */
export type SuccessResponseType<T> = {
  success: true;
  document?: T;
  documents?: T[];
  /** Rows matching the query, ignoring pagination. */
  total?: number;
  /** Rows in this response. */
  results?: number;
  page?: number;
  limit?: number;
};

export type ErrorResponseType = {
  success: false;
  error: ErrorResponse;
};

export type ServiceResponse<T> = SuccessResponseType<T> | ErrorResponseType;
