import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Minus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { deleteAccessRule, getAccessOverview, setAccessRule } from "@/api/access-rules.functions";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GRANTABLE_APP_KEYS, type GrantableAppKey, type RuleScope } from "@/shared/types";

/** The admin's other filters are hand-rolled selects; this is the same class
 *  string Activity logs uses, so all three screens match pixel for pixel. */
const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:h-9 md:px-3";

const APP_LABELS: Record<GrantableAppKey, string> = {
  swiftslip: "SwiftSlip",
  inventory: "Inventory",
};

/** Badges on each row. The scope is still stored as "department" in the
 *  database — it reads the profile's `area` — but everything the user sees
 *  calls that field Department. */
const SCOPE_LABEL: Record<RuleScope, string> = {
  user: "Account",
  department: "Department",
  position: "Position",
};

const GROUPS: Array<{ key: string; title: string; hint: string }> = [
  { key: "admin", title: "Administrators", hint: "Always have every app. Not changeable here." },
  { key: "user", title: "Accounts", hint: "Applies to this one person." },
  {
    key: "department",
    title: "Departments",
    hint: "Applies to everyone whose profile has this Department.",
  },
  {
    key: "position",
    title: "Positions",
    hint: "Applies to everyone whose profile has this Position.",
  },
];

type Outcome = {
  admin: boolean;
  allowed: boolean;
  byRule: boolean;
  byScope: string | null;
  ruleId: string | null;
};

type Row = {
  kind: RuleScope;
  scopeValue: string;
  label: string;
  secondary: string;
  department: string;
  position: string;
  isAdmin: boolean;
  apps: Outcome[];
};

const rowKey = (r: Row) => `${r.kind}:${r.scopeValue}`;

/** The three settings a cell can hold. "default" means no rule at all. */
type CellState = "allowed" | "blocked" | "default";

/**
 * Who may open which application.
 *
 * A matrix rather than a create-form because the question an administrator
 * actually asks is "who can get into the Inventory" — one column to scan, with
 * the current state visible rather than only the rules someone remembers making.
 *
 * Every cell shows the EFFECTIVE outcome, computed server-side by the same
 * `resolveAccess` the route guards use (api/access-rules.functions.ts), so this
 * screen cannot drift from what actually enforces access.
 *
 *   Always          an administrator — locked
 *   Allowed         an explicit rule says yes
 *   Blocked         an explicit rule says no
 *   On by default   no rule; open to everyone anyway
 *   Off by default  no rule; not open to everyone
 *
 * Clicking cycles default → Allowed → Blocked → default, so removing a rule is
 * the same gesture as adding one.
 */
