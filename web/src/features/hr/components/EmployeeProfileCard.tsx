import type { ReactNode } from "react";
import { Building2, MapPin, UserRound } from "lucide-react";

import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import type { ObEmployeeProfile } from "@swiftslip/shared/api-types";

/**
 * Who HR is reviewing: a profile banner at the top of the detail rail —
 * photo, name, ID, department, position, office and supervisor. Approve and
 * Reject sit inside the card, under those facts.
 *
 * The queue row already shows the face and the two or three denormalised
 * cells; this card is the fuller picture the sheet has no box for, resolved
 * server-side from `profiles` (`HrObDetail.employee`). Renders nothing when
 * the form has no owner profile, so the rail degrades to what it was.
 */
export function EmployeeProfileCard({
  employee,
  actions,
}: {
  employee: ObEmployeeProfile;
  /** Approve / Reject, rendered in the card footer. */
  actions?: ReactNode;
}) {
  const name = employee.full_name.trim();
  const headline = [employee.emp_no, employee.position].filter(Boolean).join(" · ");

  return (
    <section className="hr-card overflow-hidden" aria-label={`Employee — ${name || "unknown"}`}>
      {/* The banner: one soft gradient band the avatar hangs over, so the card
          reads as a person's profile rather than another facts table. */}
      <div
        className="h-16 bg-gradient-to-r from-dashboard-accent/35 via-dashboard-soft to-primary/10"
        aria-hidden="true"
      />
      <div className="-mt-8 flex items-end gap-3 px-5 pb-4">
        <ProfileAvatar
          photo={employee.photo || undefined}
          name={name || "?"}
          size={64}
          className="ring-4 ring-card"
        />
        <div className="min-w-0 pb-1">
          <p
            className="truncate text-base font-semibold leading-tight tracking-[-0.01em]"
            title={name}
          >
            {name || "Unnamed employee"}
          </p>
          {headline ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={headline}>
              {headline}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/70 px-5 py-4">
        <Fact
          icon={<Building2 className="size-3.5" aria-hidden="true" />}
          label="Department"
          value={employee.department}
        />
        <Fact
          icon={<UserRound className="size-3.5" aria-hidden="true" />}
          label="Position"
          value={employee.position}
        />
        <Fact
          icon={<MapPin className="size-3.5" aria-hidden="true" />}
          label="Office"
          value={employee.area}
        />
        <Fact
          icon={<UserRound className="size-3.5" aria-hidden="true" />}
          label="Supervisor"
          value={employee.supervisor}
        />
      </dl>
      {actions ? <div className="border-t border-border/70 px-5 py-3">{actions}</div> : null}
    </section>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="hr-label flex items-center gap-1.5">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium leading-5" title={value}>
        {value || "—"}
      </dd>
    </div>
  );
}
