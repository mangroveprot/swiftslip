import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Briefcase, Clock, ShieldCheck, Users } from "lucide-react";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ACTIVITY_FEED_LIMIT } from "@/shared/schemas";
import { relativeTime } from "@/shared/time";
import { ACTION_LABELS, actionPillClass } from "../activity";
import { activityFeedQueryOptions, adminStatsQueryOptions } from "../queries";

const chartConfig = {
  records: { label: "DTR records", color: "#4f46e5" },
  forms: { label: "OB forms", color: "#0d9488" },
} satisfies ChartConfig;

/** Admin-panel landing section: totals at a glance, a six-month chart and the
 *  latest activity. */
export function AdminDashboard() {
  const { data, isLoading } = useQuery(adminStatsQueryOptions());

  const cards = [
    {
      label: "Accounts",
      value: data?.accounts,
      icon: Users,
      note: data
        ? `${data.accounts - data.administrators} staff · ${data.administrators} admins`
        : "All sign-ins",
    },
    {
      label: "DTR records",
      value: data?.records,
      icon: Clock,
      note: "Time sheets on file",
    },
    {
      label: "OB forms",
      value: data?.forms,
      icon: Briefcase,
      note: "Official business slips on file",
    },
    {
      label: "Administrators",
      value: data?.administrators,
      icon: ShieldCheck,
      note: "Full admin & portal access",
    },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl">Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Portal-wide totals and the latest activity across every account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </p>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <card.icon className="size-4" aria-hidden="true" />
              </span>
            </div>
            {isLoading ? (
              <div className="mt-2 h-9 w-16 animate-pulse rounded-md bg-muted" />
            ) : (
              <p className="mt-2 text-3xl font-semibold tabular-nums">{card.value ?? 0}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_17rem]">
        <FormActivityPanel className="order-2 lg:order-1" />

        <div className="order-1 flex flex-col gap-4 lg:order-2">
          <div className="flex flex-1 flex-col rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Activity last 6 months</h3>
            <p className="text-xs text-muted-foreground">Records and OB forms created per month</p>
            {isLoading ? (
              <div className="mt-4 min-h-[240px] flex-1 animate-pulse rounded-lg bg-muted" />
            ) : (
              <ChartContainer
                config={chartConfig}
                className="mt-4 aspect-auto min-h-[240px] w-full flex-1"
              >
                <BarChart
                  data={data?.monthly ?? []}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={<ChartTooltipContent />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="records" fill="var(--color-records)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="forms" fill="var(--color-forms)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </div>
        </div>

        <SecurityLogsPanel className="order-3" />
      </div>
    </section>
  );
}

/** Shared three-row placeholder for the dashboard's log panels. */
function FeedSkeleton() {
  return (
    <ul className="mt-3 space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted" />
        </li>
      ))}
    </ul>
  );
}

/** Dashboard left rail: the newest form actions from the activity log. */
function FormActivityPanel({ className = "" }: { className?: string }) {
  const { data, isLoading, isError, error } = useQuery(activityFeedQueryOptions("forms"));
  const rows = data ?? [];

  return (
    <section className={`rounded-xl border bg-card p-4 shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold">Latest activity</h3>
      <p className="text-xs text-muted-foreground">Latest {ACTIVITY_FEED_LIMIT} actions</p>
      {isLoading ? (
        <FeedSkeleton />
      ) : isError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Could not load activity."}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No form activity yet.</p>
      ) : (
        <ul className="mt-1 divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-1">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {row.actor_name ?? row.actor_number ?? "—"}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(row.created_at)}
                </span>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <span className={`${actionPillClass(row.action)} shrink-0`}>
                  {ACTION_LABELS[row.action] ?? row.action}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {[row.target, row.detail].filter(Boolean).join(" · ")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Dashboard right rail: the newest security events (sign-ins, account changes). */
function SecurityLogsPanel({ className = "" }: { className?: string }) {
  const { data, isLoading, isError, error } = useQuery(activityFeedQueryOptions("security"));
  const rows = data ?? [];

  return (
    <section className={`rounded-xl border bg-card p-4 shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold">Security logs</h3>
      <p className="text-xs text-muted-foreground">
        Latest {ACTIVITY_FEED_LIMIT} sign-ins & account changes
      </p>
      {isLoading ? (
        <FeedSkeleton />
      ) : isError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Could not load activity."}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No security events yet.</p>
      ) : (
        <ul className="mt-1 divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-1">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {row.actor_name ?? (row.actor_number ? "Unknown name" : "—")}
                  {row.actor_number ? (
                    <span className="font-normal text-muted-foreground"> · {row.actor_number}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(row.created_at)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className={`${actionPillClass(row.action)} shrink-0`}>
                  {ACTION_LABELS[row.action] ?? row.action}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {row.ip || row.target || ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
