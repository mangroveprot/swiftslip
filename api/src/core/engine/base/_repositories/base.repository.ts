/* eslint-disable @typescript-eslint/no-explicit-any --
   This file is the ONE place the typed Supabase client is loosened: column
   names reach the repository as strings at runtime, so the query builder is
   handled untyped here and every public method hands back typed rows. */
import type { PostgrestError } from '@supabase/supabase-js';

import { ErrorResponse } from '../../../../common/shared/utils';
import { escapeLike } from '../../../../helpers/string';
import { getDb } from '../../../framework/databases/supabase';
import type {
  Filter,
  FilterOperators,
  FilterValue,
  FindOptions,
  InsertRow,
  Row,
  TableName,
  UpdateRow,
} from '../types';

export interface RepositoryOptions {
  /** Column that uniquely identifies a row. Defaults to `id`. */
  primaryKey?: string;
  /** Column stamped with the current time on every update (e.g. `updated_at`). */
  updatedAtColumn?: string | null;
}

const toDb = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value;

/** PostgREST `or(...)` values: wrap in quotes, escaping `\` and `"`. */
const quoteFilterValue = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function applyOperators(builder: any, column: string, ops: FilterOperators) {
  for (const [op, raw] of Object.entries(ops)) {
    if (raw === undefined) continue;
    switch (op) {
      case 'eq':
        builder = builder.eq(column, toDb(raw));
        break;
      case 'neq':
        builder = builder.neq(column, toDb(raw));
        break;
      case 'gt':
        builder = builder.gt(column, toDb(raw));
        break;
      case 'gte':
        builder = builder.gte(column, toDb(raw));
        break;
      case 'lt':
        builder = builder.lt(column, toDb(raw));
        break;
      case 'lte':
        builder = builder.lte(column, toDb(raw));
        break;
      case 'like':
        builder = builder.like(column, raw);
        break;
      case 'ilike':
        builder = builder.ilike(column, raw);
        break;
      case 'in':
        builder = builder.in(column, (raw as unknown[]).map(toDb));
        break;
      case 'isNull':
        builder = raw
          ? builder.is(column, null)
          : builder.not(column, 'is', null);
        break;
    }
  }
  return builder;
}

