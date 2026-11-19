import type { LoaOtherFile } from '@swiftslip/shared/types';

/**
 * Rows that can hold a document; `(id, owner_id)` always identifies one.
 *
 * Kept as a runtime list, not only a type, because the storage orphan scan
 * must read exactly the tables uploads can target. A form added here but not
 * wired into the scan would have every one of its attachments read as garbage.
 */
export const ATTACHMENT_TABLES = [
  'ob_forms',
  'loa_forms',
  'cos_forms',
  'ot_forms',
  'liq_forms',
  'dtr_records',
] as const;

export type AttachmentTable = (typeof ATTACHMENT_TABLES)[number];

/**
 * Rows that carry the extra `other_attachments` list (the "supporting
 * documents" card). LOA, OT and DTR records have it, NOT COS, OB or LIQ.
 */
export const OTHER_ATTACHMENT_TABLES = [
  'loa_forms',
  'ot_forms',
  'dtr_records',
] as const;

export type OtherAttachmentTable = (typeof OTHER_ATTACHMENT_TABLES)[number];

/** Type guard for the tables that own the `other_attachments` jsonb list. */
export function hasOtherAttachments(
  table: AttachmentTable,
): table is OtherAttachmentTable {
  return (OTHER_ATTACHMENT_TABLES as readonly string[]).includes(table);
}

/** What an attachment route is attached to; set by `attachmentTarget`. */
export type AttachmentTarget = {
  table: AttachmentTable;
  /** The row's human name in error messages ("Form not found."). */
  entity: string;
  /** Same, for the extra-files endpoints. */
  otherEntity: string;
  /** How the row is named in the admin activity log ("LOA form <id>"). */
  logLabel: string;
};

export type OtherFile = LoaOtherFile;
