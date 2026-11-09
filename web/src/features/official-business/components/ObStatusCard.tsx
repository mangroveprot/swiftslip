import type { ReactNode } from "react";

import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { cn } from "@/lib/utils";
import {
  buildStatusCard,
  hasStatusCard,
  statusDate,
  type ObStatusAudience,
  type ObStatusDoc,
  type ObStatusField,
} from "@/features/official-business/lib/status-card";
import type { ObSigners } from "@swiftslip/shared/api-types";
import { latestObResubmit } from "@swiftslip/shared/hr";

type ObStatusProps = {
  doc: ObStatusDoc;
  /** `undefined` is how a query result reads before signers arrive. */
  signers?: ObSigners | null | undefined;
  audience: ObStatusAudience;
  className?: string;
  /**
   * A note shown inside the card, under a divider — the editor's re-approval
   * hint. It lives here so the note always travels with the facts it explains,
   * wherever the card is placed.
   */
  hint?: ReactNode | undefined;
  /**
   * Buttons that act on this state — "Resubmit to HR" on a draft, "Cancel" on a
   * resubmission. Rendered in their own row so they are never nested in the
   * note's paragraph.
   */
  actions?: ReactNode | undefined;
};

/**
 * `● Waiting for HR · Resubmitted Nov 7, 2026 · Admi Nastor · admin` — the
 * compact line under the page title. The HR desk shows the amber resubmit
 * date here; the employee line does not, because that screen's card already
 * leads with the same date. On a resubmit the trailing summary stays hidden
 * so the line does not say it twice.
 */
export function ObStatusLine({ doc, signers, audience, className }: ObStatusProps) {
  const card = buildStatusCard(audience, doc, signers);
  const employee = doc.employee_name.trim();
  const idNumber = doc.id_number.trim();
  const resubmitted = (doc.resubmit_count ?? 0) > 0;
  const resubmitOn =
    audience === "hr" && resubmitted ? statusDate(latestObResubmit(doc.resubmit_history)?.at) : "";
  const separator = (
    <span className="text-muted-foreground" aria-hidden="true">
      ·
    </span>
  );

  return (
    <p className={cn("mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", className)}>
      {card.status === "overdue" ? (
        <StatusBadge variant="dot" tone="warning">
          Overdue
        </StatusBadge>
      ) : (
        <StatusBadge variant="dot" status={card.status} />
      )}
      {resubmitOn ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          Resubmitted {resubmitOn}
        </span>
      ) : null}
      {employee ? (
        <>
          {separator}
          <span className="inline-flex items-center gap-1.5">
            <ProfileAvatar name={employee} photo={doc.employee_photo ?? undefined} size={18} />
            <span className="font-medium">{employee}</span>
          </span>
        </>
      ) : null}
      {idNumber && idNumber !== employee ? (
        <>
          {separator}
          <span className="font-medium">{idNumber}</span>
        </>
      ) : null}
      {!resubmitted ? (
        <>
          {separator}
          <span className="text-muted-foreground">{card.summary}</span>
        </>
      ) : null}
    </p>
  );
}

/** A field value, with the person's face when the value names someone. */
function FieldValue({ field, align = "start" }: { field: ObStatusField; align?: "start" | "end" }) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-sm font-semibold break-words",
        align === "end" && "justify-end text-right",
        field.tone === "warning" && "text-amber-700 dark:text-amber-400",
      )}
    >
      {field.valuePerson ? (
        <ProfileAvatar
          name={field.valuePerson.name}
          photo={field.valuePerson.photo ?? undefined}
          size={18}
          className="mt-0.5"
        />
      ) : null}
      <span>{field.value}</span>
    </p>
  );
}

/** A field note, with a second face when the note names someone else. */
function FieldNote({ field, align = "start" }: { field: ObStatusField; align?: "start" | "end" }) {
  if (!field.note) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs text-muted-foreground break-words",
        align === "end" && "justify-end text-right",
      )}
    >
      {field.notePerson ? (
        <ProfileAvatar
          name={field.notePerson.name}
          photo={field.notePerson.photo ?? undefined}
          size={16}
          className="mt-0.5"
        />
      ) : null}
      <span>{field.note}</span>
    </p>
  );
}

/**
 * The status card itself — the mockup's one card for the form's current state.
 *
 * The **employee** card puts the label and the sentence on one line and lays
 * the facts out in columns (scanned, not read). The **HR** card stacks the
 * label over the sentence and reads the facts as label-left / value-right rows,
 * like a record. Nothing here is a status of its own: it renders whatever
 * `buildStatusCard` derives, so the two screens can never disagree.
 */
export function ObStatusCard({ doc, signers, audience, className, hint, actions }: ObStatusProps) {
  if (!hasStatusCard(doc)) return null;

  const card = buildStatusCard(audience, doc, signers);
  const employee = audience === "employee";

  return (
    <section
      className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}
      aria-label={`${card.label} status`}
    >
      {/* `items-center`, not `items-baseline`: an SVG's baseline is its bottom
          edge, so baseline alignment parked the 20px icon above the label.
          Centring the whole flex row keeps the icon on the label's midline. */}
      <div className={cn(employee ? "flex flex-wrap items-center gap-x-2 gap-y-1" : "block")}>
        <span className="inline-flex flex-wrap items-center gap-2">
          {card.status === "overdue" ? (
            <StatusBadge variant="dot" tone="warning">
              Overdue
            </StatusBadge>
          ) : (
            <StatusBadge variant="dot" status={card.status} />
          )}
        </span>
        <p className={cn("text-sm text-muted-foreground", !employee && "mt-1")}>
          {card.description}
        </p>
      </div>

      {employee ? (
        <div
          className={cn(
            "mt-3 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-2",
            card.columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
          )}
        >
          {card.fields.map((field) => (
            <div key={field.label} className={cn(field.full && "sm:col-span-2 lg:col-span-4")}>
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <FieldValue field={field} />
              <FieldNote field={field} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 divide-y divide-border border-t border-border">
          {card.fields.map((field) => (
            <div key={field.label} className="flex items-start justify-between gap-4 py-2.5">
              <p className="shrink-0 pt-0.5 text-xs text-muted-foreground">{field.label}</p>
              <div className="min-w-0 text-right">
                <FieldValue field={field} align="end" />
                <FieldNote field={field} align="end" />
              </div>
            </div>
          ))}
        </div>
      )}
      {hint ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      ) : null}
      {actions ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          {actions}
        </div>
      ) : null}
    </section>
  );
}
