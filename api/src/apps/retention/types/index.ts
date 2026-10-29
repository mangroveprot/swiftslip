import type { RetentionFormType } from '@swiftslip/shared/schemas';

/**
 * The five form tables the cleanup can walk, keyed by the checkbox the admin
 * ticks in Settings → Data retention. Not every table has the same columns
 * (`dtr_records` has no approval flag, LOA and OT carry `other_attachments`),
 * so the service treats the rows as the loose `ExpiredRow` shape below.
 */
export const RETENTION_TABLES = {
  dtr: 'dtr_records',
  ob: 'ob_forms',
  loa: 'loa_forms',
  cos: 'cos_forms',
  ot: 'ot_forms',
} as const satisfies Record<RetentionFormType, string>;

export type RetentionTable = (typeof RETENTION_TABLES)[RetentionFormType];

/** Tables with the extra supporting-files jsonb list (LOA and OT). */
export const OTHER_FILES_TABLES: readonly RetentionFormType[] = ['loa', 'ot'];

/** What the cleanup selects of an expired row — only what the rules need. */
export const SELECTS: Record<RetentionFormType, string> = {
  // DTRs are certified, not approved: no approval columns exist here.
  dtr: 'id,attachment_path,name,emp_no',
  ob: 'id,attachment_path,attachment_approved,employee_name,date_filed',
  loa: 'id,attachment_path,attachment_approved,other_attachments,employee_name,date_filed',
  cos: 'id,attachment_path,attachment_approved,employee_name,date_filed',
  ot: 'id,attachment_path,attachment_approved,other_attachments,employee_name,date_filed',
};

/**
 * The columns the cleanup reads, as one loose shape. A row only carries the
 * ones its own table has — the predicates below always ask before reading.
 */
export type ExpiredRow = {
  id: string;
  attachment_path?: string | null;
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
