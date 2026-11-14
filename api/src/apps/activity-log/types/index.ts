export type ActivityAction =
  | 'signin.success'
  | 'signin.failed'
  | 'ob.created'
  | 'ob.deleted'
  | 'ob.submitted'
  | 'ob.resubmit_cancelled'
  | 'ob.hr_approved'
  | 'ob.supervisor_approved'
  | 'ob.hr_rejected'
  | 'ob.departure_signed'
  | 'ob.arrival_signed'
  | 'loa.created'
  | 'loa.deleted'
  | 'cos.created'
  | 'cos.deleted'
  | 'ot.created'
  | 'ot.deleted'
  | 'liq.created'
  | 'liq.deleted'
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
  | 'showroom.created'
  | 'showroom.updated'
  | 'showroom.deleted'
  | 'showroom.stock_updated'
  | 'report.downloaded'
  | 'ai.request'
  | 'cleanup.forms'
  | 'storage.rule_changed'
  | 'storage.orphans_cleaned';

export type ActivityEntry = {
  action: ActivityAction;
  /** Who did it, absent on rejected sign-in attempts (nobody was verified). */
  actorId?: string;
  actorName?: string;
  actorNumber?: string;
  /** What it happened to, in plain words (person, form, account…). */
  target?: string;
  detail?: string | null;
  /** Remote address; sign-in attempts only. */
  ip?: string;
};