function applyFilter(builder: any, filter: Record<string, FilterValue>) {
  for (const [column, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    if (value === null) {
      builder = builder.is(column, null);
    } else if (Array.isArray(value)) {
      builder = builder.in(column, value.map(toDb));
    } else if (value instanceof Date) {
      builder = builder.eq(column, value.toISOString());
    } else if (typeof value === 'object') {
      builder = applyOperators(builder, column, value);
    } else {
      builder = builder.eq(column, value);
    }
  }
  return builder;
}

export class BaseRepository<T extends TableName> {
  protected readonly table: T;
  protected readonly primaryKey: string;
  protected readonly updatedAtColumn: string | null;

  constructor(table: T, options: RepositoryOptions = {}) {
    this.table = table;
    this.primaryKey = options.primaryKey ?? 'id';
    this.updatedAtColumn = options.updatedAtColumn ?? null;
  }

  protected from(): any {
    return (getDb() as any).from(this.table);
  }

  /**
   * Turn a database error into an ErrorResponse. This is the single place
   * Postgres/PostgREST codes are mapped, so services never inspect them.
   */
  protected fail(error: PostgrestError): never {
    const original = error instanceof Error ? error : undefined;
    switch (error.code) {
      case '23505':
        throw new ErrorResponse(
          'UNIQUE_FIELD_ERROR',
          undefined,
          error.details ? [error.details] : [],
          original,
        );
      case '23503':
        throw new ErrorResponse(
          'BAD_REQUEST',
          'A referenced record does not exist, or is still in use.',
          [],
          original,
        );
      case '23502':
        throw new ErrorResponse(
          'REQUIRED_FIELD_MISSING',
          error.message,
          [],
          original,
        );
      case '22P02':
      case '22007':
      case '22008':
        throw new ErrorResponse(
          'BAD_REQUEST',
          'A value has the wrong format.',
          [],
          original,
        );
      case 'PGRST116':
        throw new ErrorResponse('NOT_FOUND_ERROR', undefined, [], original);
      default:
        throw new ErrorResponse('DATABASE_ERROR', error.message, [], original);
    }
  }

  /** `update` / `delete` with no filter would touch every row. Never allow it. */
  private requireFilter(filter: object, action: string): void {
    if (Object.keys(filter).length === 0) {
      throw new ErrorResponse(
        'BAD_REQUEST',
        `Refusing to ${action} without a filter.`,
      );
    }
  }

  private stamp(patch: UpdateRow<T>): UpdateRow<T> {
    const column = this.updatedAtColumn;
    if (!column || column in (patch as object)) return patch;
    return { ...patch, [column]: new Date().toISOString() } as UpdateRow<T>;
  }

  private buildSelect(
    filter: Filter<T>,
    options: FindOptions<T>,
    count: 'exact' | undefined,
  ) {
    let query = this.from().select(
      options.select ?? '*',
      count ? { count } : undefined,
    );
    query = applyFilter(query, filter as Record<string, FilterValue>);

    if (options.search?.term && options.search.columns.length) {
      const pattern = quoteFilterValue(`%${escapeLike(options.search.term)}%`);
      query = query.or(
        options.search.columns.map((c) => `${c}.ilike.${pattern}`).join(','),
      );
    }

    for (const [column, direction] of Object.entries(options.sort ?? {})) {
      query = query.order(column, { ascending: direction !== 'desc' });
    }

    if (options.limit !== undefined) {
      const offset = options.offset ?? 0;
      query = query.range(offset, offset + options.limit - 1);
    }
    return query;
  }

  async create(input: InsertRow<T>): Promise<Row<T>> {
    const { data, error } = await this.from().insert(input).select().single();
    if (error) this.fail(error);
    return data as Row<T>;
  }

  async createMany(inputs: InsertRow<T>[]): Promise<Row<T>[]> {
    if (inputs.length === 0) return [];
    const { data, error } = await this.from().insert(inputs).select();
    if (error) this.fail(error);
    return (data ?? []) as Row<T>[];
  }

  /** Insert, or update the row that already has the same `onConflict` key. */
  async upsert(input: InsertRow<T>, onConflict: string): Promise<Row<T>> {
    const { data, error } = await this.from()
      .upsert(input, { onConflict })
      .select()
      .single();
    if (error) this.fail(error);
    return data as Row<T>;
  }

  async findAll(
    filter: Filter<T> = {},
    options: FindOptions<T> = {},
  ): Promise<Row<T>[]> {
    const { data, error } = await this.buildSelect(filter, options, undefined);
    if (error) this.fail(error);
    return (data ?? []) as Row<T>[];
  }

  /** Like `findAll`, plus how many rows match before `limit`/`offset`. */
  async findAndCount(
    filter: Filter<T> = {},
    options: FindOptions<T> = {},
  ): Promise<{ rows: Row<T>[]; count: number }> {
    const { data, error, count } = await this.buildSelect(
      filter,
      options,
      'exact',
    );
    if (error) this.fail(error);
    const rows = (data ?? []) as Row<T>[];
    return { rows, count: count ?? rows.length };
  }

  async findOne(
    filter: Filter<T>,
    options: Pick<FindOptions<T>, 'select' | 'sort'> = {},
  ): Promise<Row<T> | null> {
    const rows = await this.findAll(filter, { ...options, limit: 1 });
    return rows[0] ?? null;
  }

  async count(filter: Filter<T> = {}): Promise<number> {
    const { count, error } = await applyFilter(
      this.from().select(this.primaryKey, { count: 'exact', head: true }),
      filter as Record<string, FilterValue>,
    );
    if (error) this.fail(error);
    return count ?? 0;
  }

  /** Update ONE row: the first that matches. Returns it, or null if none did. */
  async update(filter: Filter<T>, patch: UpdateRow<T>): Promise<Row<T> | null> {
    this.requireFilter(filter, 'update');
    const target = await this.findOne(filter, { select: this.primaryKey });
    if (!target) return null;

    // Pin to the primary key (and keep the caller's filter, e.g. owner_id, in
    // force) so a filter that matches several rows can't touch more than one.
    const { data, error } = await applyFilter(
      this.from()
        .update(this.stamp(patch))
        .eq(
          this.primaryKey,
          (target as Record<string, unknown>)[this.primaryKey],
        ),
      filter as Record<string, FilterValue>,
    ).select();
    if (error) this.fail(error);
    return ((data ?? [])[0] as Row<T> | undefined) ?? null;
  }

  async updateMany(
    filter: Filter<T>,
    patch: UpdateRow<T>,
  ): Promise<{ modifiedCount: number }> {
    this.requireFilter(filter, 'update');
    const { data, error } = await applyFilter(
      this.from().update(this.stamp(patch)),
      filter as Record<string, FilterValue>,
    ).select(this.primaryKey);
    if (error) this.fail(error);
    return { modifiedCount: (data ?? []).length };
  }

  /** Delete ONE row: the first that matches. Returns it, or null if none did. */
  async delete(filter: Filter<T>): Promise<Row<T> | null> {
    this.requireFilter(filter, 'delete');
    const target = await this.findOne(filter, { select: this.primaryKey });
    if (!target) return null;

    const { data, error } = await applyFilter(
      this.from()
        .delete()
        .eq(
          this.primaryKey,
          (target as Record<string, unknown>)[this.primaryKey],
        ),
      filter as Record<string, FilterValue>,
    ).select();
    if (error) this.fail(error);
    return ((data ?? [])[0] as Row<T> | undefined) ?? null;
  }

  async deleteMany(filter: Filter<T>): Promise<{ deletedCount: number }> {
    this.requireFilter(filter, 'delete');
    const { data, error } = await applyFilter(
      this.from().delete(),
      filter as Record<string, FilterValue>,
    ).select(this.primaryKey);
    if (error) this.fail(error);
    return { deletedCount: (data ?? []).length };
  }
}
