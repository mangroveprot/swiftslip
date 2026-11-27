/**
 * The admin panel's loading states, in one place. Each live section renders its
 * skeleton while the first query is in flight, and the router's pending
 * fallback can render the same components while a route chunk loads, so a cold
 * navigation shows the shape of the page instead of an empty shell.
 *
 * `AdminDashboardSkeleton` is a standalone snapshot: it repeats the dashboard's
 * static header and panel headings (the real component renders those while
 * loading too) instead of importing the live panels, which need query data.
 * Its links are plain text — a pending fallback has nowhere to navigate yet —
 * and its filter controls are grey footprints for the same reason.
 *
 * Every bar is `bg-foreground/20`, `/15` or `/10`, never `bg-muted`: in dark
 * mode `--muted` (0.275) is only a shade off `--card` (0.235), so muted
 * skeletons vanished into the panel.
 */

import { PageTitle } from "@/components/common/PageTitle";
import { FORM_TYPES } from "@swiftslip/shared/forms";

import { AdminClock } from "./AdminClock";

/**
 * The dashboard while the stats query is in flight. Mirrors the real layout
 * panel for panel: header, the three summary columns, the chart and the
 * breakdown, then the two activity panels.
 */
export function AdminDashboardSkeleton() {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <PageTitle as="h2">Dashboard</PageTitle>
          <p className="mt-2 max-w-[42rem] text-sm leading-6 text-muted-foreground">
            Portal-wide totals and what needs your attention, across every account and form.
          </p>
        </div>
        <AdminClock />
      </header>

      {/* Neutral rule, same weight as the divider above the activity panels. */}
      <div className="mt-5 border-t" />

      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-border">
        <SummarySnapshot label="Accounts" note="Staff and administrators" link="Manage accounts" />
        <SummarySnapshot
          label="Forms this month"
          note="Compared with last month"
          link="View form activity"
        />
        <SummarySnapshot label="Needs attention" note="Profiles and sign-ins" />
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-10 pt-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section aria-labelledby="forms-filed-title" className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div>
              <h3 id="forms-filed-title" className="text-lg font-semibold tracking-tight">
                Forms filed
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Last 8 weeks, all form types</p>
            </div>

            {/* The select and the week/month toggle are live controls, so the
                snapshot keeps only their footprint. */}
            <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
              <div className="h-8 w-32 animate-pulse rounded-md bg-foreground/10" />
              <div className="h-8 w-28 animate-pulse rounded-md bg-foreground/10" />
            </div>
          </div>

          <ChartSkeleton />
        </section>

        <section aria-labelledby="by-form-type-title" className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="by-form-type-title" className="text-lg font-semibold tracking-tight">
                By form type
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Filed this month, most first</p>
            </div>
            <span className="text-sm font-medium underline decoration-border underline-offset-4">
              View activity
            </span>
          </div>

          <ul className="mt-4 animate-pulse" aria-label="Loading form types">
            {FORM_TYPES.map((type) => (
              <li key={type.key} className="py-3.5">
                <div className="grid min-h-5 grid-cols-[minmax(0,1fr)_1.75rem_3.75rem] items-center gap-x-2.5 sm:grid-cols-[minmax(7rem,1.8fr)_minmax(3.5rem,1fr)_1.75rem_3.75rem]">
                  <div className="h-3.5 w-32 max-w-full rounded bg-foreground/20" />
                  <div className="hidden h-2 w-full rounded-full bg-foreground/10 sm:block" />
                  <div className="ml-auto h-3.5 w-6 rounded bg-foreground/20" />
                  <div className="ml-auto h-3 w-10 rounded bg-foreground/15" />
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-foreground/10 sm:hidden" />
              </li>
            ))}
          </ul>

          <p className="mt-2 text-xs text-muted-foreground">
            The figure on the right is the change from last month. DTR records are counted
            separately.
          </p>
        </section>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 border-t pt-8 lg:grid-cols-2">
        <section aria-labelledby="latest-activity-title">
          <div className="flex items-baseline justify-between gap-3 border-b pb-3">
            <h3 id="latest-activity-title" className="text-lg font-semibold tracking-tight">
              Latest activity
            </h3>
            <span className="text-sm font-medium underline decoration-border underline-offset-4">
              View all
            </span>
          </div>
          <FeedSkeleton />
        </section>

        {/* The live panel's "Today" card prints live zeros, not a loading
            shape, so the snapshot keeps only the heading and the feed. */}
        <section aria-labelledby="security-title">
          <div className="border-b pb-3">
            <h3 id="security-title" className="text-lg font-semibold tracking-tight">
              Sign-ins and security
            </h3>
          </div>
          <FeedSkeleton />
          <div className="mt-2 border-t pt-3">
            <span className="text-sm font-medium underline decoration-border underline-offset-4">
              View all sign-ins
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}

