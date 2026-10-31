import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PageTitle } from "@/components/common/PageTitle";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { FORM_TYPES, type FormEvent, type FormKind } from "@swiftslip/shared/forms";
import { ACTION_LABELS } from "@swiftslip/shared/activity";
import type { ActivityLogActionFilter } from "@swiftslip/shared/schemas";
import { relativeTime } from "@swiftslip/shared/time";
import {
  chartSeries,
  deltaLabel,
  formTypeBreakdown,
  formsThisMonth,
  monthComparison,
  pluralize,
  type ChartGranularity,
} from "../dashboard-data";
import { activityFeedQueryOptions, adminStatsQueryOptions } from "../queries";
import { useUserPhotos } from "../use-user-photos";
import { AdminClock } from "./AdminClock";

const chartConfig = {
  count: { label: "Forms", color: "var(--color-dashboard-accent)" },
  current: { label: "Current period", color: "var(--color-dashboard-current)" },
} satisfies ChartConfig;

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

type AdminDashboardProps = {
  /** Jump to the matching section, optionally pre-filtering the activity log. */
  onNavigate?: ((section: "users" | "logs", filter?: ActivityLogActionFilter) => void) | undefined;
};

/**
 * Admin-panel landing section. The layout is deliberately editorial rather
 * than a wall of cards: one rule under the title, three divided summary
 * columns, then the form chart, form-type breakdown and the two activity
 * panels. That keeps the numbers readable at a glance while matching the flat
 * treatment used by User management and Activity logs.
 */
export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const statsQuery = useQuery(adminStatsQueryOptions());
  const { data, isLoading, isError, error, refetch } = statsQuery;

  const events = useMemo(() => data?.formEvents ?? [], [data]);
  const now = new Date();
  const month = formsThisMonth(events, now);
  const typeRows = formTypeBreakdown(events, now);

  const staff = data ? data.accounts - data.administrators : 0;
  const incomplete = data?.incompleteProfiles ?? 0;
  const failedToday = data?.security.failedToday ?? 0;
  const attention = incomplete + failedToday;

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

      <div className="mt-5 border-t-2 border-dashboard-rule" />

      {isError ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error instanceof Error ? error.message : "Could not load dashboard totals."}</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="font-medium underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-border">
        <SummaryColumn
          label="Accounts"
          loading={isLoading}
          value={data?.accounts}
          note={
            data
              ? `${staff} staff, ${pluralize(data.administrators, "administrator")}`
              : "Staff and administrators"
          }
        >
          {onNavigate ? (
            <SummaryLink onClick={() => onNavigate("users")}>Manage accounts</SummaryLink>
          ) : null}
        </SummaryColumn>

        <SummaryColumn
          label="Forms this month"
          loading={isLoading}
          value={month.current}
          note={
            isLoading ? "Compared with last month" : monthComparison(month.current, month.previous)
          }
        >
          {onNavigate ? (
            <SummaryLink onClick={() => onNavigate("logs")}>View form activity</SummaryLink>
          ) : null}
        </SummaryColumn>

        <SummaryColumn
          label="Needs attention"
          loading={isLoading}
          value={attention}
          valueClassName="text-logo"
          note={
            isLoading
              ? "Profiles and sign-ins"
              : attention === 0
                ? "Nothing needs attention today."
                : "Follow up on the items below."
          }
        >
          {!isLoading && attention > 0 ? (
            <div className="space-y-1.5">
              {incomplete > 0 ? (
                <AttentionLink
                  tone="warning"
                  onClick={() => onNavigate?.("users")}
                  label={pluralize(incomplete, "incomplete profile")}
                />
              ) : null}
              {failedToday > 0 ? (
                <AttentionLink
                  tone="danger"
                  onClick={() => onNavigate?.("logs")}
                  label={`${pluralize(failedToday, "failed sign-in")} today`}
                />
              ) : null}
            </div>
          ) : null}
        </SummaryColumn>
      </div>

      <div className="grid gap-x-10 gap-y-10 pt-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <FormsFiledPanel events={events} loading={isLoading} />
        <ByFormTypePanel
          rows={typeRows}
          records={data?.records}
          loading={isLoading}
          onNavigate={onNavigate}
        />
      </div>

      <div className="mt-10 grid gap-x-10 gap-y-10 border-t pt-8 lg:grid-cols-2">
        <LatestActivityPanel onNavigate={onNavigate} />
        <SecurityPanel security={data?.security} onNavigate={onNavigate} />
      </div>
    </section>
  );
}

