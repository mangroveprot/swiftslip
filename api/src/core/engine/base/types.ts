import type { Database } from '../../framework/databases/supabase';

type PublicTables = Database['public']['Tables'];

/** Name of any table in the generated Supabase types. */
export type TableName = keyof PublicTables & string;

export type Row<T extends TableName> = PublicTables[T]['Row'];
export type InsertRow<T extends TableName> = PublicTables[T]['Insert'];
export type UpdateRow<T extends TableName> = PublicTables[T]['Update'];

type Scalar = string | number | boolean | Date | null;

export type FilterOperators = {
  eq?: Scalar;
  neq?: Scalar;
  gt?: Scalar;
  gte?: Scalar;
  lt?: Scalar;
  lte?: Scalar;
  like?: string;
  ilike?: string;
  in?: Scalar[];
  /** `true` → IS NULL, `false` → IS NOT NULL */
  isNull?: boolean;
};

/**
 *  'abc'            → column = 'abc'
 *  null             → column IS NULL
 *  ['a', 'b']       → column IN ('a', 'b')
 *  { gte: 5 }       → column >= 5
 */
export type FilterValue = Scalar | Scalar[] | FilterOperators;

/** Column → condition. All conditions are ANDed. */
export type Filter<T extends TableName> = {
  [K in keyof Row<T> & string]?: FilterValue;
};

export type Sort<T extends TableName> = {
  [K in keyof Row<T> & string]?: 'asc' | 'desc';
};

export interface FindOptions<T extends TableName> {
  /** PostgREST select string. Defaults to every column. */
  select?: string;
  sort?: Sort<T>;
  limit?: number;
  offset?: number;
  /** Case-insensitive "contains" match on any of `columns`. */
  search?: { columns: string[]; term: string };
}