export function AppAccess() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [scope, setScope] = useState<RuleScope | "all">("all");
  const [overridesOnly, setOverridesOnly] = useState(false);
  const [appFilter, setAppFilter] = useState<GrantableAppKey | "all">("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [perPage, setPerPage] = useState(25);

  const overview = useQuery({ queryKey: ["access-overview"], queryFn: () => getAccessOverview() });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["access-overview"] });
    setSelected(new Set());
  };

  const setRule = useMutation({
    mutationFn: setAccessRule,
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || "Could not save that change."),
  });
  const removeRule = useMutation({
    mutationFn: deleteAccessRule,
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || "Could not remove that rule."),
  });

  /**
   * The rule behind a cell comes from the overview, never a second query — a
   * stale rule list made "flip to blocked" silently re-apply "allowed".
   */
  async function setState(row: Row, app: GrantableAppKey, next: CellState) {
    const outcome = row.apps[GRANTABLE_APP_KEYS.indexOf(app)];
    if (!outcome || outcome.admin) return;
    try {
      if (next === "default") {
        // Back to inherited: the rule goes away entirely.
        if (outcome.ruleId) await removeRule.mutateAsync({ data: { id: outcome.ruleId } });
        return;
      }
      await setRule.mutateAsync({
        data: {
          app_key: app,
          scope: row.kind,
          scope_value: row.scopeValue,
          allow: next === "allowed",
        },
      });
    } catch {
      // The mutation's onError already surfaced it.
    }
  }

  const data = overview.data;
  const term = filter.trim().toLowerCase();

  // Rows per group under the search box and Overrides only, but ignoring the
  // scope chip. The chip counts read from here: "All" has to keep saying 9
  // while you are looking at Administrators, otherwise the number moves
  // whenever you click something else and stops meaning anything.
  const scoped = useMemo(() => {
    if (!data) return [];
    // Administrators are listed apart: their cells are fixed, so a flat column
    // of "Always" reads as broken rather than intentional.
    const byKey: Record<string, Row[]> = {
      admin: data.accounts.filter((r) => r.isAdmin),
      user: data.accounts.filter((r) => !r.isAdmin),
      department: data.departments,
      position: data.positions,
    };
    return GROUPS.map((g) => {
      let rows = byKey[g.key] ?? [];
      if (term) {
        rows = rows.filter((r) =>
          `${r.label} ${r.secondary} ${r.department} ${r.position}`.toLowerCase().includes(term),
        );
      }
      if (overridesOnly) rows = rows.filter((r) => r.apps.some((a) => a.byRule));
      return { ...g, rows };
    }).filter((g) => g.rows.length > 0);
  }, [data, term, overridesOnly]);

  /** How many rows the scope chip would show — stable across scope changes. */
  const groupCount = (key: string) =>
    key === "all"
      ? scoped.reduce((n, g) => n + g.rows.length, 0)
      : (scoped.find((g) => g.key === key)?.rows.length ?? 0);

  const groups = scope === "all" ? scoped : scoped.filter((g) => g.key === scope);
  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
  const visibleApps = appFilter === "all" ? [...GRANTABLE_APP_KEYS] : [appFilter];

  // "N of M can open" under each column header.
  const summary = (app: GrantableAppKey) => {
    let can = 0;
    let of = 0;
    for (const g of groups) {
      for (const r of g.rows) {
        const outcome = r.apps[GRANTABLE_APP_KEYS.indexOf(app)];
        if (!outcome) continue;
        of += 1;
        if (outcome.allowed) can += 1;
      }
    }
    return { can, of };
  };

  // Pagination is applied across the whole flattened list, so the footer count
  // is honest about what is hidden.
  let budget = perPage;
  const paged = groups.map((g) => {
    const take = Math.max(0, Math.min(g.rows.length, budget));
    budget -= take;
    return { ...g, visible: g.rows.slice(0, take) };
  });

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleRow = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allKeys = groups.flatMap((g) => g.rows.map(rowKey));
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));

  /** Apply one access value to every selected row for the chosen app. */
  async function bulk(app: GrantableAppKey, allow: boolean) {
    const rows = allKeys
      .map((k) => groups.flatMap((g) => g.rows).find((r) => rowKey(r) === k))
      .filter((r): r is Row => Boolean(r));
    try {
      for (const r of rows) {
        const outcome = r.apps[GRANTABLE_APP_KEYS.indexOf(app)];
        if (!outcome || outcome.admin) continue;
        // Already in the requested state — skip so clearing is not undone.
        if (outcome.allowed === allow && (allow || !outcome.byRule)) continue;
        if (allow) {
          await setRule.mutateAsync({
            data: { app_key: app, scope: r.kind, scope_value: r.scopeValue, allow: true },
          });
        } else if (outcome.ruleId) {
          await removeRule.mutateAsync({ data: { id: outcome.ruleId } });
        }
      }
      refresh();
    } catch {
      // surfaced by onError
    }
  }

  const error = overview.error instanceof Error ? overview.error.message : null;

  // The blurb stays visible at every width (hiding it behind a "?" read as
  // inconsistent), but it is one short line: the detail lives in the How-it-works
  // block at the bottom, so the header never fills a short window on its own and
  // pushes the list below the fold. Colours and the desktop matrix are unchanged.
  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4">
      <h2 className="text-lg sm:text-xl">App access</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Who can open each app. Pick a setting to change it; administrators always have everything.
      </p>

      {/* Toolbar. Everything here wraps: a non-wrapping child here has a
          min-content width wider than a phone, and a flex item will not shrink
          below it — which pushed the whole card off the screen rather than
          scrolling the table. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {/* Same shape as the account search on User management: the shared
            `Input` plus an icon inside it. This was a bare `.inp` with no icon
            and a hard width, which is why it did not match anything else. */}
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:left-3"
            aria-hidden="true"
          />
          <Input
            type="search"
            className="h-8 pl-8 text-sm md:h-9 md:pl-9"
            value={filter}
            placeholder="Search by name, ID number, department…"
            aria-label="Filter"
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <ScopeChip active={scope === "all"} onClick={() => setScope("all")}>
            All {groupCount("all")}
          </ScopeChip>
          {GROUPS.map((g) => (
            <ScopeChip
              key={g.key}
              active={scope === g.key}
              onClick={() => setScope(g.key as RuleScope | "all")}
            >
              {g.title} {groupCount(g.key)}
            </ScopeChip>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs sm:ml-auto">
          <input
            type="checkbox"
            checked={overridesOnly}
            onChange={(e) => setOverridesOnly(e.target.checked)}
          />
          Overrides only
        </label>

        <select
          className={SELECT_CLASS}
          value={appFilter}
          aria-label="Application"
          onChange={(e) => setAppFilter(e.target.value as GrantableAppKey | "all")}
        >
          <option value="all">App: All</option>
          {GRANTABLE_APP_KEYS.map((a) => (
            <option key={a} value={a}>
              App: {APP_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      ) : overview.isLoading ? (
        <div className="mt-4 h-72 w-full animate-pulse rounded-md bg-muted" />
      ) : totalRows === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {term || overridesOnly || scope !== "all"
            ? "Nothing matches the current filter."
            : "No accounts yet."}
        </p>
      ) : (
        <>
          {/* Desktop: the matrix. Phones get cards instead (below) — a sideways
              scroll to reach the two app controls never got usable. */}
          <div className="mt-4 hidden max-w-full overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="w-8 py-2 pl-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(allKeys))}
                    />
                  </th>
                  {/* Not "Who" — a row is not always a person. A Department or
                    Position row applies to a group, so the header has to cover
                    both. */}
                  <th className="py-2 font-medium text-muted-foreground">Applies to</th>
                  {visibleApps.map((app) => {
                    const s = summary(app);
                    return (
                      <th key={app} className="w-40 py-2 pr-3 text-right max-md:w-32 max-md:pr-2">
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {APP_LABELS[app]}
                        </span>
                        <span className="block text-[10px] font-normal text-muted-foreground/80">
                          {s.can} of {s.of} can open
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {paged.map((group) => {
                const isCollapsed = collapsed.has(group.key);
                return (
                  <tbody key={group.key}>
                    {/* Group header — a plain section title like the sidebar's
                        "Security" / "Activity": bold text, no fill, rows sit
                        indented underneath it. Doubles as the collapse toggle. */}
                    <tr>
                      <td className="pt-3 pb-1 pl-3" colSpan={2 + visibleApps.length}>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-sm font-semibold text-foreground/80"
                            onClick={() => toggleGroup(group.key)}
                            aria-expanded={!isCollapsed}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="size-3.5" aria-hidden="true" />
                            )}
                            {group.title}
                          </button>
                          <span className="rounded-full border px-1.5 text-[10px] font-medium text-muted-foreground">
                            {group.rows.length}
                          </span>
                          <span className="text-[11px] font-normal text-muted-foreground">
                            {group.hint}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {!isCollapsed
                      ? group.visible.map((row, i) => {
                          const key = rowKey(row);
                          return (
                            <tr key={key} className="transition-colors hover:bg-muted/40">
                              <td className="py-1.5 pr-2 pl-7 align-middle">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${row.label}`}
                                  checked={selected.has(key)}
                                  onChange={() => toggleRow(key)}
                                />
                              </td>
                              <td className="min-w-0 py-1.5 pr-3 align-middle">
                                <div className="flex min-w-0 items-center gap-2">
                                  {/* An ID number broken across lines reads as two
                                    different values. */}
                                  <span className="font-medium whitespace-nowrap">{row.label}</span>
                                  {row.secondary ? (
                                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                                      {row.secondary}
                                    </span>
                                  ) : null}
                                  <span className="ml-auto mr-2 rounded-full border px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {SCOPE_LABEL[row.kind]}
                                  </span>
                                </div>
                              </td>
                              {visibleApps.map((app) => {
                                const outcome = row.apps[GRANTABLE_APP_KEYS.indexOf(app)];
                                if (!outcome) return null;
                                return (
                                  <td
                                    key={app}
                                    className="py-1.5 pr-3 text-right align-middle max-md:pr-2"
                                  >
                                    <AccessCell
                                      outcome={outcome}
                                      busy={setRule.isPending || removeRule.isPending}
                                      onChange={(next) => void setState(row, app, next)}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      : null}
                  </tbody>
                );
              })}
            </table>
          </div>

          {/* Phones: one card per row, the app controls stacked underneath. No
              sideways scrolling, and the name wraps instead of being cut off. */}
          <div className="mt-3 space-y-3 md:hidden">
            {paged.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              return (
                <div key={group.key}>
                  {/* Group header — plain section title, matching the sidebar
                      "Security" / "Activity" pattern: bold, no fill. */}
                  <button
                    type="button"
                    className="flex items-center gap-1.5 pt-1 pb-1 text-sm font-semibold text-foreground/80"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    )}
                    {group.title}
                    <span className="rounded-full border px-1.5 text-[10px] font-medium text-muted-foreground">
                      {group.rows.length}
                    </span>
                  </button>
                  {!isCollapsed ? (
                    <div className="space-y-1.5 pl-3">
                      {group.visible.map((row) => {
                        const key = rowKey(row);
                        return (
                          <div key={key} className="rounded-lg border p-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.label}`}
                                checked={selected.has(key)}
                                onChange={() => toggleRow(key)}
                              />
                              <span className="min-w-0 truncate font-medium">{row.label}</span>
                              <span className="ml-auto shrink-0 rounded-full border px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                                {SCOPE_LABEL[row.kind]}
                              </span>
                            </div>
                            {row.secondary ? (
                              <div className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
                                {row.secondary}
                              </div>
                            ) : null}
                            <div className="mt-2 space-y-1.5">
                              {visibleApps.map((app) => {
                                const outcome = row.apps[GRANTABLE_APP_KEYS.indexOf(app)];
                                if (!outcome) return null;
                                return (
                                  <div
                                    key={app}
                                    className="flex items-center justify-between gap-2"
                                  >
                                    <span className="text-xs text-muted-foreground">
                                      {APP_LABELS[app]}
                                    </span>
                                    <AccessCell
                                      outcome={outcome}
                                      busy={setRule.isPending || removeRule.isPending}
                                      onChange={(next) => void setState(row, app, next)}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Bulk bar — only while something is ticked. */}
      {selected.size > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          {GRANTABLE_APP_KEYS.map((app) => (
            <span key={app} className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={setRule.isPending || removeRule.isPending}
                onClick={() => void bulk(app, true)}
              >
                Allow {APP_LABELS[app]}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={setRule.isPending || removeRule.isPending}
                onClick={() => void bulk(app, false)}
              >
                Block {APP_LABELS[app]}
              </Button>
            </span>
          ))}
          <button
            type="button"
            className="ml-auto text-xs text-muted-foreground underline"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          Showing {Math.min(perPage, totalRows)} of {totalRows}
          {/* When a group chip is on, the denominator is what All holds — so
              the row count never silently shrinks under you. */}
          {scope !== "all" && groupCount("all") !== totalRows
            ? ` (${groupCount("all")} in all)`
            : ""}
        </span>
        <span className="hidden md:inline">
          · New apps appear as extra columns; scroll sideways, the name column stays put.
        </span>
        <label className="ml-auto flex items-center gap-1.5">
          Rows per page
          <select
            className="h-7 rounded border bg-background px-1.5"
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* What each value means. A two-column definition list rather than a
          wrapping flex row — the pills and their explanations drifted apart
          the moment the text wrapped. */}
      <div className="mt-4 border-t pt-3">
        <h4 className="text-xs font-semibold text-foreground">Key</h4>
        {/* The pill column is sized to the widest pill, not a guess: at 11rem
            the ~4.5rem pills left 100px of dead space between each one and its
            explanation, which read as four unrelated captions. */}
        <dl className="mt-2 grid gap-x-3 gap-y-2 text-xs text-muted-foreground sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
          <dt>
            <Legend tone="always">Always</Legend>
          </dt>
          <dd>An administrator. They have every app, and it cannot be changed here.</dd>

          <dt>
            <Legend tone="allowed">Allowed</Legend>
          </dt>
          <dd>A rule on this row allows this app.</dd>

          <dt>
            <Legend tone="blocked">Blocked</Legend>
          </dt>
          <dd>A rule on this row blocks this app.</dd>

          <dt>
            <Legend tone="default">By default</Legend>
          </dt>
          <dd>No rule on this row. Staff can use SwiftSlip this way, but not the Inventory.</dd>
        </dl>
        <p className="mt-3 max-w-2xl text-xs text-muted-foreground">
          If more than one could apply, the narrowest wins: the person&apos;s own choice beats their
          Department&apos;s, which beats their Position&apos;s. The Admin Panel is not listed here —
          it is granted by the Administrator access level alone.
        </p>
      </div>
    </section>
  );
}

function ScopeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-6 rounded-full border px-2 text-[11px] transition-colors ${
        // Byte-for-byte the filter chips on User management — same height,
        // same solid-fill active state, same inactive border. A tint here
        // looked tidier in isolation but made the two screens disagree.
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Legend({
  tone,
  children,
}: {
  tone: "always" | "allowed" | "blocked" | "default";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "blocked"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "default"
        ? // Was dashed + muted-foreground: on the card background that is all
          // but invisible, and the one entry people most need to recognise.
          "border-border bg-muted/70 text-foreground/80 border-dashed"
        : "border-primary/40 bg-primary/15 text-primary";
  // "By default" carries no mark on purpose — it means no rule was set, and a
  // tick there would claim a grant that does not exist.
  const mark =
    tone === "default" ? null : tone === "blocked" ? (
      <Minus className="size-3" />
    ) : (
      <Check className="size-3" />
    );
  return (
    <span
      className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-2 py-0.5 font-medium ${toneClass}`}
    >
      {mark}
      {children}
    </span>
  );
}

function AccessCell({
  outcome,
  busy,
  onChange,
}: {
  outcome: Outcome;
  busy: boolean;
  onChange: (next: CellState) => void;
}) {
  // Administrators are locked in: shown as a static pill rather than a control
  // that silently does nothing when clicked.
  if (outcome.admin) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary"
        title="Administrators always have access to every app."
      >
        <Check className="size-3.5" aria-hidden="true" />
        Always
      </span>
    );
  }

  const value: CellState = outcome.byRule ? (outcome.allowed ? "allowed" : "blocked") : "default";
  const inherited = outcome.allowed ? "On by default" : "Off by default";

  const tone =
    value === "allowed"
      ? "border-primary/40 bg-primary/15 text-primary"
      : value === "blocked"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-dashed text-muted-foreground";

  return (
    <select
      className={`h-8 rounded-full border px-2 text-xs font-medium ${tone} disabled:opacity-60`}
      value={value}
      disabled={busy}
      aria-label="Access"
      title="Pick what this row gets for this app."
      onChange={(e) => onChange(e.target.value as CellState)}
    >
      <option value="default">{inherited}</option>
      <option value="allowed">Allowed</option>
      <option value="blocked">Blocked</option>
    </select>
  );
}
