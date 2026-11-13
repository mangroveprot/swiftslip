/**
 * The HR approval workflow for Official Business forms — statuses, labels and
 * the derived facts both the employee UI and the HR review queue need.
 *
 * Kept in `shared` because the API enforces the state machine and the web UI
 * renders it; a second copy of the status list is how the two drift apart.
 *
 * SCOPE — Official Business only (see HR_APPROVAL_SPEC.md §1). The other four
 * form flows are untouched.
 */
import type { ObEntry, ObForm } from "./types";

/** The department whose accounts act as HR reviewers. */
export const HR_DEPARTMENT = "HR Department";

/** The OB approval states, in flow order. Stored plain in `ob_forms.hr_status`. */
export const OB_HR_STATUSES = [
  "draft",
  "submitted",
  "waiting_supervisor",
  "approved",
  "rejected",
  "departed",
  "completed",
] as const;

export type ObHrStatus = (typeof OB_HR_STATUSES)[number];

/** Plain-English label for each state — the badge text everywhere. */
export const OB_HR_STATUS_LABELS: Record<ObHrStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for HR",
  waiting_supervisor: "Waiting for Supervisor",
  approved: "Ready for departure",
  rejected: "Rejected",
  departed: "On OB",
  completed: "Completed",
};

/**
 * One field the employee changed before a resubmit — keyed the same way the
 * required-field list keys a cell (`entry:<idx>:<column>`), so the HR sheet can
 * put a "Changed / Was: …" note under exactly that box.
 */
export type ObResubmitChange = {
  /** Form field key, or `entry:<idx>:<column>` for an itinerary cell. */
  key: string;
  /** What the paper sheet calls it ("Destination", "Purpose(s)", "Date of OB"). */
  label: string;
  /** The value HR last reviewed. */
  from: string;
  /** The value the employee sent back. */
  to: string;
};

/**
 * The HR-owned columns as they stood when an edited form went back to HR
 * (migration 0039). A canceled resubmission restores them, so the approval and
 * sign-offs the employee withdrew are exactly the ones that come back.
 */
export type ObResubmitHrSnapshot = {
  hr_approved_by?: string | null;
  hr_approved_at?: string | null;
  departure_date?: string;
  departure_time?: string;
  departure_signed_by?: string | null;
  departure_signed_at?: string | null;
  residence?: string;
  destination?: string;
  arrival_date?: string;
  arrival_time?: string;
  arrival_signed_by?: string | null;
  arrival_signed_at?: string | null;
  supervisor_approved_at?: string | null;
};

/**
 * One trip back to HR (migration 0037): the form has been through the queue
 * before and is in it again. `how` says why it came back — `rejected` is a
 * resubmit after HR bounced it, `edited` is content changed after approval —
 * and `reason` keeps HR's rejection text the resubmit answers (the live
 * `hr_reject_reason` column is cleared on the next submit, so without this the
 * history would lose what was actually fixed).
 *
 * `changes` (migration 0038) is the diff between the version HR last reviewed
 * and the one sent back. The `rejected_*` fields are the rejection this event
 * answers, kept here because the live columns are cleared on resubmit; the
 * resolved name/position/photo are decorated on read for the cards.
 *
 * An `edited` event also carries what the employee withdrew (migration 0039):
 * the status before it, the earlier submit stamp and HR's sign-offs, so
 * `cancelResubmit` can put the approved version back without a version table.
 */
export type ObResubmitEvent = {
  /** When it went back to HR (ISO stamp). */
  at: string;
  how: "rejected" | "edited";
  /** HR's rejection reason at the time, when there was one. */
  reason?: string;
  /** When HR rejected the version this resubmit answers. */
  rejected_at?: string;
  /** The HR account that rejected that version. */
  rejected_by?: string;
  /** What the employee changed, field by field (migration 0038). */
  changes?: ObResubmitChange[];
  /** The HR state before an edited resubmit (migration 0039). */
  from_status?: ObHrStatus;
  /** The submit stamp this edited resubmit replaced; restored on cancel. */
  previous_submitted_at?: string | null;
  /** HR's sign-offs at resubmit time; restored on cancel. */
  hr?: ObResubmitHrSnapshot;
  /** Resolved reviewer profile, added by the API on read (never stored). */
  rejected_by_name?: string;
  rejected_by_position?: string;
  rejected_by_photo?: string;
};

