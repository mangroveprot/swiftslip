import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck, Eye, MapPin, PenLine, type LucideIcon } from "lucide-react";

import { StatusBadge } from "@/components/common/StatusBadge";
import { cn } from "@/lib/utils";
import { obReturnState, obSupervisorState, type ObReturnState } from "@swiftslip/shared/hr";
import { relativeTime } from "@swiftslip/shared/time";
import type { HrObSummary } from "@swiftslip/shared/api-types";

/** What the row's one button does, in the reference's verb-first voice. */
function actionLabel(form: HrObSummary): string {
  switch (form.hr_status) {
    case "submitted":
      return "Review";
    case "waiting_supervisor":
    case "approved":
      return "Sign departure";
    case "departed":
      return obSupervisorState(form).state === "approved" ? "Sign arrival" : "Awaiting slip";
    default:
      return "View";
  }
}

/** The icon beside that label — the same verb, drawn. Only actionable rows render one. */
function actionIcon(form: HrObSummary): LucideIcon {
  switch (form.hr_status) {
    case "submitted":
      return ClipboardCheck;
    case "waiting_supervisor":
    case "approved":
    case "departed":
      return PenLine;
    default:
      return Eye;
  }
}

/**
 * A stored `YYYY-MM-DD` reads as "Nov 10, 2026" — built from the parts, never
 * `new Date(string)`, so the day can't slip backwards in a west-of-UTC zone.
 * Anything else (a hand-typed legacy value) is shown exactly as typed.
 */
function obDateLabel(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!iso) return value.trim();
  return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" },
  );
}

function EmployeeCell({ form }: { form: HrObSummary }) {
  return (
    <div className="min-w-0">
      <p
        className="truncate text-sm leading-tight font-semibold tracking-[-0.01em]"
        title={form.employee_name}
      >
        {form.employee_name || "Untitled form"}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {[form.id_number, form.position].filter(Boolean).join(" · ") || "No ID number"}
      </p>
    </div>
  );
}

function DestinationCell({ form }: { form: HrObSummary }) {
  const places = form.destinations.join(", ");
  const state = obReturnState(form);
  return (
    <div className="min-w-0">
      <p className="flex items-start gap-1.5 text-sm leading-tight" title={places}>
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{places || "No destination"}</span>
      </p>
      <p
        className={cn(
          "mt-1 truncate text-xs",
          state.overdue
            ? "font-medium text-amber-700 dark:text-amber-300"
            : "text-muted-foreground",
        )}
      >
        {dueBackLabel(form, state)}
      </p>
    </div>
  );
}

/**
 * The line under the destination. While the employee is out it speaks in
 * return dates — "Due back today", then "Due back Nov 4 · 1 day overdue" once
 * the date has passed (the queue's one warning-toned line). Otherwise it is
 * the OB date as typed, or "No OB date".
 */
function dueBackLabel(form: HrObSummary, state: ObReturnState): string {
  if (!state.out) return form.date_of_ob.trim() ? obDateLabel(form.date_of_ob) : "No OB date";
  if (!state.due) return "No OB date";
  if (state.dueToday) return "Due back today";

  const day = state.due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (!state.overdue) return `Due back ${day}`;
  return `Due back ${day} · ${state.daysOverdue} day${state.daysOverdue === 1 ? "" : "s"} overdue`;
}

/**
 * The status cell: a marker plus a plain white label, never a tinted chip.
 * `StatusBadge` owns the marker now — the two illustrated statuses draw their
 * 20px icon, "Waiting for Supervisor" gets the pulsing hairline ring, and the
 * rest keep their dots. That same badge is used on the HR detail rail and the
 * employee status card, so the whole app shows one status vocabulary. Overdue
 * is not a stored status — it is a signed-out form past its date.
 */
function StatusCell({ form }: { form: HrObSummary }) {
  // Overriding the badge's tinted ink keeps the queue legible on the dark card
  // without changing the chip surfaces the rest of the app still uses.
  const ink = "text-foreground dark:text-foreground";
  if (obReturnState(form).overdue) {
    return (
      <StatusBadge variant="dot" tone="warning" className={ink}>
        Overdue
      </StatusBadge>
    );
  }
  return <StatusBadge variant="dot" status={form.hr_status} className={ink} />;
}

