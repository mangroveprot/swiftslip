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
import { relativeTime } from "@/shared/time";
import { adminStatsQueryOptions } from "../queries";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">Activity — last 6 months</h3>
        <p className="text-xs text-muted-foreground">Records and OB forms created per month</p>
        {isLoading ? (
          <div className="mt-4 h-[240px] animate-pulse rounded-lg bg-muted" />
        ) : (
          <ChartContainer config={chartConfig} className="mt-4 aspect-auto h-[240px] w-full">
            <BarChart data={data?.monthly ?? []} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
              <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="records" fill="var(--color-records)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="forms" fill="var(--color-forms)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ActivityList
          title="Latest OB forms"
          empty="No official business forms yet."
          loading={isLoading}
          items={(data?.recentForms ?? []).map((f) => ({
            key: f.id,
            name: f.employee_name || "Unnamed employee",
            note: f.id_number ? `ID ${f.id_number}` : "",
            updated: f.updated_at,
          }))}
        />
        <ActivityList
          title="Latest DTR records"
          empty="No time records yet."
          loading={isLoading}
          items={(data?.recentRecords ?? []).map((r) => ({
            key: r.id,
            name: r.name || "Unnamed employee",
            note: `${MONTHS[r.month - 1] ?? ""} ${r.year}`,
            updated: r.updated_at,
          }))}
        />
      </div>
    </section>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function ActivityList({
  title,
  empty,
  loading,
  items,
}: {
  title: string;
  empty: string;
  loading: boolean;
  items: { key: string; name: string; note: string; updated: string }[];
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      {loading ? (
        <ul className="mt-3 space-y-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="size-8 animate-pulse rounded-full bg-muted" />
              <span className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(item.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                {item.note ? (
                  <span className="block truncate text-xs text-muted-foreground">{item.note}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {relativeTime(item.updated)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