/** One summary column in the dashboard's loading state. */
function SummarySnapshot({ label, note, link }: { label: string; note: string; link?: string }) {
  return (
    <div className="py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 h-10 w-20 animate-pulse rounded-md bg-foreground/20" />
      <p className="mt-2 text-sm text-muted-foreground">{note}</p>
      {link ? (
        <div className="mt-3">
          <span className="text-sm font-medium underline decoration-border underline-offset-4">
            {link}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The bar chart's own loading state. A solid muted block read as "this panel
 * is empty", so the placeholder draws the chart instead: eight bars over a
 * dashed grid and a baseline, with the axis ticks and the caption line under
 * it. Heights are fixed so the pulse never reshuffles them.
 *
 * `bg-foreground/20`, not `bg-muted`: in dark mode `--muted` (0.275) is only a
 * shade off `--card` (0.235), so every muted skeleton in this panel vanished.
 */
const CHART_BARS = [46, 68, 34, 82, 58, 30, 72, 40];

export function ChartSkeleton() {
  return (
    <div className="mt-4 animate-pulse" aria-hidden="true">
      <div className="flex h-[280px] gap-3">
        {/* Y axis ticks. */}
        <div className="flex w-7 shrink-0 flex-col justify-between pt-6 pb-7">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="ml-auto h-2 w-4 rounded bg-foreground/15" />
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex flex-1 items-end gap-2 border-b border-border/60 sm:gap-4">
            {/* The chart's horizontal grid, at the same quarter steps. */}
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute inset-x-0 border-t border-dashed border-border/50"
                style={{ bottom: `${25 * (i + 1)}%` }}
              />
            ))}
            {CHART_BARS.map((height, index) => (
              <span
                key={index}
                className="relative flex-1 rounded-t-[3px] bg-foreground/20"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>

          {/* Week labels. */}
          <div className="mt-2 flex gap-2 sm:gap-4">
            {CHART_BARS.map((_, index) => (
              <span key={index} className="h-2 flex-1 rounded bg-foreground/15" />
            ))}
          </div>
        </div>
      </div>

      {/* The caption that sits under the real chart. */}
      <div className="mt-2 h-3 w-64 max-w-full rounded bg-foreground/10" />
    </div>
  );
}

/** The four-row feed placeholder under "Latest activity" and "Sign-ins". */
export function FeedSkeleton() {
  return (
    <ul className="mt-2 space-y-3" aria-label="Loading activity">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="space-y-2 py-2">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-foreground/20" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-foreground/10" />
        </li>
      ))}
    </ul>
  );
}

/** Account rows while the roster loads (body only, under the filters). */
export function AdminUsersSkeleton() {
  return (
    <div aria-label="Loading accounts">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b py-5">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-foreground/20" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-40 animate-pulse rounded bg-foreground/20" />
            <div className="h-3 w-28 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Session rows while the active-session list loads (body only). */
export function AdminSessionsSkeleton() {
  return (
    <div aria-label="Loading active sessions">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b py-5 last:border-b-0">
          <div className="size-9 shrink-0 animate-pulse rounded-full bg-foreground/20" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-40 animate-pulse rounded bg-foreground/20" />
            <div className="h-3 w-56 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** App access: the app list on the left, the selected app's rules on the right. */
export function AdminAccessSkeleton() {
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-0" aria-hidden="true">
      <div className="lg:pr-6">
        <div className="h-9 border-b bg-foreground/10" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 border-b py-3">
            <div className="h-3.5 w-32 animate-pulse rounded bg-foreground/20" />
            <div className="h-3 w-20 animate-pulse rounded bg-foreground/10" />
          </div>
        ))}
      </div>
      <div className="space-y-4 lg:border-l lg:pl-6">
        <div className="h-7 w-40 animate-pulse rounded bg-foreground/20" />
        <div className="h-4 w-64 animate-pulse rounded bg-foreground/10" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-foreground/10" />
        ))}
      </div>
    </div>
  );
}