/**
 * One complete version of the employee-written content — the header fields and
 * the itinerary rows. Stored whole on `ob_forms.pending_content` while a
 * post-approval edit waits as a draft, and on `previous_content` while a
 * resubmission sits in HR's queue so it can be withdrawn (migration 0039).
 */
export type ObFormContent = {
  form: ObForm;
  entries: ObEntry[];
};

/**
 * The content HR last reviewed, stored on `ob_forms.submit_snapshot`
 * (migration 0038) at every submit. On the next resubmit the API diffs the new
 * content against this to answer "what changed and what was it before".
 *
 * Signatures and supervisor-only fields are deliberately left out: they are
 * not what the reviewer is being asked to re-read, and the signature is a large
 * data URL that would bloat every history row.
 */
export type ObSubmitSnapshot = {
  form: Record<string, string>;
  entries: Array<{
    idx: number;
    from_place: string;
    to_place: string;
    purpose: string;
    time_departure: string;
    time_return: string;
  }>;
};

/** The latest trip back to HR, or null for a first-time submission. */
export function latestObResubmit(
  history: readonly ObResubmitEvent[] | null | undefined,
): ObResubmitEvent | null {
  return history && history.length ? (history[history.length - 1] ?? null) : null;
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st" — for "9th submission". */
export function ordinal(value: number): string {
  const n = Math.max(1, Math.trunc(value));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * The one-line queue caption under the status. A form whose history predates
 * migration 0038 has a count but no `how`, so it falls back to the attempt
 * number ("9th submission") rather than inventing a reason.
 */
export function obResubmitLine(
  count: number | null | undefined,
  history: readonly ObResubmitEvent[] | null | undefined,
): string | null {
  const times = count ?? 0;
  if (times <= 0) return null;
  const latest = latestObResubmit(history);
  if (latest?.how === "rejected") return "Resubmitted after rejection";
  if (latest?.how === "edited") return "Edited after approval";
  return `${ordinal(times + 1)} submission`;
}

/** Unique field names from an event's diff, in the order they were compared. */
export function obChangeSummary(changes: readonly ObResubmitChange[] | null | undefined): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const change of changes ?? []) {
    const label = change.label.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/**
 * The HR-owned columns on `ob_forms` (migration 0035). `ObForm` stays the
 * employee's editable header; these are appended by the API on read so the
 * employee's editor never writes them.
 */
export type ObHrFields = {
  hr_status: ObHrStatus;
  /** When the employee submitted (or resubmitted) the form. */
  submitted_at: string | null;
  /** How many times the form has gone back to HR for review (migration 0037). */
  resubmit_count: number;
  /** The trips themselves, oldest first — the history both screens show. */
  resubmit_history: ObResubmitEvent[];
  /**
   * The content HR last reviewed (migration 0038). The API writes it on every
   * submit and diffs it on a resubmit; the UI only reads it.
   */
  submit_snapshot: ObSubmitSnapshot | null;
  /** Why HR rejected it; cleared on the next submit. */
  hr_reject_reason: string;
  /** When HR rejected it; cleared with the reason on the next submit. */
  hr_rejected_at: string | null;
  /** The HR account that rejected it; cleared with the reason. */
  hr_rejected_by: string | null;
  hr_approved_by: string | null;
  hr_approved_at: string | null;
  /** When the supervisor's approval slip was marked approved. */
  supervisor_approved_at: string | null;
  departure_date: string;
  departure_time: string;
  residence: string;
  destination: string;
  departure_signed_by: string | null;
  departure_signed_at: string | null;
  /** The date/time HR typed when signing the employee back in (migration 0036). */
  arrival_date: string;
  arrival_time: string;
  arrival_signed_by: string | null;
  arrival_signed_at: string | null;
};

/** Defaults for a fresh draft — mirrors the migration's column defaults. */
export const EMPTY_OB_HR_FIELDS: ObHrFields = {
  hr_status: "draft",
  submitted_at: null,
  resubmit_count: 0,
  resubmit_history: [],
  submit_snapshot: null,
  hr_reject_reason: "",
  hr_rejected_at: null,
  hr_rejected_by: null,
  hr_approved_by: null,
  hr_approved_at: null,
  supervisor_approved_at: null,
  departure_date: "",
  departure_time: "",
  residence: "",
  destination: "",
  departure_signed_by: null,
  departure_signed_at: null,
  arrival_date: "",
  arrival_time: "",
  arrival_signed_by: null,
  arrival_signed_at: null,
};

/**
 * True when the employee must not edit the form any more: it is sitting in HR's
 * review queue. Everything else — including an already approved, departed or
 * completed form — stays editable. An edit to one of those is held as a draft
 * (see `needsReapprovalAfterSave`) until the employee explicitly resubmits.
 */
export function isObLocked(status: ObHrStatus): boolean {
  return status === "submitted";
}

/**
 * HR has already reviewed this form, so changing its content needs a fresh
 * review. The API no longer sends it back automatically: the edit is stored as
 * an unsent draft and HR keeps seeing the approved version until the employee
 * presses "Resubmit to HR". `waiting_supervisor` is handled alongside these
 * three because HR approved that content too — only the supervisor half is
 * still missing.
 */
export function needsReapprovalAfterSave(status: ObHrStatus): boolean {
  return status === "approved" || status === "departed" || status === "completed";
}

/**
 * The supervisor half of the approval is done: `approved_by` filled in AND the
 * approval slip ticked. While it is missing after HR approval, the form waits in
 * `waiting_supervisor`; HR can still sign the departure, but the arrival (and
 * therefore completion) is refused until this returns true.
 */
export function obSupervisorDone(
  form: Pick<ObForm, "approved_by" | "attachment_approved">,
): boolean {
  return form.approved_by.trim().length > 0 && form.attachment_approved;
}

/**
 * The supervisor indicator, derived from the two existing fields rather than
 * a new one: `approved_by` filled in AND the approval slip ticked. Shows
 * "waiting" on its own and never blocks HR's approval or departure (D3) — HR
 * can approve and sign out a form whose supervisor has not signed off yet; the
 * form then waits in `waiting_supervisor`, and completion stays blocked until
 * the signature arrives.
 */
export function obSupervisorState(form: Pick<ObForm, "approved_by" | "attachment_approved">): {
  /** "approved" once both halves are in, "waiting" while either is missing. */
  state: "approved" | "waiting";
  label: string;
} {
  return obSupervisorDone(form)
    ? { state: "approved", label: "Supervisor approved" }
    : { state: "waiting", label: "Waiting for supervisor" };
}

/**
 * A stored `YYYY-MM-DD` as a local Date built from its parts — never
 * `new Date(string)`, which reads ISO strings as UTC and can push the day
 * backwards in a west-of-UTC zone. Anything else (empty, or a hand-typed
 * legacy value) is null: it cannot be late against a date we can't read.
 */
function parseObDate(value: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!iso) return null;
  return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
}

/** Local midnight of today, so "due today" never drifts across time zones. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** What a signed-out form owes HR: the return, and how late it is. */
export type ObReturnState = {
  /** The OB date as a local Date, when it is a plain `YYYY-MM-DD`. */
  due: Date | null;
  /** Departure signed and no arrival signed yet — the employee is out. */
  out: boolean;
  /** Out, past the OB date, nothing signed on arrival: the queue's Overdue. */
  overdue: boolean;
  /** Out and still due back today. */
  dueToday: boolean;
  /** Whole days past the OB date; 0 when due today, not out, or unreadable. */
  daysOverdue: number;
};

/**
 * Whether an employee has to be chased back. Overdue is **derived**, never a
 * stored status: `departed` already means the departure is signed and the
 * arrival is not (signing the arrival moves the form to `completed`), so all
 * that is left to check is whether `date_of_ob` has passed. The queue's
 * Overdue tab, banner and "due back" lines all read from this one function.
 *
 * `date_of_ob` is the date the form is due back — the reference's "Due back".
 */
export function obReturnState(form: { hr_status: ObHrStatus; date_of_ob: string }): ObReturnState {
  const due = parseObDate(form.date_of_ob);
  const out = form.hr_status === "departed";
  if (!out || !due) return { due, out, overdue: false, dueToday: false, daysOverdue: 0 };

  // Whole days between two local midnights; `round` keeps a 23- or 25-hour
  // DST day from reading as a day early or late.
  const days = Math.round((startOfToday().getTime() - due.getTime()) / 86_400_000);
  return { due, out, overdue: days > 0, dueToday: days === 0, daysOverdue: Math.max(0, days) };
}

/** The one table `notifications.kind` may hold, in flow order. */
export const OB_NOTIFICATION_KINDS = [
  "ob_submitted",
  "ob_approved",
  "ob_rejected",
  "ob_resubmitted",
  "ob_departure_signed",
] as const;

export type ObNotificationKind = (typeof OB_NOTIFICATION_KINDS)[number];
