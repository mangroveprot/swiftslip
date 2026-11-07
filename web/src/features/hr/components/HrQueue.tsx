import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { obReturnState, type ObHrStatus } from "@swiftslip/shared/hr";
import type { HrObSummary } from "@swiftslip/shared/api-types";
import { hrQueueQueryOptions } from "../queries";
import { QueueTable } from "./HrQueueTable";

type HrView = "queue" | "completed" | "rejected";

/**
 * Which status tab is selected. Completed and Rejected are URL views linked
 * from the sidebar, not tab state.
 */
type StatusTab = "all" | "waiting" | "onob" | "overdue" | "supervisor";

/** Queue order: what HR must act on first, completed last. */
const STATUS_ORDER: ObHrStatus[] = [
  "submitted",
  "approved",
  "departed",
  "waiting_supervisor",
  "rejected",
  "completed",
];

/**
 * The tabs above the list, each with the count it filters to. `All` is the
 * whole review queue (everything the sidebar's Review queue row counts). The
 * signed-out forms split into `On OB` and `Overdue`, so the two counts add up
 * to what left instead of one nesting inside the other — Overdue is derived
 * (`obReturnState`), never a stored status.
 */
const STATUS_TABS: Array<{
  key: StatusTab;
  label: string;
  match: (form: HrObSummary) => boolean;
}> = [
  {
    key: "all",
    label: "All",
    match: (form) => form.hr_status !== "completed" && form.hr_status !== "rejected",
  },
  { key: "waiting", label: "Waiting for HR", match: (form) => form.hr_status === "submitted" },
  {
    key: "onob",
    label: "On OB",
    match: (form) => form.hr_status === "departed" && !obReturnState(form).overdue,
  },
  { key: "overdue", label: "Overdue", match: (form) => obReturnState(form).overdue },
  {
    key: "supervisor",
    label: "Waiting for Supervisor",
    match: (form) => form.hr_status === "waiting_supervisor",
  },
];

const ROWS_PER_PAGE = [10, 25, 50, 100];

/** The OB date filter; `date_of_ob` is a plain `YYYY-MM-DD`. */
const OB_DATE_OPTIONS = [
  { value: "", label: "OB date" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "Next 7 days" },
  { value: "month", label: "This month" },
  { value: "none", label: "No OB date" },
];

// ── Filtering helpers ─────────────────────────────────────────────────────────

/** Local midnight for today, so "Today" never drifts across time zones. */
function todayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function matchesObDate(form: HrObSummary, filter: string): boolean {
  if (!filter) return true;
  const value = form.date_of_ob.trim();
  if (filter === "none") return !value;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  // A hand-typed date can't be bucketed — it only shows under "OB date".
  if (!iso) return false;

  const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const today = todayStart();
  const dayAfter = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const inAWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

  if (filter === "today") return date.getTime() === today.getTime();
  if (filter === "tomorrow") return date.getTime() === dayAfter.getTime();
  if (filter === "week") return date >= today && date < inAWeek;
  if (filter === "month")
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  return true;
}

/**
 * The rows each view holds. The review queue is everything HR still has a
 * say in — Completed and Rejected have their own sidebar views, the way
 * Completed already had.
 */
function inBucket(form: HrObSummary, view: HrView): boolean {
  if (view === "completed") return form.hr_status === "completed";
  if (view === "rejected") return form.hr_status === "rejected";
  return form.hr_status !== "completed" && form.hr_status !== "rejected";
}

/** Filter dropdown options: the placeholder first, then the distinct values. */
function distinctOptions(values: string[], placeholder: string, current: string) {
  const set = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (value) set.add(value);
  }
  // Keep a chosen value selectable even after the rows behind it change.
  if (current.trim()) set.add(current.trim());
  return [
    { value: "", label: placeholder },
    ...[...set].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
  ];
}

