export type ActivityAction =
  | 'signin.success'
  | 'signin.failed'
  | 'ob.created'
  | 'ob.deleted'
  | 'loa.created'
  | 'loa.deleted'
  | 'cos.created'
  | 'cos.deleted'
  | 'ot.created'
  | 'ot.deleted'
  | 'record.created'
  | 'record.deleted'
  | 'attachment.uploaded'
  | 'attachment.removed'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'access.updated'
  | 'org.updated'
  | 'asset.created'
  | 'asset.updated'
  | 'report.downloaded'
  | 'ai.request'
  | 'cleanup.forms';

export type ActivityEntry = {
  action: ActivityAction;
  /** Who did it — absent on rejected sign-in attempts (nobody was verified). */
  actorId?: string;
  actorName?: string;
  actorNumber?: string;
  /** What it happened to, in plain words (person, form, account…). */
  target?: string;
  detail?: string | null;
  /** Remote address; sign-in attempts only. */
  ip?: string;
};
