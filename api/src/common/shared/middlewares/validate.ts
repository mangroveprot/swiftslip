import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { ErrorResponse } from '../utils/error';

type Source = 'body' | 'query' | 'params';

/**
 * Validates `req.body` (or `query` / `params`) against a zod schema.
 * On success the parsed value replaces the original, so defaults, coercion
 * and stripped unknown keys apply downstream. On failure it forwards ONE
 * ErrorResponse, which the global error handler turns into the standard shape.
 *
 *   router.post('/', validate(createRecordInput), Controller.create);
 *   router.get('/:id', validate(idInput, 'params'), Controller.get);
 */
export const validate =
  (schema: ZodTypeAny, source: Source = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) =>
        issue.path.length
          ? `${issue.path.join('.')}: ${issue.message}`
          : issue.message,
      );
      next(new ErrorResponse('VALIDATION_ERROR', 'Validation error', details));
      return;
    }

    // `req.query` is a getter on some Express versions, so define, don't assign.
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