function SummaryColumn({
  label,
  value,
  note,
  loading,
  valueClassName = "",
  children,
}: {
  label: string;
  value: number | undefined;
  note: string;
  loading: boolean;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-1 h-10 w-16 animate-pulse rounded-md bg-muted" />
      ) : (
        <p className={`mt-1 text-4xl font-bold tracking-tight tabular-nums ${valueClassName}`}>
          {value ?? 0}
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">{note}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function SummaryLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
    >
      {children}
    </button>
  );
}

function AttentionLink({
  tone,
  label,
  onClick,
}: {
  tone: "warning" | "danger";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-left text-sm transition-colors hover:text-foreground"
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          tone === "danger" ? "bg-destructive" : "bg-logo"
        }`}
        aria-hidden="true"
      />
      <span className={tone === "danger" ? "text-destructive" : "text-foreground"}>{label}</span>
    </button>
  );
}

function FormsFiledPanel({ events, loading }: { events: FormEvent[]; loading: boolean }) {
  const [granularity, setGranularity] = useState<ChartGranularity>("week");
  const [show, setShow] = useState<FormKind | "all">("all");

  const series = useMemo(() => chartSeries(events, granularity, show), [events, granularity, show]);
  const showLabel =
    show === "all" ? "all form types" : (FORM_TYPES.find((type) => type.key === show)?.label ?? "");

  return (
    <section aria-labelledby="forms-filed-title" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h3 id="forms-filed-title" className="text-lg font-semibold tracking-tight">
            Forms filed
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {granularity === "week" ? "Last 8 weeks" : "Last 6 months"}, {showLabel.toLowerCase()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show
            <span className="relative">
              <select
                value={show}
                onChange={(event) => setShow(event.target.value as FormKind | "all")}
                className="h-8 appearance-none rounded-md border border-input bg-background pr-7 pl-2.5 text-xs font-medium text-foreground outline-none transition-colors focus-visible:border-dashboard-accent"
              >
                <option value="all">All forms</option>
                {FORM_TYPES.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
          </label>

          <div
            role="group"
            aria-label="Chart period"
            className="grid shrink-0 grid-cols-2 rounded-md border border-input bg-background p-0.5"
          >
            {(["week", "month"] as const).map((item) => {
              const active = granularity === item;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGranularity(item)}
                  className={`rounded-[4px] px-2.5 py-1 text-center text-xs font-medium transition-colors ${
                    active
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  By {item}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 h-[280px] animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <ChartContainer config={chartConfig} className="mt-4 h-[280px] w-full min-w-0">
            <BarChart data={series} margin={{ top: 24, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={28}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={46}>
                {series.map((point, index) => (
                  <Cell
                    key={index}
                    fill={point.current ? "var(--color-current)" : "var(--color-count)"}
                  />
                ))}
                <LabelList
                  dataKey="count"
                  position="top"
                  fill="var(--color-foreground)"
                  fontSize={11}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          <p className="mt-2 text-xs text-muted-foreground">
            The lighter bar is the current {granularity} so far.
          </p>
        </>
      )}
    </section>
  );
}

