import type { OptionKind } from '@swiftslip/shared/inventory';

/**
 * The five RGC lookup tables behind the Settings page, described once so the
 * repository does not repeat the same SQL five times. The values are fixed
 * identifiers (never user input) and are escaped with `sql(...)` anyway.
 */
export type OptionTable = {
  table: string;
  idColumn: string;
  nameColumn: string;
  /** Singular noun used in messages ("asset type"). */
  label: string;
  /** Column of `assets` that points at this table (for usage counts). */
  assetColumn: string;
};

export const OPTION_TABLES: Record<OptionKind, OptionTable> = {
  branch: {
    table: 'branches',
    idColumn: 'branch_id',
    nameColumn: 'branch_name',
    label: 'branch',
    assetColumn: 'branch_id',
  },
  department: {
    table: 'departments',
    idColumn: 'department_id',
    nameColumn: 'department_name',
    label: 'department',
    assetColumn: 'department_id',
  },
  status: {
    table: 'status_options',
    idColumn: 'status_id',
    nameColumn: 'status_name',
    label: 'status',
    assetColumn: 'status_id',
  },
  condition: {
    table: 'condition_options',
    idColumn: 'condition_id',
    nameColumn: 'condition_name',
    label: 'condition',
    assetColumn: 'condition_id',
  },
  assetType: {
    table: 'asset_type_options',
    idColumn: 'type_id',
    nameColumn: 'type_name',
    label: 'asset type',
    assetColumn: 'type_id',
  },
};
