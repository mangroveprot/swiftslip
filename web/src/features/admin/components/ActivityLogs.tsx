import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  LogIn,
  Package,
  Paperclip,
  Search,
  ShieldCheck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PageTitle } from "@/components/common/PageTitle";
import { Input } from "@/components/ui/input";
import { ACTION_LABELS } from "@swiftslip/shared/activity";
import { ACTIVITY_LOG_PAGE_SIZE, type ActivityLogActionFilter } from "@swiftslip/shared/schemas";
import { activityLogCountsQueryOptions, activityLogsQueryOptions } from "../queries";

type Filter = "all" | ActivityLogActionFilter;
type Range = "today" | "7d" | "30d";

type LogRow = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_number: string | null;
  created_at: string;
  detail: string | null;
  ip: string | null;
  target: string | null;
};

const TABS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "signin", label: "Sign-ins" },
  { key: "signin-failed", label: "Failed sign-ins" },
  { key: "access", label: "Access changes" },
  { key: "accounts", label: "Account changes" },
  { key: "records", label: "Records" },
];

const RANGES: ReadonlyArray<{ key: Range; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

const APP_NAMES: Record<string, string> = {
  swiftslip: "SwiftSlip",
  inventory: "Inventory",
  ticketing: "Ticketing",
};

const SCOPE_NAMES: Record<string, string> = {
  user: "person",
  department: "department",
  position: "position",
};

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Access changes within this window collapse into one "changed access N times" row. */
const ACCESS_GROUP_WINDOW_MS = 10 * 60 * 1000;

type AccessGroup = { kind: "access"; key: string; rows: LogRow[] };
type LogItem = { kind: "row"; row: LogRow } | AccessGroup;
type DayGroup = { key: string; label: string; items: LogItem[] };

function startOfLocalDay(value: Date | string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function rangeStart(range: Range) {
  const start = startOfLocalDay(new Date());
  if (range === "7d") start.setDate(start.getDate() - 6);
  if (range === "30d") start.setDate(start.getDate() - 29);
  return start;
}

function dayKey(value: Date | string) {
  const date = startOfLocalDay(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: Date) {
  const today = startOfLocalDay(new Date());
  const date = startOfLocalDay(value);
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(value: Date | string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function actorName(row: LogRow) {
  const name = row.actor_name?.trim();
  if (name) return name;
  return row.actor_number?.trim() || "Unknown user";
}

function shorten(value: string | null) {
  if (!value) return "";
  return value.replace(UUID_PATTERN, (match) => `${match.slice(0, 8)}…`);
}

/** Turn "swiftslip · user: 2026-537 · granted" into a readable line. */
function accessDetail(row: LogRow) {
  const target = row.target ?? "";
  const [appPart = "", ...rest] = target.split(" · ");
  const app = APP_NAMES[appPart] ?? appPart;
  const scopePart = rest.join(" · ");
  const scopeMatch = scopePart.match(/^(user|department|position):\s*(.+)$/i);
  const scopeKey = scopeMatch?.[1]?.toLowerCase() ?? "";
  const scope = scopeMatch
    ? `${SCOPE_NAMES[scopeKey] ?? scopeKey} ${scopeMatch[2] ?? ""}`.trim()
    : scopePart;
  const verb =
    row.detail === "granted"
      ? "allowed"
      : row.detail === "denied"
        ? "blocked"
        : row.detail === "no one allowed until granted"
          ? "no one allowed"
          : row.detail;
  return [app, scope, verb].filter(Boolean).join(" · ");
}

function formatAccountDetail(detail: string | null) {
  if (!detail) return "";
  return detail
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(":");
      if (index < 0) return part;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (key === "role") {
        const role = value === "user" ? "Staff" : value === "admin" ? "Administrator" : value;
        return `Role: ${role}`;
      }
      if (key === "designation") return `Designation: ${value}`;
      if (key === "department") return `Department: ${value}`;
      if (key === "position") return `Position: ${value}`;
      return part;
    })
    .join(" · ");
}

function formatOrgDetail(row: LogRow) {
  const target = row.target ?? "";
  const match = target.match(/^(designation|department|position):\s*(.+)$/i);
  const targetText = match
    ? `${(match[1] ?? "").replace(/^./, (char) => char.toUpperCase())}: ${match[2] ?? ""}`
    : target;
  return [targetText, row.detail].filter(Boolean).join(" · ");
}

function secondaryFor(row: LogRow) {
  switch (row.action) {
    case "signin.success":
      return null;
    case "signin.failed":
      return row.detail || "Rejected sign-in attempt";
    case "access.updated":
      return accessDetail(row);
    case "user.created":
    case "user.deleted":
      return null;
    case "user.updated":
      return formatAccountDetail(row.detail) || null;
    case "attachment.uploaded":
    case "attachment.removed":
    case "ob.created":
    case "ob.deleted":
    case "loa.created":
    case "loa.deleted":
    case "cos.created":
    case "cos.deleted":
    case "ot.created":
    case "ot.deleted":
    case "record.created":
    case "record.deleted":
      return shorten(row.detail) || null;
    case "asset.created":
    case "asset.updated":
      return row.detail || null;
    case "report.downloaded":
      return null;
    case "org.updated":
      return formatOrgDetail(row) || null;
    default: {
      const parts = [row.target, row.detail].filter((value): value is string => Boolean(value));
      return parts.length ? parts.map(shorten).join(" · ") : null;
    }
  }
}

function Target({ value }: { value: string | null }) {
  if (!value) return null;
  const display = shorten(value);
  return (
    <span className="font-medium text-foreground" title={display !== value ? value : undefined}>
      {display}
    </span>
  );
}

function entryMain(row: LogRow): ReactNode {
  const actor = <span className="font-medium text-foreground">{actorName(row)}</span>;
  switch (row.action) {
    case "signin.success":
      return <>{actor} signed in</>;
    case "signin.failed":
      return (
        <>
          <span className="font-semibold text-destructive">Failed sign-in</span>{" "}
          <span className="font-medium">{row.actor_number || "Unknown ID"}</span>
        </>
      );
    case "access.updated":
      return <>{actor} changed app access</>;
    case "user.created":
      return (
        <>
          {actor} created the account for <Target value={row.target} />
        </>
      );
    case "user.updated":
      return (
        <>
          {actor} updated the account for <Target value={row.target} />
        </>
      );
    case "user.deleted":
      return (
        <>
          {actor} removed the account for <Target value={row.target} />
        </>
      );
    case "attachment.uploaded":
      return (
        <>
          {actor} uploaded an approval slip
          {row.target ? (
            <>
              {" "}
              to <Target value={row.target} />
            </>
          ) : null}
        </>
      );
    case "attachment.removed":
      return (
        <>
          {actor} removed an approval slip
          {row.target ? (
            <>
              {" "}
              from <Target value={row.target} />
            </>
          ) : null}
        </>
      );
    case "ob.created":
      return (
        <>
          {actor} created an OB form for <Target value={row.target} />
        </>
      );
    case "ob.deleted":
      return (
        <>
          {actor} removed an OB form for <Target value={row.target} />
        </>
      );
    case "loa.created":
      return (
        <>
          {actor} created a LOA form for <Target value={row.target} />
        </>
      );
    case "loa.deleted":
      return (
        <>
          {actor} removed a LOA form for <Target value={row.target} />
        </>
      );
    case "cos.created":
      return (
        <>
          {actor} created a COS form for <Target value={row.target} />
        </>
      );
    case "cos.deleted":
      return (
        <>
          {actor} removed a COS form for <Target value={row.target} />
        </>
      );
    case "ot.created":
      return (
        <>
          {actor} created an OT form for <Target value={row.target} />
        </>
      );
    case "ot.deleted":
      return (
        <>
          {actor} removed an OT form for <Target value={row.target} />
        </>
      );
    case "record.created":
      return (
        <>
          {actor} created a DTR record for <Target value={row.target} />
        </>
      );
    case "record.deleted":
      return (
        <>
          {actor} removed a DTR record for <Target value={row.target} />
        </>
      );
    case "asset.created":
      return (
        <>
          {actor} created <Target value={row.target} />
        </>
      );
    case "asset.updated":
      return (
        <>
          {actor} updated <Target value={row.target} />
        </>
      );
    case "report.downloaded": {
      const branch = row.target?.replace(/^Report for\s+/i, "") ?? "";
      return (
        <>
          {actor} downloaded the report
          {branch ? (
            <>
              {" "}
              for <Target value={branch} />
            </>
          ) : null}
        </>
      );
    }
    case "org.updated":
      return <>{actor} updated the org list</>;
    default:
      return (
        <>
          {actor} {ACTION_LABELS[row.action]?.toLowerCase() ?? row.action}
          {row.target ? (
            <>
              {" "}
              for <Target value={row.target} />
            </>
          ) : null}
        </>
      );
  }
}

function iconFor(action: string): LucideIcon {
  switch (action) {
    case "signin.success":
      return LogIn;
    case "signin.failed":
      return X;
    case "access.updated":
      return ShieldCheck;
    case "user.created":
    case "user.updated":
    case "user.deleted":
      return UserRound;
    case "attachment.uploaded":
    case "attachment.removed":
      return Paperclip;
    case "record.created":
    case "record.deleted":
      return ClipboardList;
    case "asset.created":
    case "asset.updated":
      return Package;
    case "report.downloaded":
      return Download;
    case "org.updated":
      return Building2;
    case "ob.created":
    case "ob.deleted":
    case "loa.created":
    case "loa.deleted":
    case "cos.created":
    case "cos.deleted":
    case "ot.created":
    case "ot.deleted":
      return FileText;
    default:
      return Activity;
  }
}

function iconTone(action: string) {
  if (
    action === "signin.failed" ||
    action.endsWith(".deleted") ||
    action === "attachment.removed"
  ) {
    return "bg-destructive/10 text-destructive";
  }
  if (action === "signin.success" || action === "access.updated") {
    return "bg-accent-tint text-accent-tint-foreground";
  }
  return "bg-muted text-muted-foreground";
}

function actorKey(row: LogRow) {
  return row.actor_id ?? row.actor_number ?? row.actor_name ?? "unknown";
}

function groupAccessChanges(rows: LogRow[]): LogItem[] {
  const items: LogItem[] = [];
  for (const row of rows) {
    if (row.action !== "access.updated") {
      items.push({ kind: "row", row });
      continue;
    }
    const previous = items[items.length - 1];
    if (previous?.kind === "access") {
      const newest = previous.rows[0];
      const gap = newest
        ? new Date(newest.created_at).getTime() - new Date(row.created_at).getTime()
        : Number.POSITIVE_INFINITY;
      if (
        newest &&
        actorKey(newest) === actorKey(row) &&
        gap >= 0 &&
        gap <= ACCESS_GROUP_WINDOW_MS
      ) {
        previous.rows.push(row);
        continue;
      }
    }
    items.push({ kind: "access", key: `access-${row.id}`, rows: [row] });
  }
  return items;
}

function buildDays(rows: LogRow[]): DayGroup[] {
  const days = new Map<string, { date: Date; rows: LogRow[] }>();
  for (const row of rows) {
    const date = new Date(row.created_at);
    const key = dayKey(date);
    const existing = days.get(key);
    if (existing) existing.rows.push(row);
    else days.set(key, { date, rows: [row] });
  }
  return [...days.entries()].map(([key, day]) => ({
    key,
    label: dayLabel(day.date),
    items: groupAccessChanges(day.rows),
  }));
}

function RowShell({
  dateTime,
  time,
  icon: Icon,
  tone,
  trailing,
  children,
}: {
  dateTime: string;
  time: string;
  icon: LucideIcon;
  tone: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[3.5rem_1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-b py-3.5 last:border-b-0 sm:grid-cols-[4.5rem_1.75rem_minmax(0,1fr)_auto]">
      <time
        dateTime={dateTime}
        className="pt-0.5 text-xs whitespace-nowrap tabular-nums text-muted-foreground"
      >
        {time}
      </time>
      <span
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">{children}</div>
      {trailing ? (
        <div className="col-start-3 row-start-2 text-xs text-muted-foreground sm:col-start-4 sm:row-start-1 sm:pt-0.5">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

function EntryRow({ row }: { row: LogRow }) {
  const Icon = iconFor(row.action);
  const secondary = secondaryFor(row);
  const showIp = row.action === "signin.success" || row.action === "signin.failed";
  return (
    <RowShell
      dateTime={row.created_at}
      time={formatTime(row.created_at)}
      icon={Icon}
      tone={iconTone(row.action)}
      trailing={
        showIp && row.ip ? (
          <span title={row.ip} className="tabular-nums">
            {row.ip}
          </span>
        ) : null
      }
    >
      <p className="text-sm leading-5">{entryMain(row)}</p>
      {secondary ? (
        <p
          className="mt-0.5 text-xs leading-5 break-words text-muted-foreground"
          title={row.detail && shorten(row.detail) !== row.detail ? row.detail : undefined}
        >
          {secondary}
        </p>
      ) : null}
    </RowShell>
  );
}

function AccessGroupRow({
  group,
  expanded,
  onToggle,
}: {
  group: AccessGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const newest = group.rows[0]!;
  const oldest = group.rows[group.rows.length - 1]!;
  const start = formatTime(oldest.created_at);
  const end = formatTime(newest.created_at);
  const rangeText = start === end ? `Around ${end}` : `Between ${start} and ${end}`;
  const detailsId = `access-details-${group.key}`;

  return (
    <RowShell
      dateTime={newest.created_at}
      time={end}
      icon={ShieldCheck}
      tone={iconTone("access.updated")}
      trailing={
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onToggle}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "Hide" : "Show"}
          <ChevronDown
            className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      }
    >
      <p className="text-sm leading-5">
        <span className="font-medium text-foreground">{actorName(newest)}</span> changed app access{" "}
        <span className="font-medium text-foreground">{group.rows.length} times</span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{rangeText}</p>
      {expanded ? (
        <div
          id={detailsId}
          key="access-details"
          className="mt-2 space-y-1.5 border-l pl-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out"
        >
          {group.rows.map((row) => (
            <div key={row.id} className="flex gap-2 text-xs text-muted-foreground">
              <time dateTime={row.created_at} className="w-14 shrink-0 tabular-nums">
                {formatTime(row.created_at)}
              </time>
              <span className="min-w-0 break-words">{accessDetail(row)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </RowShell>
  );
}

function ActivitySkeleton() {
  return (
    <div className="mt-5" role="status" aria-label="Loading activity logs">
      <div className="h-3 w-14 animate-pulse rounded bg-muted" />
      <div className="mt-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[3.5rem_1.75rem_minmax(0,1fr)] items-start gap-x-3 border-b py-3.5 sm:grid-cols-[4.5rem_1.75rem_minmax(0,1fr)_auto]"
          >
            <div className="mt-1 h-3 w-10 animate-pulse rounded bg-muted" />
            <div className="size-7 animate-pulse rounded-full bg-muted" />
            <div className="space-y-2">
              <div
                className={`h-3.5 animate-pulse rounded bg-muted ${i % 2 ? "w-2/3" : "w-4/5"}`}
              />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Admin-panel "Activity logs": sign-ins (including rejected attempts), account
 * changes, app-access changes, and record activity, newest first and grouped
 * by day. Rows past the 30-day retention window are removed by the database.
 */
export function ActivityLogs({
  initialFilter = "all",
}: {
  initialFilter?: Filter;
} = {}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [range, setRange] = useState<Range>("30d");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const listTopRef = useRef<HTMLDivElement>(null);

  // Debounced so typing does not fire a query per keystroke; a new search
  // always starts back at page 1.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fromIso = rangeStart(range).toISOString();
  const action = filter === "all" ? undefined : filter;
  const pageQuery = useQuery({
    ...activityLogsQueryOptions({ search: term, action, from: fromIso, page }),
    // Keep the previous page on screen while the next page loads so page
    // navigation doesn't flash empty or trigger extra refetches.
    placeholderData: keepPreviousData,
  });
  const countsQuery = useQuery(activityLogCountsQueryOptions({ from: fromIso }));

  const rows = pageQuery.data?.rows;
  const total = pageQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ACTIVITY_LOG_PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * ACTIVITY_LOG_PAGE_SIZE + 1;
  const last = Math.min(page * ACTIVITY_LOG_PAGE_SIZE, total);
  const counts = countsQuery.data;
  const days = useMemo(() => (rows ? buildDays(rows) : []), [rows]);
  const hasFilters = Boolean(term || filter !== "all" || range !== "30d");

  // If retention removes enough rows while an admin is deep in the pager, fall
  // back to the last real page instead of showing an empty slice.
  useEffect(() => {
    if (pageQuery.data && page > pageCount) setPage(pageCount);
  }, [page, pageCount, pageQuery.data]);

  function toggleGroup(key: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function goToPage(next: number) {
    setPage(next);
    // The pager sits below a long list; bring the new page back into view
    // instead of leaving the admin parked at the footer.
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4">
      <div>
        <PageTitle as="h2">Activity logs</PageTitle>
        <p className="mt-2 max-w-[42rem] text-sm leading-6 text-muted-foreground">
          Who signed in and what changed, including rejected sign-in attempts and the IP address
          they came from. Entries are deleted automatically after 30 days.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        {TABS.map((tab) => {
          const active = filter === tab.key;
          const count = counts?.[tab.key];
          const danger = tab.key === "signin-failed" && (count ?? 0) > 0;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(tab.key);
                setPage(1);
              }}
              className={`-mb-px flex items-baseline gap-2 border-b-2 pt-1 pb-3 text-sm transition-colors ${
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span
                className={`text-xs font-normal ${
                  danger ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {count ?? "—"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full border-b border-input transition-colors focus-within:border-primary sm:w-80">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, ID number, or action"
              maxLength={100}
              className="h-9 border-0 bg-transparent pr-0 pl-8 shadow-none focus-visible:ring-0"
              aria-label="Search activity logs"
            />
          </div>
        </div>

        <div
          role="group"
          aria-label="Date range"
          className="inline-flex shrink-0 rounded-md border border-input bg-background p-0.5"
        >
          {RANGES.map((item) => {
            const active = range === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setRange(item.key);
                  setPage(1);
                }}
                className={`rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "bg-secondary font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 border-t" />
      <div ref={listTopRef} className="scroll-mt-4" />

      {pageQuery.isLoading ? (
        <ActivitySkeleton />
      ) : pageQuery.isError ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {pageQuery.error instanceof Error
            ? pageQuery.error.message
            : "Could not load activity logs."}
        </p>
      ) : days.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-medium">
            {hasFilters ? "No activity matches" : "No activity yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters
              ? "Try a different search, tab, or date range."
              : "Sign-ins and changes will appear here."}
          </p>
        </div>
      ) : (
        // key replays the enter animation whenever the visible set of logs
        // changes — switching a filter tab, the date range, or a page. Matches
        // the AppAccess detail pane and Inventory route transitions.
        <div
          key={`${filter}:${range}:${page}`}
          className="mt-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out"
        >
          {days.map((day, index) => (
            <section key={day.key} className={index === 0 ? "" : "mt-5 border-t pt-5"}>
              <h3 className="text-xs font-semibold text-foreground">{day.label}</h3>
              <div className="mt-1">
                {day.items.map((item) =>
                  item.kind === "row" ? (
                    <EntryRow key={item.row.id} row={item.row} />
                  ) : item.rows.length === 1 ? (
                    <EntryRow key={item.rows[0]!.id} row={item.rows[0]!} />
                  ) : (
                    <AccessGroupRow
                      key={item.key}
                      group={item}
                      expanded={expanded.has(item.key)}
                      onToggle={() => toggleGroup(item.key)}
                    />
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {!pageQuery.isLoading && !pageQuery.isError && total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Showing {first}–{last} of {total} {total === 1 ? "entry" : "entries"}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goToPage(Math.max(1, page - 1))}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Previous
            </button>
            <span className="px-1 text-xs text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => goToPage(page + 1)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              Next
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