function SupervisorCell({ form }: { form: HrObSummary }) {
  const approved = obSupervisorState(form).state === "approved";
  return (
    <div className="min-w-0">
      <p className="truncate text-sm leading-tight" title={form.approved_by}>
        {form.approved_by.trim() || "—"}
      </p>
      <p
        className={cn("mt-1 truncate text-xs", approved ? "text-success" : "text-muted-foreground")}
      >
        {approved ? "Approved" : "Awaiting signature"}
      </p>
    </div>
  );
}

/** The verb-first link at the end of the row (and the row's keyboard path). */
function ActionCell({ form }: { form: HrObSummary }) {
  const supervisor = obSupervisorState(form);
  const actionable =
    form.hr_status === "submitted" ||
    form.hr_status === "approved" ||
    form.hr_status === "waiting_supervisor" ||
    (form.hr_status === "departed" && supervisor.state === "approved");
  // Only a row HR can actually act on earns an icon; the rest are quiet text.
  const Icon = actionable ? actionIcon(form) : null;

  return (
    <Link
      to="/hr/ob/$id"
      params={{ id: form.id }}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "inline-flex max-w-full items-start gap-1.5 text-left text-[11px] font-medium leading-tight transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        actionInk(form, actionable),
      )}
    >
      {Icon ? <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" /> : null}
      <span>{actionLabel(form)}</span>
    </Link>
  );
}

/**
 * The action's ink in the dark reference's palette: green for anything HR can
 * sign, steel blue to review a submission, plain grey when there is nothing
 * to do yet. No border, no pill — the chevron at the end of the cell is the
 * only other affordance, so the column reads as links rather than alarms.
 */
function actionInk(form: HrObSummary, actionable: boolean): string {
  if (!actionable) return "text-muted-foreground";
  if (form.hr_status === "submitted") return "text-[#1d5fa6] dark:text-sky-400";
  return "text-dashboard-rule dark:text-emerald-400";
}

/**
 * The HR queue as a list, in the reference's shape: a dot-and-label status,
 * employee, destination, supervisor, when it was updated and the one plain
 * action link — on a table for wide screens and stacked rows on phones, both
 * on SwiftSlip's own card surface. A row opens its detail.
 */
export function QueueTable({ rows }: { rows: HrObSummary[] }) {
  const navigate = useNavigate();

  const open = (id: string) => navigate({ to: "/hr/ob/$id", params: { id } });

  return (
    <>
      {/* Desktop: the reference's table, on the card surface the app already uses. */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-48 py-3 pl-4 pr-4 font-normal">Status</th>
                <th className="py-3 pr-4 font-normal">Employee</th>
                <th className="py-3 pr-4 font-normal">Destination</th>
                <th className="w-36 py-3 pr-4 font-normal">Supervisor</th>
                <th className="w-24 py-3 pr-4 font-normal">Updated</th>
                <th className="w-48 py-3 pr-4 font-normal">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((form) => (
                <tr
                  key={form.id}
                  onClick={() => open(form.id)}
                  className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/30"
                >
                  <td className="py-3.5 pl-4 pr-4 align-middle">
                    <StatusCell form={form} />
                  </td>
                  <td className="py-3.5 pr-4 align-middle">
                    <EmployeeCell form={form} />
                  </td>
                  <td className="py-3.5 pr-4 align-middle">
                    <DestinationCell form={form} />
                  </td>
                  <td className="py-3.5 pr-4 align-middle">
                    <SupervisorCell form={form} />
                  </td>
                  <td
                    className="py-3.5 pr-4 align-middle text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                    title={new Date(form.updated_at).toLocaleString()}
                  >
                    {relativeTime(form.updated_at)}
                  </td>
                  <td className="py-3.5 pr-4 align-middle">
                    <div className="flex items-center gap-2">
                      <ActionCell form={form} />
                      <ChevronRight
                        className="ml-auto size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phones: the same row, stacked — no sideways scrolling to reach a row. */}
      <div className="overflow-hidden rounded-xl border bg-card md:hidden">
        {rows.map((form) => (
          <div
            key={form.id}
            onClick={() => open(form.id)}
            className="flex cursor-pointer items-start border-b px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/30"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <StatusCell form={form} />
                <span
                  className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums"
                  title={new Date(form.updated_at).toLocaleString()}
                >
                  {relativeTime(form.updated_at)}
                </span>
              </div>
              <div className="mt-2">
                <EmployeeCell form={form} />
              </div>
              <div className="mt-2">
                <DestinationCell form={form} />
              </div>
              <div className="mt-2">
                <SupervisorCell form={form} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <ActionCell form={form} />
                <ChevronRight
                  className="ml-auto size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
