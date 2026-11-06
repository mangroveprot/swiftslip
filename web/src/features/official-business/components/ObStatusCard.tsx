import type { ReactNode } from "react";

import { StatusBadge } from "@/components/common/StatusBadge";
import { cn } from "@/lib/utils";
import {
  buildStatusCard,
  hasStatusCard,
  type ObStatusAudience,
  type ObStatusDoc,
} from "@/features/official-business/lib/status-card";
import type { ObSigners } from "@swiftslip/shared/api-types";

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
};

/**
 * `● Rejected · Admin · admin · Rejected by Maria Santos on Nov 6, 2026` —
 * the one line under the title: the status dot, the person, their id, and the
 * sentence that says where the form actually is.
 *
 * **Currently not rendered on either screen.** It duplicated the status card
 * (which states the status) and the form's own name / id / date fields, so the
 * employee editor and the HR detail page both dropped it. Kept here as a
 * ready-made summary line if a compact header is needed again; do not re-add
 * it to a page that already shows `ObStatusCard`.
 */
export function ObStatusLine({ doc, signers, audience, className }: ObStatusProps) {
  const card = buildStatusCard(audience, doc, signers);
  const employee = doc.employee_name.trim();
  const idNumber = doc.id_number.trim();
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
      {employee ? (
        <>
          {separator}
          <span className="font-medium">{employee}</span>
        </>
      ) : null}
      {idNumber ? (
        <>
          {separator}
          <span className="font-medium">{idNumber}</span>
        </>
      ) : null}
      {separator}
      <span className="text-muted-foreground">{card.summary}</span>
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
export function ObStatusCard({ doc, signers, audience, className, hint }: ObStatusProps) {
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
        {card.status === "overdue" ? (
          <StatusBadge variant="dot" tone="warning">
            Overdue
          </StatusBadge>
        ) : (
          <StatusBadge variant="dot" status={card.status} />
        )}
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
              <p className="text-sm font-semibold break-words">{field.value}</p>
              {field.note ? (
                <p className="text-xs text-muted-foreground break-words">{field.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 divide-y divide-border border-t border-border">
          {card.fields.map((field) => (
            <div key={field.label} className="flex gap-4 py-2.5">
              <p className="w-28 shrink-0 text-xs text-muted-foreground sm:w-32">{field.label}</p>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold break-words">{field.value}</p>
                {field.note ? (
                  <p className="text-xs text-muted-foreground break-words">{field.note}</p>
                ) : null}
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
    </section>
  );
}
