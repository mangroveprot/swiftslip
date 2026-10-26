interface ErrorCode {
  code: string;
  message: string;
  statusCode: number;
}

/**
 * Every error the API can raise. `ErrorResponse` only accepts one of these
 * keys, so a typo in a code is a compile error instead of a silent 500.
 */
const ErrorCodes = {
  BAD_REQUEST: {
    code: 'BAD_REQUEST',
    message: 'The request could not be understood.',
    statusCode: 400,
  },
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'The request contains invalid data.',
    statusCode: 400,
  },
  REQUIRED_FIELD_MISSING: {
    code: 'REQUIRED_FIELD_MISSING',
    message: 'Required field(s) missing.',
    statusCode: 400,
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Please sign in first.',
    statusCode: 401,
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'You are not allowed to do this.',
    statusCode: 403,
  },
  NOT_FOUND_ERROR: {
    code: 'NOT_FOUND_ERROR',
    message: 'The requested item could not be found.',
    statusCode: 404,
  },
  UNIQUE_FIELD_ERROR: {
    code: 'UNIQUE_FIELD_ERROR',
    message: 'A field that is supposed to be unique already exists.',
    statusCode: 409,
  },
  IN_USE_ERROR: {
    code: 'IN_USE_ERROR',
    message: 'This item is still in use.',
    statusCode: 409,
  },
  REFERENCED_ERROR: {
    code: 'REFERENCED_ERROR',
    message:
      'Cannot delete: still referenced by other records. Reassign or remove those first.',
    statusCode: 409,
  },
  PAYLOAD_TOO_LARGE: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'The request is too large.',
    statusCode: 413,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'This type of file is not accepted.',
    statusCode: 415,
  },
  TOO_MANY_REQUESTS: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Please try again later.',
    statusCode: 429,
  },
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    message: 'There was a problem accessing the database.',
    statusCode: 500,
  },
  GENERAL_ERROR: {
    code: 'GENERAL_ERROR',
    message: 'An unexpected error occurred.',
    statusCode: 500,
  },
  INTERNAL_SERVER_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal Server Error',
    statusCode: 500,
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'This feature is not available right now.',
    statusCode: 503,
  },
} as const satisfies Record<string, ErrorCode>;

type ErrorCodeKey = keyof typeof ErrorCodes;

export default ErrorCodes;
export type { ErrorCode, ErrorCodeKey };
