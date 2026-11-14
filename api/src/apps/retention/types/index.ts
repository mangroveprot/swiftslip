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

/** What the cleanup selects of an expired row, only what the rules need. */
export const SELECTS: Record<RetentionFormType, string> = {
  dtr: 'id,owner_id,attachment_path,attachment_backend,other_attachments,name,emp_no,created_at',
  ob: 'id,owner_id,attachment_path,attachment_backend,employee_name,date_filed,created_at',
  loa: 'id,owner_id,attachment_path,attachment_backend,other_attachments,employee_name,date_filed,created_at',
  cos: 'id,owner_id,attachment_path,attachment_backend,employee_name,date_filed,created_at',
  ot: 'id,owner_id,attachment_path,attachment_backend,other_attachments,employee_name,date_filed,created_at',
  liq: 'id,owner_id,prepared_by,date_prepared,created_at',
};

/**
 * Where a deleted form's owner is sent when the bell row is opened.
 *
 * The form itself is gone, so its record route would 404: the link points at
 * the type's list instead. A notification link is a stored relative path, so
 * these must match routes the router actually has.
 */
export const FORM_LINKS: Record<RetentionFormType, string> = {
  dtr: '/records',
  ob: '/official-business',
  loa: '/leave-of-absence',
  cos: '/change-of-schedule',
  ot: '/overtime',
  liq: '/liquidation',
};

/**
 * The columns the cleanup reads, as one loose shape. A row only carries the
 * ones its own table has, the predicates below always ask before reading.
 */
export type ExpiredRow = {
  id: string;
  /**
   * The account that filed the form (`users.id`), and therefore the one the
   * cleanup notifies. Nullable in the table for rows imported before
   * ownership existed, so the run skips a row without an owner.
   */
  owner_id?: string | null;
  /** Every form table stamps one; the preview list dates DTR from it. */
  created_at?: string;
  attachment_path?: string | null;
  attachment_backend?: string | null;
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
