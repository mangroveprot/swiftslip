import type { RetentionFormType } from '@swiftslip/shared/schemas';

/**
 * The form tables the cleanup can walk, keyed by the checkbox the admin
 * ticks in Settings → Data retention. Not every table has the same columns
 * (`dtr_records` has no approval flag; LOA, OT and DTR records carry
 * `other_attachments`; LIQ has neither and names its owner `prepared_by`), so
 * the service treats the rows as the loose `ExpiredRow` shape below.
 */
export const RETENTION_TABLES = {
  dtr: 'dtr_records',
  ob: 'ob_forms',
  loa: 'loa_forms',
  cos: 'cos_forms',
  ot: 'ot_forms',
  liq: 'liq_forms',
} as const satisfies Record<RetentionFormType, string>;

export type RetentionTable = (typeof RETENTION_TABLES)[RetentionFormType];

/** Tables with the extra supporting-files jsonb list (LOA, OT and DTR). */
export const OTHER_FILES_TABLES: readonly RetentionFormType[] = [
  'dtr',
  'loa',
  'ot',
];

/** What the cleanup selects of an expired row — only what the rules need. */
export const SELECTS: Record<RetentionFormType, string> = {
  dtr: 'id,attachment_path,attachment_backend,other_attachments,name,emp_no',
  ob: 'id,attachment_path,attachment_backend,attachment_approved,employee_name,date_filed',
  loa: 'id,attachment_path,attachment_backend,attachment_approved,other_attachments,employee_name,date_filed',
  cos: 'id,attachment_path,attachment_backend,attachment_approved,employee_name,date_filed',
  ot: 'id,attachment_path,attachment_backend,attachment_approved,other_attachments,employee_name,date_filed',
  liq: 'id,prepared_by,date_prepared',
};

/**
 * The columns the cleanup reads, as one loose shape. A row only carries the
 * ones its own table has — the predicates below always ask before reading.
 */
export type ExpiredRow = {
  id: string;
  attachment_path?: string | null;
  attachment_backend?: string | null;
  attachment_approved?: boolean;
  other_attachments?: unknown;
  /** Non-DTR forms. */
  employee_name?: string;
  date_filed?: string;
  /** DTR only. */
  name?: string;
  emp_no?: string;
};

/** Rows processed per select / per delete statement. */
export const CLEANUP_BATCH = 200;
