import type { ObSigners } from "@swiftslip/shared/api-types";
import { obReturnState, type ObHrFields, type ObHrStatus } from "@swiftslip/shared/hr";
import type { ObForm } from "@swiftslip/shared/types";

/**
 * The status card the two OB screens show: which state the form is in, the one
 * sentence that explains it, and the rows of facts underneath — the owner's
 * reference mock, in two dialects. **`hr`** stacks label-left / value-right
 * rows (the reviewer's rail reads like a record), **`employee`** lays the same
 * facts out in columns (the employee scans one line per fact).
 *
 * One builder feeds the header line, the card and the Word/PDF exports' future
 * needs: the screens never re-derive a status or re-word a sentence themselves.
 */
export type ObStatusAudience = "hr" | "employee";

/** The stored status plus Overdue — derived from the date, never stored. */
export type ShownStatus = ObHrStatus | "overdue";

export type ObStatusField = {
  label: string;
  value: string;
  /** Small grey line under the value — the "why/when" of the value. */
  note?: string | null;
  /** The reason row on a rejected card runs the full width of the card. */
  full?: boolean;
};

export type ObStatusCardData = {
  status: ShownStatus;
  /** The card heading: "Rejected by HR", "Completed", "On OB"… */
  label: string;
  /** The one sentence beside/below the heading. */
  description: string;
  /** The rows of facts. */
  fields: ObStatusField[];
  /** Column count the employee's grid uses (the HR rail is always rows). */
  columns: 3 | 4;
  /** Header line tail: "Rejected by Maria Santos on Nov 6, 2026". */
  summary: string;
};

/**
 * What the card reads: the employee's form header plus the HR-owned columns the
 * API appends on read (migration 0035 + 0036), with the row stamps the status
 * line may want. Everything is optional so a half-loaded document still renders
 * a card instead of crashing.
 */
export type ObStatusDoc = ObForm &
  Partial<ObHrFields> & {
    id?: string;
    created_at?: string | null;
    updated_at?: string | null;
  };

/* ------------------------------------------------------------------ dates */

/** A stored timestamp, or a plain `YYYY-MM-DD` (read as local midnight, never shifted). */
function toDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year = 0, month = 1, day = 1] = raw.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "Nov 6, 2026" — or "" when there is nothing to show. */
export function statusDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Nov 6, 2026 at 8:12 AM" — the mockup's stamp. */
export function statusDateTime(value: string | Date | null | undefined): string {
  const raw = value instanceof Date ? "" : (value ?? "").trim();
  // A plain stored date (`date_filed`) has no time of its own — printing
  // "12:00 AM" would invent one, so the row shows the date alone.
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return statusDate(value);
  const date = toDate(value);
  if (!date) return "";
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${statusDate(date)} at ${time}`;
}

const dash = (text: string) => text || "—";

/** "1 day 2 hours 17 minutes" between two stamps; "Less than a minute" when under a minute. */
function span(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined,
): string {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return "";
  const ms = Math.max(0, end.getTime() - start.getTime());
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (rest) parts.push(`${rest} minute${rest === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" ") : "Less than a minute";
}

/** How long a form has been waiting: "2 hours", "1 day". */
function waiting(from: string | Date | null | undefined): string {
  return span(from, new Date()) || "—";
}

/** "1 day after it was filed" — the note under "Rejected on". */
function afterFiling(rejectedAt: string | null | undefined, filed: string): string {
  const to = toDate(rejectedAt);
  const from = toDate(filed);
  if (!to || !from) return "";
  const days = Math.round(
    (new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
      new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) /
      86_400_000,
  );
  if (days <= 0) return "Filed the same day";
  return `${days} day${days === 1 ? "" : "s"} after it was filed`;
}

const pluralDays = (days: number) => `${days || 0} day${days === 1 ? "" : "s"}`;

/* ------------------------------------------------------------------ card */

/** The status the card shows: Overdue is derived from the date, not stored. */
export function shownStatus(doc: ObStatusDoc): ShownStatus {
  const status = doc.hr_status ?? "draft";
  const ret = obReturnState({ hr_status: status, date_of_ob: doc.date_of_ob ?? "" });
  return ret.overdue ? "overdue" : status;
}

/** Both screens hide the card until the form has actually been submitted. */
export function hasStatusCard(doc: ObStatusDoc | undefined | null): doc is ObStatusDoc {
  return Boolean(doc) && (doc?.hr_status ?? "draft") !== "draft";
}

/**
 * Build everything the header line and the card need for one form, for one
 * audience. Every field is filled from data the API actually stores; nothing
 * is invented — where a stamp is missing the row reads "—".
 */