/** 1 2 3 … 9 10 — the page strip around the current page, never a wall of numbers. */
function pageNumbers(current: number, count: number): Array<number | "gap"> {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
  const wanted = [...new Set([1, count, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= count)
    .sort((a, b) => a - b);

  const out: Array<number | "gap"> = [];
  let previous = 0;
  for (const page of wanted) {
    if (page - previous > 1) out.push("gap");
    out.push(page);
    previous = page;
  }
  return out;
}

/**
 * The HR queue as a list, in the reference's shape: status tabs with counts,
 * an overdue notice above a search-and-filter toolbar, then the rows and a
 * footer that reads "Showing 4 of 4" while everything fits on one page.
 * Everything sits on SwiftSlip's own surfaces and palette — only the layout is
 * the reference's, and the reference's red alert is the app's amber warning.
 *
 * Completed and Rejected are the same screen with `?view=completed` /
 * `?view=rejected`, so the sidebar can link to them without a second route or
 * a second query.
 */
export function HrQueue() {
  const { data, isLoading, isError, error, refetch } = useQuery(hrQueueQueryOptions());
  const viewParam = useRouterState({
    select: (state) => (state.location.search as { view?: string } | undefined)?.view,
  });
  const view: HrView = viewParam === "completed" || viewParam === "rejected" ? viewParam : "queue";
  const navigate = useNavigate();

  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [obDate, setObDate] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  const forms = useMemo(() => data ?? [], [data]);

  // Any change to what the list shows starts it over at page one.
  useEffect(() => {
    setPage(1);
  }, [view, statusTab, search, department, supervisor, obDate, rowsPerPage]);

  const counts = useMemo(() => {
    const tally: Record<StatusTab, number> = {
      all: 0,
      waiting: 0,
      onob: 0,
      overdue: 0,
      supervisor: 0,
    };
    for (const form of forms) {
      for (const tab of STATUS_TABS) if (tab.match(form)) tally[tab.key] += 1;
    }
    return tally;
  }, [forms]);
  const completedCount = useMemo(
    () => forms.filter((form) => form.hr_status === "completed").length,
    [forms],
  );

  const departmentOptions = useMemo(
    () =>
      distinctOptions(
        forms.map((form) => form.department),
        "Department",
        department,
      ),
    [forms, department],
  );
  const supervisorOptions = useMemo(
    () =>
      distinctOptions(
        forms.map((form) => form.approved_by),
        "Supervisor",
        supervisor,
      ),
    [forms, supervisor],
  );

  /** What each URL view holds, before tabs, search and filters. */
  const bucket = useMemo(() => forms.filter((form) => inBucket(form, view)), [forms, view]);

  /**
   * The queue's overdue rows — the banner's whole reason to exist. Read from
   * the bucket rather than the filtered list, so narrowing the search can
   * never hide an employee who is still out.
   */
  const overdueForms = useMemo(
    () => (view === "queue" ? bucket.filter((form) => obReturnState(form).overdue) : []),
    [bucket, view],
  );

  /** The banner's sentence: how many are out, and the earliest date missed. */
  const overdueNotice = useMemo(() => {
    if (overdueForms.length === 0) return null;
    const earliest = overdueForms.reduce<Date | null>((min, form) => {
      const due = obReturnState(form).due;
      return due && (!min || due < min) ? due : min;
    }, null);
    const count = overdueForms.length;
    const headline =
      count === 1 ? "1 employee hasn't returned." : `${count} employees haven't returned.`;
    const detail = earliest
      ? `${count === 1 ? "Their" : "The earliest"} OB ended ${earliest.toLocaleDateString(
          undefined,
          { month: "short", day: "numeric" },
        )} and no arrival has been signed.`
      : "No arrival has been signed.";
    return { headline, detail };
  }, [overdueForms]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matchesTab = STATUS_TABS.find((entry) => entry.key === statusTab)?.match;
    return bucket.filter((form) => {
      // The status tabs only partition the review queue; Completed keeps its own view.
      if (view === "queue" && matchesTab && !matchesTab(form)) return false;
      if (department && form.department.trim() !== department) return false;
      if (supervisor && form.approved_by.trim() !== supervisor) return false;
      if (!matchesObDate(form, obDate)) return false;
      if (!term) return true;
      const haystack = [
        form.employee_name,
        form.id_number,
        form.department,
        form.position,
        form.approved_by,
        ...form.destinations,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [bucket, view, statusTab, department, supervisor, obDate, search]);

  /**
   * What HR must act on first: an employee already past their date above
   * everything, then the queue's normal order, then the most recently touched.
   */
  const ordered = useMemo(() => {
    const rank = new Map(STATUS_ORDER.map((status, index) => [status, index]));
    const rankOf = (form: HrObSummary) =>
      obReturnState(form).overdue ? -1 : (rank.get(form.hr_status) ?? 99);
    return [...filtered].sort((a, b) => {
      const byStatus = rankOf(a) - rankOf(b);
      if (byStatus !== 0) return byStatus;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [filtered]);

  const total = ordered.length;
  const pageCount = Math.max(1, Math.ceil(total / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const first = total === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const last = Math.min(currentPage * rowsPerPage, total);
  const pageRows = ordered.slice(first - 1, last);

  /** The empty-state copy for the view being shown. */
  const emptyCopy = {
    queue: {
      title: "No forms yet",
      body: "Submitted Official Business forms will appear here so you can review and approve them.",
    },
    completed: {
      title: "No completed forms yet",
      body: "Forms appear here once departure and arrival have both been signed.",
    },
    rejected: {
      title: "No rejected forms yet",
      body: "Forms appear here once HR rejects them.",
    },
  }[view];

  function clearFilters() {
    setStatusTab("all");
    setSearch("");
    setDepartment("");
    setSupervisor("");
    setObDate("");
  }

  return (
    <main className="@container mx-auto flex min-h-full w-full max-w-[80rem] flex-col px-4 py-8 md:px-10 md:py-11">
      <header>
        <h1 className="text-[2.15rem] font-semibold leading-none tracking-[-0.045em] sm:text-[2.75rem]">
          HR Approvals
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Official Business forms employees have sent for review.
        </p>
      </header>

      {/* The tab strip: counts live here, so the list needs no group headings. */}
      <nav
        aria-label="Queue views"
        className="mt-6 flex flex-wrap items-center gap-x-6 border-b sm:gap-x-8"
      >
        {STATUS_TABS.map((tab) => {
          const active = view === "queue" && statusTab === tab.key;
          return (
            // A filter, not a destination: buttons keep `aria-pressed` honest
            // (every Link to /hr would be "current" at once), and the one that
            // matters — Completed — stays a link because it changes the URL.
            <button
              key={tab.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatusTab(tab.key);
                // A tab is only meaningful on the queue itself.
                if (view !== "queue") void navigate({ to: "/hr", search: {} });
              }}
              className={cn(
                "-mb-px border-b-2 pt-1 pb-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "border-dashboard-rule font-medium text-foreground dark:border-emerald-400"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
        <Link
          to="/hr"
          search={{ view: "completed" }}
          className={cn(
            "-mb-px border-b-2 pt-1 pb-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            view === "completed"
              ? "border-dashboard-rule font-medium text-foreground dark:border-emerald-400"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Completed
          <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
            {completedCount}
          </span>
        </Link>
      </nav>

      {/* Someone is out past their date: one calm line in the warning tone —
          the reference's red banner read as an alarm, this reads as a to-do —
          with a quiet link to the rows it is about. */}
      {overdueNotice ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3">
          <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm leading-6 text-amber-900 dark:text-amber-100">
            <span className="font-semibold">{overdueNotice.headline}</span> {overdueNotice.detail}
          </p>
          <button
            type="button"
            onClick={() => setStatusTab("overdue")}
            className="shrink-0 rounded-sm text-sm font-medium text-amber-800 underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-amber-200"
          >
            Show overdue
          </button>
        </div>
      ) : null}

      {/* Search and the three filters — the toolbar above the list. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex h-9 w-full items-center gap-2 rounded-md border border-border bg-card px-3 transition-colors focus-within:border-primary sm:w-80">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, ID, department or place"
            aria-label="Search the HR queue"
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Department"
            value={department}
            onChange={setDepartment}
            options={departmentOptions}
          />
          <FilterSelect
            label="Supervisor"
            value={supervisor}
            onChange={setSupervisor}
            options={supervisorOptions}
          />
          <FilterSelect
            label="OB date"
            value={obDate}
            onChange={setObDate}
            options={OB_DATE_OPTIONS}
          />
        </div>

        {/* How many rows the toolbar is showing, right-aligned like the reference. */}
        <p className="ml-auto hidden text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:block">
          {total} {total === 1 ? "form" : "forms"}
        </p>
      </div>

      {isLoading ? (
        <QueueSkeleton />
      ) : isError ? (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p>{error instanceof Error ? error.message : "Could not load the queue."}</p>
          <button
            type="button"
            className="mt-2 font-medium underline underline-offset-4"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      ) : total === 0 ? (
        bucket.length === 0 ? (
          <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
            <div className="max-w-sm space-y-2">
              <p className="text-xl font-medium text-foreground">{emptyCopy.title}</p>
              <p className="text-sm text-muted-foreground">{emptyCopy.body}</p>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
            <p className="text-sm font-medium">No forms match these filters</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {search.trim() ? `Nothing matches “${search.trim()}”. ` : ""}
              Try a different keyword, or clear the search and filters.
            </p>
            <button type="button" className="btn btn-outline mt-4" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )
      ) : (
        <>
          <div className="mt-6">
            <QueueTable rows={pageRows} />
          </div>

          <QueuePagination
            total={total}
            first={first}
            last={last}
            page={currentPage}
            pageCount={pageCount}
            rowsPerPage={rowsPerPage}
            onPage={setPage}
            onRowsPerPage={setRowsPerPage}
          />
        </>
      )}
    </main>
  );
}

/** A filter dropdown: its placeholder is the screenshot's "Department ▾" label. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 cursor-pointer appearance-none rounded-md border border-border bg-card pr-8 pl-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          value ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 size-4 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}

/** "Showing 1–10 of 1,000" with rows-per-page and the page strip. */
function QueuePagination({
  total,
  first,
  last,
  page,
  pageCount,
  rowsPerPage,
  onPage,
  onRowsPerPage,
}: {
  total: number;
  first: number;
  last: number;
  page: number;
  pageCount: number;
  rowsPerPage: number;
  onPage: (page: number) => void;
  onRowsPerPage: (rows: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      {/* One page reads as the reference's "Showing 4 of 4"; a paged list
          still needs the range so "of 1,000" means something. */}
      <p className="text-xs text-muted-foreground tabular-nums">
        {pageCount > 1 ? `Showing ${first}–${last} of ${total}` : `Showing ${total} of ${total}`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Rows per page
          <select
            value={rowsPerPage}
            onChange={(event) => onRowsPerPage(Number(event.target.value))}
            className="h-8 cursor-pointer rounded-md border border-border bg-card px-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {ROWS_PER_PAGE.map((rows) => (
              <option key={rows} value={rows}>
                {rows}
              </option>
            ))}
          </select>
        </label>

        {/* Nothing to page through yet: the reference's footer has no arrows. */}
        {pageCount > 1 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              className="btn btn-outline gap-1 px-2.5 py-1.5 text-xs"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Previous
            </button>

            {pageNumbers(page, pageCount).map((entry, index) =>
              entry === "gap" ? (
                <span
                  key={`gap-${index}`}
                  className="px-1 text-muted-foreground"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  onClick={() => onPage(entry)}
                  aria-current={entry === page ? "page" : undefined}
                  aria-label={`Page ${entry}`}
                  className={cn(
                    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    entry === page
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {entry}
                </button>
              ),
            )}

            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => onPage(page + 1)}
              className="btn btn-outline gap-1 px-2.5 py-1.5 text-xs"
            >
              Next
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Table-shaped placeholder rows, one per column of the real list. */
function QueueSkeleton() {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border bg-card" aria-label="Loading queue">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
          <Skeleton className="h-5 w-28 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="hidden min-w-0 flex-1 space-y-2 sm:block">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="hidden h-8 w-32 shrink-0 sm:block" />
        </div>
      ))}
    </div>
  );
}