/** Activity logs: the day heading and six grouped rows. */
export function AdminLogsSkeleton() {
  return (
    <div className="mt-5" role="status" aria-label="Loading activity logs">
      <div className="h-3 w-14 animate-pulse rounded bg-foreground/20" />
      <div className="mt-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[3.5rem_1.75rem_minmax(0,1fr)] items-start gap-x-3 border-b py-3.5 sm:grid-cols-[4.5rem_1.75rem_minmax(0,1fr)_auto]"
          >
            <div className="mt-1 h-3 w-10 animate-pulse rounded bg-foreground/20" />
            <div className="size-7 animate-pulse rounded-full bg-foreground/20" />
            <div className="space-y-2">
              <div
                className={`h-3.5 animate-pulse rounded bg-foreground/20 ${i % 2 ? "w-2/3" : "w-4/5"}`}
              />
              <div className="h-3 w-1/3 animate-pulse rounded bg-foreground/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Retention settings, first paint, before the saved rule arrives: the same
 * sheet in grey, so the page never flashes an empty shell or shifts when the
 * numbers land.
 */
export function AdminRetentionSkeleton() {
  return (
    <section
      className="mx-auto w-full max-w-6xl rounded-2xl border bg-card p-6 shadow-sm sm:p-10"
      aria-busy="true"
      aria-label="Loading retention settings"
    >
      <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div className="min-w-0 flex-1">
          <PageTitle as="h2">Data retention</PageTitle>
          <div className="mt-3 h-4 w-full max-w-sm animate-pulse rounded bg-foreground/20" />
          <div className="mt-2 h-4 w-2/3 max-w-xs animate-pulse rounded bg-foreground/20" />
        </div>
        <div className="shrink-0 space-y-2">
          <div className="ml-auto h-7 w-20 animate-pulse rounded bg-foreground/20" />
          <div className="ml-auto h-4 w-24 animate-pulse rounded bg-foreground/20" />
        </div>
      </div>

      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className="grid gap-x-10 gap-y-4 border-b py-7 last:border-b-0 last:pb-0 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
        >
          <div>
            <div className="h-4 w-28 max-w-full animate-pulse rounded bg-foreground/20" />
            <div className="mt-2 h-3 w-40 max-w-full animate-pulse rounded bg-foreground/20" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-56 max-w-full animate-pulse rounded bg-foreground/20" />
            <div className="h-3 w-64 max-w-full animate-pulse rounded bg-foreground/20" />
            <div className="flex items-center gap-2">
              <div className="h-9 w-32 animate-pulse rounded-md bg-foreground/20" />
              <div className="h-4 w-40 max-w-full animate-pulse rounded bg-foreground/20" />
            </div>
            <div className="h-8 w-32 animate-pulse rounded-md bg-foreground/20" />
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Storage usage, first paint, before the overview arrives: the same page in
 * grey, so it never flashes an empty shell or shifts when the numbers land.
 */
export function AdminStorageSkeleton() {
  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading storage usage"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PageTitle as="h2">Storage</PageTitle>
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-foreground/20" />
        </div>
        <div className="shrink-0 space-y-2">
          <div className="ml-auto h-7 w-24 animate-pulse rounded bg-foreground/20" />
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-foreground/20" />
        </div>
      </div>

      <div className="mt-5 border-t" />

      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-border">
        {[0, 1, 2].map((column) => (
          <div key={column} className="py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
            <div className="h-4 w-28 max-w-full animate-pulse rounded bg-foreground/20" />
            <div className="mt-2 h-9 w-28 animate-pulse rounded bg-foreground/20" />
            <div className="mt-3 h-4 w-44 max-w-full animate-pulse rounded bg-foreground/20" />
            <div className="mt-3 h-4 w-28 animate-pulse rounded bg-foreground/20" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 pt-8 lg:grid-cols-2">
        {[0, 1].map((card) => (
          <div key={card} className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="h-6 w-40 animate-pulse rounded bg-foreground/20" />
              <div className="h-4 w-20 animate-pulse rounded bg-foreground/20" />
            </div>
            <div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-foreground/20" />
            <div className="mt-4 flex items-center gap-5">
              <div className="size-[108px] shrink-0 animate-pulse rounded-full bg-foreground/20" />
              <div className="min-w-0 flex-1 space-y-2.5">
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="h-4 w-full max-w-[14rem] animate-pulse rounded bg-foreground/20"
                  />
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3.5">
              <div className="h-3.5 w-40 animate-pulse rounded bg-foreground/20" />
              <div className="h-8 w-32 animate-pulse rounded-md bg-foreground/20" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-x-10 gap-y-8 border-t pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div>
          <div className="h-5 w-56 animate-pulse rounded bg-foreground/20" />
          <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-foreground/20" />
        </div>
        <div className="space-y-3">
          <div className="h-9 w-full max-w-sm animate-pulse rounded-full bg-foreground/20" />
          <div className="h-4 w-full max-w-lg animate-pulse rounded bg-foreground/20" />
          <div className="h-4 w-full max-w-xs animate-pulse rounded bg-foreground/20" />
          <div className="flex items-center justify-end gap-2 pt-2">
            <div className="h-4 w-16 animate-pulse rounded bg-foreground/20" />
            <div className="h-7 w-16 animate-pulse rounded bg-foreground/20" />
            <div className="h-4 w-12 animate-pulse rounded bg-foreground/20" />
          </div>
          <div className="h-3.5 w-full animate-pulse rounded-full bg-foreground/20" />
          <div className="h-3 w-64 animate-pulse rounded bg-foreground/20" />
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <div className="h-4 w-56 animate-pulse rounded bg-foreground/20" />
            <div className="h-8 w-24 animate-pulse rounded-md bg-foreground/20" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Backup settings, first paint: the same sheet in grey, so nothing jumps when the data lands. */
export function AdminBackupSkeleton() {
  return (
    <section
      className="mx-auto w-full max-w-6xl rounded-2xl border bg-card p-6 shadow-sm sm:p-10"
      aria-busy="true"
      aria-label="Loading backup settings"
    >
      <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div className="min-w-0 flex-1">
          <PageTitle as="h2">Backup</PageTitle>
          <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded bg-foreground/20" />
          <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded bg-foreground/20" />
        </div>
        <div className="shrink-0 space-y-2">
          <div className="ml-auto h-5 w-20 animate-pulse rounded bg-foreground/20" />
          <div className="ml-auto h-3.5 w-24 animate-pulse rounded bg-foreground/20" />
        </div>
      </div>

      {[0, 1, 2, 3].map((block) => (
        <div
          key={block}
          className="grid gap-x-10 gap-y-5 border-b py-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
        >
          <div>
            <div className="h-5 w-36 animate-pulse rounded bg-foreground/20" />
            <div className="mt-2.5 h-4 w-full max-w-[13rem] animate-pulse rounded bg-foreground/20" />
          </div>
          <div className="space-y-3">
            <div className="h-5 w-48 animate-pulse rounded bg-foreground/20" />
            <div className="h-4 w-full max-w-sm animate-pulse rounded bg-foreground/20" />
          </div>
        </div>
      ))}
    </section>
  );
}
