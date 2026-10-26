import { ErrorResponse, ServiceResponse } from '../../../../common/shared';
import { BaseRepository } from '../_repositories/base.repository';
import type {
  Filter,
  InsertRow,
  Row,
  Sort,
  TableName,
  UpdateRow,
} from '../types';

const MAX_PAGE_SIZE = 500;

export class BaseService<T extends TableName, R extends BaseRepository<T>> {
  protected repository: R;
  /** Columns matched (case-insensitively) by `searchTerm`. */
  protected searchFields: string[] = [];
  /**
   * Columns a *caller* (i.e. the request's query string) may filter on.
   * Anything else in `filter` is dropped. Server-side conditions such as
   * `owner_id` go in `query` instead and are always applied.
   */
  protected allowedFilterFields: string[] = [];

  constructor(repository: R) {
    this.repository = repository;
  }

  private filterQueryFields(filter: Record<string, unknown>): Filter<T> {
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(filter)) {
      if (this.allowedFilterFields.includes(key)) filtered[key] = filter[key];
    }
    return filtered as Filter<T>;
  }

  async create(input: InsertRow<T>): Promise<ServiceResponse<Row<T>>> {
    try {
      const document = await this.repository.create(input);
      return { success: true, document };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  async findOne(query: Filter<T>): Promise<ServiceResponse<Row<T>>> {
    try {
      const document = await this.repository.findOne(query);
      if (!document) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'The requested document was not found.',
        );
      }
      return { success: true, document };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  async findAll({
    query = {},
    filter = {},
    sort = {},
    page = 1,
    limit = 50,
    searchTerm = '',
    paginate = true,
  }: {
    /** Trusted conditions from server code (e.g. `{ owner_id }`). Always applied. */
    query?: Filter<T>;
    /** Untrusted conditions (e.g. `req.query`). Only `allowedFilterFields` pass. */
    filter?: Record<string, unknown>;
    sort?: Sort<T>;
    page?: number | string;
    limit?: number | string;
    searchTerm?: string;
    paginate?: boolean;
  } = {}): Promise<ServiceResponse<Row<T>>> {
    try {
      const pageNumber = Math.max(1, Math.floor(Number(page)) || 1);
      const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, Math.floor(Number(limit)) || 50),
      );

      const { rows, count } = await this.repository.findAndCount(
        { ...this.filterQueryFields(filter), ...query },
        {
          sort,
          ...(paginate
            ? { limit: pageSize, offset: (pageNumber - 1) * pageSize }
            : {}),
          ...(searchTerm && this.searchFields.length
            ? { search: { columns: this.searchFields, term: searchTerm } }
            : {}),
        },
      );

      return {
        success: true,
        total: count,
        results: rows.length,
        documents: rows,
        page: paginate ? pageNumber : undefined,
        limit: paginate ? pageSize : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  async update(
    query: Filter<T>,
    updateInput: UpdateRow<T>,
  ): Promise<ServiceResponse<Row<T>>> {
    try {
      const document = await this.repository.update(query, updateInput);
      if (!document) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'Document to update not found.',
        );
      }
      return { success: true, document };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  async delete(query: Filter<T>): Promise<ServiceResponse<Row<T>>> {
    try {
      const document = await this.repository.delete(query);
      if (!document) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'Document to delete not found.',
        );
      }
      return { success: true, document };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }
}
