import ErrorCodes, { ErrorCode, ErrorCodeKey } from './codes';

class ErrorResponse extends Error {
  public statusCode: number;
  public code: string;
  public suggestions: string[];
  public originalError?: Error;

  constructor(
    code: ErrorCodeKey,
    message?: string,
    suggestions: string[] = [],
    originalError?: Error,
  ) {
    const errorCode: ErrorCode = ErrorCodes[code] ?? ErrorCodes.GENERAL_ERROR;
    super(message || errorCode.message);
    this.name = 'ErrorResponse';
    this.code = errorCode.code;
    this.statusCode = errorCode.statusCode;
    this.suggestions = suggestions;
    this.originalError = originalError;

    // keep the stack of the error that actually happened
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
  }
}

export default ErrorResponse;