export function buildStatusCard(
  audience: ObStatusAudience,
  doc: ObStatusDoc,
  signers?: ObSigners | null,
): ObStatusCardData {
  const employee = audience === "employee";
  const status = shownStatus(doc);
  const ret = obReturnState({
    hr_status: doc.hr_status ?? "draft",
    date_of_ob: doc.date_of_ob ?? "",
  });

  // The people the mockup names, resolved the same way the printed sheet does.
  const hr = signers?.approved?.name?.trim() || "";
  const hrPosition = signers?.approved?.position?.trim() || "";
  const rejecting = signers?.rejected?.name?.trim() || "";
  const rejectPosition = signers?.rejected?.position?.trim() || "";
  const supervisor = doc.approved_by.trim();
  const departure = signers?.departure;
  const arrival = signers?.arrival;
  const departureLine = [departure?.name?.trim(), departure?.position?.trim()]
    .filter(Boolean)
    .join(", ");
  const arrivalLine = [arrival?.name?.trim(), arrival?.position?.trim()].filter(Boolean).join(", ");

  // Filed = when it went to HR; the typed date is the fallback for rows saved
  // before `submitted_at` existed.
  const filed = doc.submitted_at || doc.date_filed;
  const route = [doc.residence?.trim(), doc.destination?.trim()].filter(Boolean).join(" to ");
  const away = span(doc.departure_signed_at, doc.arrival_signed_at);
  const dueTodayLabel = ret.due
    ? ret.dueToday
      ? `Today, ${statusDate(ret.due)}`
      : statusDate(ret.due)
    : "";

  let label: string;
  let description: string;
  let fields: ObStatusField[];
  let columns: 3 | 4 = 3;
  let summary: string;

  switch (status) {
    case "rejected": {
      label = employee ? "Rejected" : "Rejected by HR";
      description = employee
        ? "HR rejected this form. Edit it and resubmit when it is ready."
        : "The employee has been told why. HR sees the form again when it is resubmitted.";
      const who = rejecting || "HR";
      const reason = (doc.hr_reject_reason ?? "").trim();
      columns = 4;
      fields = employee
        ? [
            { label: "Rejected by", value: who, note: rejectPosition || "HR reviewer" },
            {
              label: "Rejected on",
              value: dash(statusDateTime(doc.hr_rejected_at)),
              note: afterFiling(doc.hr_rejected_at, filed),
            },
            { label: "Filed on", value: dash(statusDateTime(filed)) },
            { label: "Resubmit", value: "Not yet", note: "HR sees it again when you do" },
            ...(reason ? [{ label: "Reason from HR", value: reason, full: true }] : []),
          ]
        : [
            { label: "Rejected by", value: who, note: rejectPosition || "HR reviewer" },
            {
              label: "Rejected on",
              value: dash(statusDateTime(doc.hr_rejected_at)),
              note: afterFiling(doc.hr_rejected_at, filed),
            },
            { label: "Reason", value: reason || "—" },
            {
              label: "Employee told",
              value: dash(statusDateTime(doc.hr_rejected_at)),
              note: "By notification",
            },
            { label: "Filed on", value: dash(statusDateTime(filed)) },
          ];
      summary = `Rejected by ${who} on ${statusDate(doc.hr_rejected_at) || statusDate(filed)}`;
      break;
    }

    case "submitted": {
      label = "Waiting for HR";
      description = employee
        ? "HR has not reviewed this form yet."
        : "This form is waiting for your review.";
      fields = [
        { label: "Filed on", value: dash(statusDateTime(filed)) },
        ...(doc.submitted_at ? [{ label: "Waiting for", value: waiting(doc.submitted_at) }] : []),
        {
          label: "Supervisor",
          value: supervisor || "Not named yet",
          note: doc.attachment_approved ? "Approval slip signed" : "Has not signed yet",
        },
      ];
      summary = `Submitted on ${statusDate(doc.submitted_at || doc.date_filed)}`;
      break;
    }

    case "waiting_supervisor": {
      label = "Waiting for Supervisor";
      description = employee
        ? "HR approved this form. Upload your supervisor's signed approval slip and save to complete it."
        : "Approved by HR. Waiting for the supervisor's signed approval slip.";
      fields = [
        { label: "HR approved by", value: hr || "HR", note: "HR reviewer" },
        { label: "HR approved on", value: dash(statusDateTime(doc.hr_approved_at)) },
        {
          label: "Approval slip",
          value: doc.attachment_approved ? "Approved" : "Not uploaded yet",
          note: supervisor ? `Signed by ${supervisor}, your supervisor` : null,
        },
      ];
      summary = `HR approved on ${statusDate(doc.hr_approved_at)}`;
      break;
    }

    case "approved": {
      label = "Ready for departure";
      description = employee
        ? "Approved by HR and your supervisor. Ready for departure — HR will sign you out."
        : "Approved by HR and the supervisor. HR signs the departure when the employee leaves.";
      fields = [
        { label: "HR approved by", value: hr || "HR", note: "HR reviewer" },
        { label: "HR approved on", value: dash(statusDateTime(doc.hr_approved_at)) },
        {
          label: "Supervisor approved",
          value: supervisor || "—",
          note: statusDateTime(doc.supervisor_approved_at) || null,
        },
        { label: "Due back", value: dueTodayLabel || "No OB date" },
      ];
      summary = `HR approved on ${statusDate(doc.hr_approved_at)}`;
      break;
    }

    case "overdue": {
      label = "Overdue";
      description = employee
        ? "You have not returned yet. HR can sign your arrival once you are back."
        : "The employee has not returned yet. HR can sign the arrival once they are back.";
      fields = employee
        ? [
            {
              label: "Departure signed",
              value: dash(statusDateTime(doc.departure_signed_at)),
              note: `By ${departure?.name?.trim() || "HR"}`,
            },
            { label: "Was due back", value: dash(statusDate(ret.due)) },
            {
              label: "Overdue by",
              value: pluralDays(ret.daysOverdue),
              note: `Counted from ${statusDate(ret.due)}`,
            },
          ]
        : [
            {
              label: "Departure signed",
              value: departureLine || "HR",
              note: statusDateTime(doc.departure_signed_at),
            },
            { label: "Was due back", value: dash(statusDate(ret.due)) },
            {
              label: "Overdue by",
              value: pluralDays(ret.daysOverdue),
              note: `Counted from ${statusDate(ret.due)}`,
            },
          ];
      summary = `Was due back ${statusDate(ret.due) || "—"}`;
      break;
    }

    case "departed": {
      label = "On OB";
      description = employee
        ? "You are out on official business. HR signs your arrival when you return."
        : "The employee is out on official business. Sign the arrival when they return.";
      fields = employee
        ? [
            {
              label: "Departure signed by",
              value: departure?.name?.trim() || "HR",
              note: statusDateTime(doc.departure_signed_at),
            },
            { label: "Route", value: route || "—" },
            { label: "Due back", value: dueTodayLabel || "No OB date" },
          ]
        : [
            {
              label: "Departure signed by",
              value: departureLine || "HR",
              note: statusDateTime(doc.departure_signed_at),
            },
            { label: "Route", value: route || "—" },
            { label: "Due back", value: dueTodayLabel || "No OB date" },
          ];
      summary = `Departure signed on ${statusDate(doc.departure_signed_at)}`;
      break;
    }

    case "completed": {
      label = "Completed";
      description =
        "Both signatures are done and every approval is in. Editing this form sends it back to HR for re-approval.";
      columns = 4;
      fields = employee
        ? [
            { label: "Completed on", value: dash(statusDateTime(doc.arrival_signed_at)) },
            {
              label: "HR approved by",
              value: hr || "HR",
              note: statusDateTime(doc.hr_approved_at),
            },
            {
              label: "Supervisor approved by",
              value: supervisor || "—",
              note: statusDateTime(doc.supervisor_approved_at) || null,
            },
            {
              label: "Time away",
              value: away || "—",
              note: arrival?.name ? `Arrival signed by ${arrival.name}` : null,
            },
          ]
        : [
            { label: "Filed", value: doc.employee_name.trim() || "—", note: statusDateTime(filed) },
            { label: "HR approved", value: hr || "HR", note: statusDateTime(doc.hr_approved_at) },
            {
              label: "Supervisor approved",
              value: supervisor || "—",
              note: statusDateTime(doc.supervisor_approved_at) || null,
            },
            {
              label: "Departure signed",
              value: departureLine || "HR",
              note: doc.residence
                ? `${statusDateTime(doc.departure_signed_at)} · From ${doc.residence.trim()}`
                : statusDateTime(doc.departure_signed_at),
            },
            {
              label: "Arrival signed",
              value: arrivalLine || "HR",
              note: doc.destination
                ? `${statusDateTime(doc.arrival_signed_at)} · At ${doc.destination.trim()}`
                : statusDateTime(doc.arrival_signed_at),
            },
            { label: "Time away", value: away || "—", note: "Returned within the planned dates" },
          ];
      summary = `Completed on ${statusDate(doc.arrival_signed_at)}`;
      break;
    }

    case "draft":
    default: {
      // Neither screen shows a card before submission; the row exists so the
      // type is total and a stray render still says something true.
      label = "Draft";
      description = "Not submitted yet.";
      fields = [{ label: "Filed on", value: dash(statusDate(doc.date_filed)) }];
      summary = "Not submitted yet";
      break;
    }
  }

  return { status, label, description, fields, columns, summary };
}
