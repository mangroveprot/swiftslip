import { getRgcSql, type RgcSql } from '../../../framework/databases/postgres';
import { ErrorResponse } from '../../../../common/shared/utils/error';

/**
 * Base for repositories that talk to the RGC inventory database with raw SQL.
 * Every query goes through `run()`, the single place driver/Postgres errors
 * become `ErrorResponse` — so services never inspect error codes.
 */
export abstract class RgcRepository {
  protected get sql(): RgcSql {
    return getRgcSql();
  }

  protected async run<T>(work: (sql: RgcSql) => Promise<T>): Promise<T> {
    try {
      return await work(this.sql);
    } catch (error) {
      throw this.toError(error);
    }
  }

  protected toError(error: unknown): ErrorResponse {
    if (error instanceof ErrorResponse) return error;
    const original = error instanceof Error ? error : undefined;
    const message = original?.message ?? String(error);
    const code = (error as { code?: string } | null)?.code;

    // The original app's `Friendly()`: referential-integrity noise becomes one sentence.
    if (
      code === '23503' ||
      /FOREIGN KEY|still assigned|cannot delete/i.test(message)
    ) {
      return new ErrorResponse('REFERENCED_ERROR', undefined, [], original);
    }
    if (code === '23505') {
      return new ErrorResponse('UNIQUE_FIELD_ERROR', undefined, [], original);
    }
    // `raise exception` from the guard triggers (e.g. desktop details on a non-desktop type).
    if (code === 'P0001') {
      return new ErrorResponse('BAD_REQUEST', message, [], original);
    }
    return new ErrorResponse('DATABASE_ERROR', message, [], original);
  }
}
