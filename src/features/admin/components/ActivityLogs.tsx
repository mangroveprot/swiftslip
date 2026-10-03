import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { ACTIVITY_LOG_PAGE_SIZE, type ActivityLogActionFilter } from "@/shared/schemas";
import { ACTION_LABELS, actionPillClass } from "../activity";
import { activityLogsQueryOptions } from "../queries";

/**
 * Admin-panel "Activity logs": who signed in (including rejected attempts —
 * for spotting password spam) and who created/removed what. Search + an
 * action filter + date range + pagination keep hundreds of rows readable;
 * rows past the 30-day retention window are deleted by the database and
 * never shown here.
 */
export function ActivityLogs() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [action, setAction] = useState<ActivityLogActionFilter | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Debounced so typing doesn't fire a query per keystroke; a new search
  // always starts back at page 1.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  function changeDate(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  // Local dates → instants so "that day" means the admin's own day.
  const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
  const toIso = to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined;

  const { data, isLoading, isError, error } = useQuery(
    activityLogsQueryOptions({
      search: term,
      ...(action ? { action } : {}),
      from: fromIso,
      to: toIso,
      page,
    }),
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ACTIVITY_LOG_PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * ACTIVITY_LOG_PAGE_SIZE + 1;
  const last = Math.min(page * ACTIVITY_LOG_PAGE_SIZE, total);
  const filtered = Boolean(term || action || from || to);

  function clearFilters() {
    setSearch("");
    setTerm("");
    setAction("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <div>
        <h2 className="text-2xl">Activity logs</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Who signed in and what changed — rejected sign-in attempts included, with the IP address
          they came from. Kept for 30 days, then deleted automatically.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID number, action…"
            className="pl-9"
            aria-label="Search activity logs"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Action
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as ActivityLogActionFilter | "");
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            <optgroup label="Security">
              <option value="signin">Signed in</option>
              <option value="signin-failed">Sign-in failed</option>
              <option value="accounts">Account changes</option>
            </optgroup>
            <optgroup label="Activity">
              <option value="ob">OB forms</option>
              <option value="loa">LOA forms</option>
              <option value="records">DTR records</option>
              <option value="attachments">Approval slips</option>
              <option value="inventory">Inventory</option>
            </optgroup>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => changeDate(setFrom)(e.target.value)}
            className="w-36"
            aria-label="From date"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          To
          <Input
            type="date"
            value={to}
            onChange={(e) => changeDate(setTo)(e.target.value)}
            className="w-36"
            aria-label="To date"
          />
        </label>
        {filtered ? (
          <button className="btn btn-outline" onClick={clearFilters}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 w-full animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Could not load activity logs."}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {filtered ? `No activity matches the current filters.` : "No activity recorded yet."}
          </p>
        ) : (
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-4 py-2.5 font-medium">Who</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Details</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <span className="block font-medium">
                      {row.actor_name ?? (row.actor_number ? "Unknown name" : "—")}
                    </span>
                    {row.actor_number ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.actor_number}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <span className={actionPillClass(row.action)}>
                      {ACTION_LABELS[row.action] ?? row.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 align-top text-muted-foreground">
                    {[row.target, row.detail].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="hidden px-4 py-2.5 align-top text-xs text-muted-foreground md:table-cell">
                    {row.ip || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {total === 0
            ? "Nothing to show"
            : `Showing ${first}–${last} of ${total} ${total === 1 ? "entry" : "entries"}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <button
            className="btn btn-outline"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
