import type { LoaOtherFile } from '@swiftslip/shared/types';

/** Rows that can hold a document; `(id, owner_id)` always identifies one. */
export type AttachmentTable =
  'ob_forms' | 'loa_forms' | 'cos_forms' | 'ot_forms' | 'dtr_records';

/**
 * Rows that carry the extra `other_attachments` list (the "supporting
 * documents" card). Only LOA and OT have it — NOT COS, OB or DTR records.
 */
export type OtherAttachmentTable = Extract<
  AttachmentTable,
  'loa_forms' | 'ot_forms'
>;

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