function ByFormTypePanel({
  rows,
  records,
  loading,
  onNavigate,
}: {
  rows: ReturnType<typeof formTypeBreakdown>;
  records: number | undefined;
  loading: boolean;
  onNavigate?: ((section: "users" | "logs") => void) | undefined;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section aria-labelledby="by-form-type-title" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="by-form-type-title" className="text-lg font-semibold tracking-tight">
            By form type
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Filed this month, most first</p>
        </div>
        {onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate("logs")}
            className="text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            View activity
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3" aria-label="Loading form types">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 py-1">
              <div className="flex items-center justify-between gap-3">
                <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3.5 w-10 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-4">
          {rows.map((row) => (
            <li key={row.key} className="py-3.5">
              <div className="grid grid-cols-[minmax(0,1fr)_1.75rem_3.75rem] items-center gap-x-2.5 sm:grid-cols-[minmax(7rem,1.8fr)_minmax(3.5rem,1fr)_1.75rem_3.75rem]">
                <span className="text-sm leading-5">{row.label}</span>
                <TypeBar value={row.count} max={max} className="hidden sm:block" />
                <span className="text-right text-sm font-semibold tabular-nums">{row.count}</span>
                <span className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {deltaLabel(row.delta)}
                </span>
              </div>
              <TypeBar value={row.count} max={max} className="mt-2 sm:hidden" />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        The figure on the right is the change from last month.{" "}
        {typeof records === "number"
          ? `${records.toLocaleString()} DTR records on file, counted separately.`
          : "DTR records are counted separately."}
      </p>
    </section>
  );
}

function TypeBar({
  value,
  max,
  className = "",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span className={`block h-2 overflow-hidden rounded-full bg-secondary ${className}`}>
      <span
        className="block h-full rounded-full bg-dashboard-accent transition-[width] duration-500 ease-out"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

function FeedSkeleton() {
  return (
    <ul className="mt-2 space-y-3" aria-label="Loading activity">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="space-y-2 py-2">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" />
        </li>
      ))}
    </ul>
  );
}

function compact(value: string | null) {
  if (!value) return "";
  return value.trim().replace(UUID_PATTERN, (match) => `${match.slice(0, 8)}…`);
}

function activityVerb(action: string) {
  switch (action) {
    case "ob.created":
      return "created an OB form";
    case "ob.deleted":
      return "removed an OB form";
    case "loa.created":
      return "created a LOA form";
    case "loa.deleted":
      return "removed a LOA form";
    case "cos.created":
      return "created a COS form";
    case "cos.deleted":
      return "removed a COS form";
    case "ot.created":
      return "created an OT form";
    case "ot.deleted":
      return "removed an OT form";
    case "record.created":
      return "created a DTR record";
    case "record.deleted":
      return "removed a DTR record";
    case "attachment.uploaded":
      return "uploaded an approval slip";
    case "attachment.removed":
      return "removed an approval slip";
    case "asset.created":
      return "created an asset";
    case "asset.updated":
      return "updated an asset";
    case "report.downloaded":
      return "downloaded a report";
    case "user.created":
      return "created an account";
    case "user.updated":
      return "updated an account";
    case "user.deleted":
      return "removed an account";
    case "access.updated":
      return "changed app access";
    case "org.updated":
      return "changed an org list";
    case "signin.success":
      return "signed in";
    case "signin.failed":
      return "failed a sign-in";
    default:
      return (ACTION_LABELS[action] ?? action).toLowerCase();
  }
}

function activitySecondary(
  row: { action: string; target: string | null; detail: string | null },
  actor: string,
) {
  if (row.action === "attachment.uploaded" || row.action === "attachment.removed") {
    return compact(row.detail) || compact(row.target);
  }

  // Access and org edits read better with both halves: what changed, and the
  // new value ("swiftslip · department: Finance · granted").
  if (row.action === "access.updated" || row.action === "org.updated") {
    return [compact(row.target), compact(row.detail)].filter(Boolean).join(" · ");
  }

  const target = compact(row.target);
  if (target) {
    // A form is logged as "Name (employee number)". When the actor filed their
    // own form, repeating their name adds nothing; show the ID on its own.
    const bareId = target.match(/^\(([^)]+)\)$/);
    if (bareId) return `ID ${bareId[1]}`;
    if (target.startsWith(`${actor} (`) && target.endsWith(")")) {
      return `ID ${target.slice(actor.length + 2, -1)}`;
    }
    return target;
  }
  return compact(row.detail);
}

type FeedRow = {
  id: string;
  action: string;
  /** The account behind the action — what the avatar beside the name resolves. */
  actor_id: string | null;
  actor_name: string | null;
  actor_number: string | null;
  target: string | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
};

function actorName(row: FeedRow) {
  const name = row.actor_name?.trim();
  if (name) return name;
  return row.actor_number?.trim() || "Unknown user";
}

function isLoopbackIp(ip: string | null) {
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
}

function displayIp(ip: string | null) {
  if (!ip) return "";
  return isLoopbackIp(ip) ? "this server" : ip;
}

function securityActorLabel(row: Pick<FeedRow, "actor_name" | "actor_number">) {
  const name = row.actor_name?.trim();
  const number = row.actor_number?.trim();
  if (name && name !== number) return name;
  if (number) return `Account ${number}`;
  return name || "Unknown account";
}

function ipList(ips: string[]) {
  const shown = ips.map(displayIp).filter(Boolean);
  if (shown.length === 0) return "an unrecorded IP";
  if (shown.length === 1) return shown[0]!;
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}`;
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function rowIps(rows: FeedRow[]) {
  return [...new Set(rows.map((row) => row.ip?.trim() ?? "").filter(Boolean))];
}

type SigninGroup = {
  kind: "signin";
  key: string;
  latest: FeedRow;
  todayCount: number;
  totalCount: number;
  ips: string[];
  newIp: boolean;
};

type FailedGroup = {
  kind: "failed";
  key: string;
  latest: FeedRow;
  count: number;
  ips: string[];
  detail: string | null;
};

type SecurityItem = SigninGroup | FailedGroup;

function signinVerb(item: SigninGroup) {
  if (item.todayCount > 1) return `signed in ${item.todayCount} times today`;
  if (item.todayCount === 0 && item.totalCount > 1) return `signed in ${item.totalCount} times`;
  return "signed in";
}

/**
 * Turn the flat security feed into the dashboard's compact story: one row per
 * person for successful sign-ins, one row per ID for failed attempts, with
 * today's sign-ins counted. Failed attempts get one slot so they stay visible
 * even when several people have signed in since.
 */
function securityItems(
  rows: FeedRow[],
  newIpKeys: { actorNumber: string; ip: string }[],
): SecurityItem[] {
  const signinMap = new Map<string, FeedRow[]>();
  const failedMap = new Map<string, FeedRow[]>();

  for (const row of rows) {
    if (row.action === "signin.success") {
      const key = row.actor_number?.trim() || row.actor_name?.trim() || "unknown";
      const group = signinMap.get(key) ?? [];
      group.push(row);
      signinMap.set(key, group);
    } else if (row.action === "signin.failed") {
      const key = row.actor_number?.trim() || "unknown";
      const group = failedMap.get(key) ?? [];
      group.push(row);
      failedMap.set(key, group);
    }
  }

  const byLatest = (a: SecurityItem, b: SecurityItem) =>
    Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at);

  const signinItems: SigninGroup[] = [];
  for (const [key, group] of signinMap) {
    group.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const latest = group[0];
    if (!latest) continue;
    const todayRows = group.filter((row) => isToday(row.created_at));
    const todayCount = todayRows.length;
    const relevant = todayCount > 0 ? todayRows : group;
    const newIp = group.some((row) => {
      const ip = row.ip?.trim();
      const actorNumber = row.actor_number?.trim();
      return (
        !!ip &&
        !!actorNumber &&
        newIpKeys.some((entry) => entry.actorNumber === actorNumber && entry.ip === ip)
      );
    });
    signinItems.push({
      kind: "signin",
      key,
      latest,
      todayCount,
      totalCount: group.length,
      ips: rowIps(relevant),
      newIp,
    });
  }

  const failedItems: FailedGroup[] = [];
  for (const [key, group] of failedMap) {
    group.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const latest = group[0];
    if (!latest) continue;
    failedItems.push({
      kind: "failed",
      key,
      latest,
      count: group.length,
      ips: rowIps(group),
      detail: group.find((row) => row.detail?.trim())?.detail?.trim() ?? null,
    });
  }

  signinItems.sort(byLatest);
  failedItems.sort(byLatest);

  // Keep the summary's "From another location" line connected to the list:
  // if the three newest people all signed in locally but someone else used an
  // outside IP today, show that person instead of the third local row.
  const topSignins = signinItems.slice(0, 3);
  const isNotable = (item: SigninGroup) =>
    item.todayCount > 0 && (item.newIp || item.ips.some((ip) => !isLoopbackIp(ip)));
  const hasNotable = topSignins.some(isNotable);
  if (!hasNotable) {
    const notable = signinItems.find(isNotable);
    if (notable) {
      if (topSignins.length >= 3) topSignins[topSignins.length - 1] = notable;
      else topSignins.push(notable);
    }
  }

  const selected: SecurityItem[] = [...topSignins, ...failedItems.slice(0, 1)];
  for (const item of signinItems) {
    if (selected.length >= 4) break;
    if (!selected.includes(item)) selected.push(item);
  }
  for (const item of failedItems.slice(1)) {
    if (selected.length >= 4) break;
    selected.push(item);
  }

  return selected.sort(byLatest).slice(0, 4);
}

function LatestActivityPanel({
  onNavigate,
}: {
  onNavigate?: ((section: "users" | "logs") => void) | undefined;
}) {
  const { data, isLoading, isError, error } = useQuery(activityFeedQueryOptions("activity"));
  const rows = (data ?? []).slice(0, 6);
  // Faces for the six names below — one batch, shared with the logs page's
  // cache entry whenever the same people appear.
  const photos = useUserPhotos(rows.map((row) => row.actor_id));

  return (
    <section aria-labelledby="latest-activity-title">
      <div className="flex items-baseline justify-between gap-3 border-b pb-3">
        <h3 id="latest-activity-title" className="text-lg font-semibold tracking-tight">
          Latest activity
        </h3>
        {onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate("logs")}
            className="text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            View all
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <FeedSkeleton />
      ) : isError ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Could not load activity."}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const secondary = activitySecondary(row, actorName(row));
            return (
              <li key={row.id} className="flex items-start justify-between gap-4 py-3.5">
                <div className="flex min-w-0 items-start gap-2">
                  <ProfileAvatar
                    photo={photos[row.actor_id ?? ""]}
                    name={actorName(row)}
                    size={20}
                    className="mt-px"
                  />
                  <div className="min-w-0">
                    <p className="text-sm leading-5">
                      <span className="font-medium text-foreground">{actorName(row)}</span>{" "}
                      {activityVerb(row.action)}
                    </p>
                    {secondary ? (
                      <p
                        className="mt-0.5 truncate text-xs text-muted-foreground"
                        title={secondary}
                      >
                        {secondary}
                      </p>
                    ) : null}
                  </div>
                </div>
                <time
                  dateTime={row.created_at}
                  className="shrink-0 text-xs whitespace-nowrap text-muted-foreground"
                >
                  {relativeTime(row.created_at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SecurityPanel({
  security,
  onNavigate,
}: {
  security:
    | {
        signinsToday: number;
        failedToday: number;
        ipCounts: { ip: string | null; count: number }[];
        newIpKeys: { actorNumber: string; ip: string }[];
        actors: string[];
        latest: {
          actor_name: string | null;
          actor_number: string | null;
          ip: string | null;
          created_at: string;
        } | null;
      }
    | undefined;
  onNavigate?: ((section: "users" | "logs", filter?: ActivityLogActionFilter) => void) | undefined;
}) {
  const { data, isLoading, isError, error } = useQuery(activityFeedQueryOptions("security"));
  const items = useMemo(
    () => securityItems(data ?? [], security?.newIpKeys ?? []),
    [data, security?.newIpKeys],
  );
  // Failed attempts carry an ID number, not a person, so only the successful
  // rows resolve to a face — the avatar is drawn inside that branch.
  const photos = useUserPhotos(items.map((item) => item.latest.actor_id));
  const latest = security?.latest ?? null;
  const signinsToday = security?.signinsToday ?? 0;
  const people = security?.actors.length ?? 0;
  const failedToday = security?.failedToday ?? 0;
  const ipCounts = security?.ipCounts ?? [];
  const external = ipCounts.filter(({ ip }) => ip && !isLoopbackIp(ip));
  const externalTotal = external.reduce((sum, { count }) => sum + count, 0);
  const externalIps = [...new Set(external.map(({ ip }) => displayIp(ip)).filter(Boolean))];
  const externalSummary =
    externalTotal === 0
      ? "None today"
      : `${pluralize(externalTotal, "sign-in")}, ${
          externalIps.length === 1
            ? (externalIps[0] ?? "another location")
            : `${externalIps.length} locations`
        }`;
  const latestSummary = latest
    ? `${securityActorLabel(latest)}, ${relativeTime(latest.created_at)}`
    : "No sign-ins yet";

  return (
    <section aria-labelledby="security-title">
      <div className="border-b pb-3">
        <h3 id="security-title" className="text-lg font-semibold tracking-tight">
          Sign-ins and security
        </h3>
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-muted/40 p-4">
        <p className="text-xs font-medium text-muted-foreground">Today</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{signinsToday}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Sign-ins</p>
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{people}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">People</p>
          </div>
          <div>
            <p
              className={`text-2xl font-bold tracking-tight tabular-nums ${
                failedToday > 0 ? "text-destructive" : ""
              }`}
            >
              {failedToday}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Failed attempts</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">Latest sign-in</span>
            <span
              className="min-w-0 truncate text-right text-xs font-medium text-foreground"
              title={latestSummary}
            >
              {latestSummary}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">From another location</span>
            <span
              className="min-w-0 truncate text-right text-xs font-medium text-foreground"
              title={externalSummary}
            >
              {externalSummary}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <FeedSkeleton />
      ) : isError ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Could not load security events."}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No sign-in activity yet.</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const secondary =
              item.kind === "signin"
                ? `From ${ipList(item.ips)}`
                : `${item.detail || "Wrong ID number or password"}, from ${ipList(item.ips)}`;

            return (
              <li
                key={`${item.kind}:${item.key}`}
                className="flex items-start justify-between gap-4 py-3.5"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <ProfileAvatar
                    photo={photos[item.latest.actor_id ?? ""]}
                    name={securityActorLabel(item.latest)}
                    size={20}
                    className="mt-px"
                  />
                  <div className="min-w-0">
                    {item.kind === "signin" ? (
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5">
                        <span className="font-semibold text-foreground">
                          {securityActorLabel(item.latest)}
                        </span>
                        <span>{signinVerb(item)}</span>
                        {item.newIp ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            New IP address
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5">
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                          {pluralize(item.count, "failed sign-in")}
                        </span>
                        <span className="font-semibold text-foreground">
                          ID {item.latest.actor_number?.trim() || "unknown"}
                        </span>
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={secondary}>
                      {secondary}
                    </p>
                  </div>
                </div>
                <time
                  dateTime={item.latest.created_at}
                  className="shrink-0 text-xs whitespace-nowrap text-muted-foreground"
                >
                  {relativeTime(item.latest.created_at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {onNavigate ? (
        <div className="mt-2 border-t pt-3">
          <button
            type="button"
            onClick={() => onNavigate("logs", "signin")}
            className="text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            View all sign-ins
          </button>
        </div>
      ) : null}
    </section>
  );
}
