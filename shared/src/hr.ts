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
import type { ObForm } from "./types";

/** The department whose accounts act as HR reviewers. */
export const HR_DEPARTMENT = "HR Department";

/**
 * Every position filed under `HR_DEPARTMENT` in `org_positions` — the second
 * half of "who is HR". Read from the same admin-maintained lists as the
 * pickers, so a position added later is HR without a code change.
 */
export function isHrDepartment(department: string): boolean {
  return department.trim() === HR_DEPARTMENT;
}

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
 * The HR-owned columns on `ob_forms` (migration 0035). `ObForm` stays the
 * employee's editable header; these are appended by the API on read so the
 * employee's editor never writes them.
 */
export type ObHrFields = {
  hr_status: ObHrStatus;
  /** When the employee submitted (or resubmitted) the form. */
  submitted_at: string | null;
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
 * completed form — stays editable; saving one of those sends it back to HR for
 * re-approval (see `needsReapprovalAfterSave`).
 */
export function isObLocked(status: ObHrStatus): boolean {
  return status === "submitted";
}

/**
 * Saving a form that has already been through HR revokes that approval: the
 * content HR approved is no longer what the database holds. The save resets the
 * form to `submitted` (and clears the HR sign-offs) so HR sees it again.
 * `waiting_supervisor` is not in this list because HR already approved that
 * content; the API separately compares the form and only lets a supervisor-only
 * save through. A departed form gets the same treatment so the employee can add
 * the missing supervisor signature without losing the signed departure.
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

/** Plain-English label for each notification kind (activity-log twin). */
export const OB_NOTIFICATION_LABELS: Record<ObNotificationKind, string> = {
  ob_submitted: "OB submitted for HR approval",
  ob_approved: "OB approved by HR",
  ob_rejected: "OB rejected by HR",
  ob_resubmitted: "OB resubmitted to HR",
  ob_departure_signed: "OB departure signed by HR",
};
