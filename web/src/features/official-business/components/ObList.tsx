import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, ExternalLink, MapPin, Plus, Search, Trash, X } from "lucide-react";
import { useMemo, useState } from "react";

import { deleteObForm } from "@/api/official-business.functions";
import { ApprovedStamp } from "@/components/common/ApprovedStamp";
import { DeletionNotice } from "@/components/common/DeletionNotice";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageTitle } from "@/components/common/PageTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { profileQueryOptions } from "@/features/profile/queries";
import { newDraftId } from "@/lib/draft";
import { toast } from "@/lib/toast";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { formatMonthDayYear } from "@swiftslip/shared/period";
import { relativeTime } from "@swiftslip/shared/time";
import {
  buildPlaceFacets,
  destinationKeys,
  normalizePlaceText,
  type PlaceFacet,
} from "../lib/places";
import { obFormsQueryOptions } from "../queries";

type ObRow = {
  id: string;
  employee_name: string;
  id_number: string;
  department: string;
  position: string;
  date_of_ob: string;
  /** Every To value on the itinerary, in row order. */
  destinations: string[];
  /** Approval slip ticked — badges the card as Approved. */
  attachment_approved: boolean;
  updated_at: string;
  /** Set when a retention cleanup would take this form within a week. */
  deletes_in_days?: number;
};

type DateRange = "any" | "7d" | "month";

const DATE_RANGES: ReadonlyArray<{ key: DateRange; label: string }> = [
  { key: "any", label: "Any time" },
  { key: "7d", label: "7 days" },
  { key: "month", label: "This month" },
];

/** Places visible before "Show all places" — the grouped list usually fits. */
const PLACE_LIMIT = 8;

/* The filter mock's quiet green, kept local to this page rather than changing
   the app-wide primary colour. */
const FILTER_ACTIVE = "bg-dashboard-soft text-dashboard-accent";
const FILTER_ACTIVE_ROW = "bg-dashboard-soft";
const FILTER_ACCENT = "accent-dashboard-accent";

export function ObList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: forms, isLoading, isError, error, refetch } = useQuery(obFormsQueryOptions());
  // Warm the profile while the list is on screen: a new form is built from it the
  // moment "New form" is pressed, so fetching it only then would put a skeleton in
  // front of the user for data we could already have had.
  useQuery(profileQueryOptions());
  const [pendingDelete, setPendingDelete] = useState<ObRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("any");
  const [groupSimilar, setGroupSimilar] = useState(true);
  const [selectedPlaces, setSelectedPlaces] = useState<Map<string, string>>(() => new Map());
  const [showAllPlaces, setShowAllPlaces] = useState(false);
  const now = useNow();

  const allForms = useMemo(() => forms ?? [], [forms]);
  const facets = useMemo(() => buildPlaceFacets(allForms, groupSimilar), [allForms, groupSimilar]);
  const formKeys = useMemo(
    () => new Map(allForms.map((form) => [form.id, destinationKeys(form.destinations)])),
    [allForms],
  );

  // A grouped facet owns several spellings; selecting it selects all of them.
  const selectedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const facet of facets) {
      if (!selectedPlaces.has(facet.key)) continue;
      for (const key of facet.keys) keys.add(key);
    }
    return keys;
  }, [facets, selectedPlaces]);

  const searchTerm = normalizePlaceText(search);
  const rangeStart = startForRange(range);
  const visible = useMemo(
    () =>
      allForms.filter((form) => {
        if (searchTerm) {
          const haystack = normalizePlaceText(
            [
              form.employee_name,
              form.id_number,
              form.department,
              form.position,
              ...form.destinations,
            ].join(" "),
          );
          if (!haystack.includes(searchTerm)) return false;
        }

        if (rangeStart) {
          const date = parseDateOnly(form.date_of_ob);
          if (!date || date < rangeStart) return false;
        }

        if (selectedKeys.size > 0) {
          const keys = formKeys.get(form.id) ?? [];
          if (!keys.some((key) => selectedKeys.has(key))) return false;
        }

        return true;
      }),
    [allForms, searchTerm, rangeStart, selectedKeys, formKeys],
  );

  const hasFilters = search.trim().length > 0 || range !== "any" || selectedPlaces.size > 0;

  function newForm() {
    navigate({ to: "/official-business/$id", params: { id: newDraftId() } });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await deleteObForm({ data: { id: pendingDelete.id } });
      await qc.invalidateQueries({ queryKey: obFormsQueryOptions().queryKey });
      toast.success(`Deleted "${pendingDelete.employee_name || "Untitled form"}"`);
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that form.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function togglePlace(facet: PlaceFacet) {
    setSelectedPlaces((current) => {
      const next = new Map(current);
      if (next.has(facet.key)) next.delete(facet.key);
      else next.set(facet.key, facet.label);
      return next;
    });
  }

  function removePlace(key: string) {
    setSelectedPlaces((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setRange("any");
    setSelectedPlaces(new Map());
  }

  function toggleGrouping(next: boolean) {
    setGroupSimilar(next);
    // The keys change between grouped and raw spellings; start the selection
    // clean rather than leaving a stale filter behind.
    setSelectedPlaces(new Map());
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[88rem] flex-col px-6 py-10 md:px-8 xl:px-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle>Official Business</PageTitle>
        <button type="button" className="btn btn-primary" onClick={newForm}>
          New form
        </button>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-14">
        <ObFilters
          search={search}
          onSearch={setSearch}
          range={range}
          onRange={setRange}
          groupSimilar={groupSimilar}
          onGroupSimilar={toggleGrouping}
          facets={facets}
          selected={selectedPlaces}
          onTogglePlace={togglePlace}
          hasFilters={hasFilters}
          onClearAll={clearFilters}
          loading={isLoading}
          showAllPlaces={showAllPlaces}
          onToggleShowAll={() => setShowAllPlaces((value) => !value)}
        />

        <div className="min-w-0 @container">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {forms ? formCountLabel(visible.length, allForms.length) : "Loading forms…"}
            </p>
            {[...selectedPlaces].map(([key, label]) => (
              <SelectedPlaceChip key={key} label={label} onRemove={() => removePlace(key)} />
            ))}
          </div>

          {isLoading ? (
            <ObListSkeleton />
          ) : isError ? (
            <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <p>{error instanceof Error ? error.message : "Could not load forms."}</p>
              <button
                type="button"
                className="mt-2 font-medium underline underline-offset-4"
                onClick={() => void refetch()}
              >
                Try again
              </button>
            </div>
          ) : allForms.length === 0 ? (
            <EmptyForms onCreate={newForm} />
          ) : visible.length === 0 ? (
            <NoMatches onClear={clearFilters} />
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-5 @2xl:grid-cols-2">
              {visible.map((form, index) => (
                <ObCard
                  key={form.id}
                  form={form}
                  index={index}
                  now={now}
                  onDelete={() => setPendingDelete(form)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !deleteBusy && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.employee_name || "Untitled form"}"?`}
        description="This permanently removes the form and its itinerary. This can't be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </main>
  );
}

function ObFilters({
  search,
  onSearch,
  range,
  onRange,
  groupSimilar,
  onGroupSimilar,
  facets,
  selected,
  onTogglePlace,
  hasFilters,
  onClearAll,
  loading,
  showAllPlaces,
  onToggleShowAll,
}: {
  search: string;
  onSearch: (value: string) => void;
  range: DateRange;
  onRange: (value: DateRange) => void;
  groupSimilar: boolean;
  onGroupSimilar: (value: boolean) => void;
  facets: PlaceFacet[];
  selected: Map<string, string>;
  onTogglePlace: (facet: PlaceFacet) => void;
  hasFilters: boolean;
  onClearAll: () => void;
  loading: boolean;
  showAllPlaces: boolean;
  onToggleShowAll: () => void;
}) {
  const visibleFacets = showAllPlaces ? facets : facets.slice(0, PLACE_LIMIT);

  return (
    <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
      <div className="flex items-center justify-between gap-3 border-b pb-2">
        <h2 className="text-base font-semibold">Filters</h2>
        {hasFilters ? (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="mt-5">
        <label htmlFor="ob-search" className="flex items-center gap-2 text-sm font-medium">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Search
        </label>
        <input
          id="ob-search"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Name, ID, or place"
          className="mt-1 w-full border-0 border-b bg-transparent px-0 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
        />
      </div>

      <div className="mt-7">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Date of OB
        </p>
        <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-lg border bg-card text-xs">
          {DATE_RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={range === item.key}
              onClick={() => onRange(item.key)}
              className={cn(
                "border-r px-3 py-2 font-medium last:border-r-0",
                range === item.key ? FILTER_ACTIVE : "text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-7 border-t pt-6">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Where to
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Read from the To field of every form and updated as forms are added.
        </p>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={groupSimilar}
            onChange={(event) => onGroupSimilar(event.target.checked)}
            className={cn("size-4 shrink-0", FILTER_ACCENT)}
          />
          Group similar spellings
        </label>

        {loading ? (
          <PlaceListSkeleton />
        ) : facets.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No destinations yet.</p>
        ) : (
          <div className="mt-4 space-y-1">
            {visibleFacets.map((facet) => {
              const active = selected.has(facet.key);
              return (
                <label
                  key={facet.key}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-1 py-2 text-sm transition-colors hover:bg-muted",
                    active && FILTER_ACTIVE_ROW,
                  )}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onTogglePlace(facet)}
                    className={cn("size-4 shrink-0", FILTER_ACCENT)}
                  />
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate" title={facet.label}>
                    {facet.label}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {facet.count}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {facets.length > PLACE_LIMIT ? (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="mt-2 text-xs font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            {showAllPlaces ? "Show fewer places" : `Show all ${facets.length} places`}
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function SelectedPlaceChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashboard-current bg-dashboard-soft px-2.5 py-1 text-xs font-medium text-dashboard-rule">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 transition-colors hover:bg-black/5"
        aria-label={`Remove ${label} filter`}
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
}

function ObCard({
  form: f,
  index,
  now,
  onDelete,
}: {
  form: ObRow;
  index: number;
  now: Date;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const destination = f.destinations.join(", ");

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate({ to: "/official-business/$id", params: { id: f.id } })}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate({ to: "/official-business/$id", params: { id: f.id } });
        }
      }}
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms`, animationFillMode: "both" }}
      className="relative flex min-h-44 cursor-pointer flex-col gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "break-words text-sm font-semibold leading-tight",
              !f.employee_name && "italic text-muted-foreground",
            )}
          >
            {f.employee_name || "Untitled form"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{f.id_number || "No ID number"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to="/official-business/$id"
            params={{ id: f.id }}
            onClick={(event) => event.stopPropagation()}
            className="btn btn-outline gap-1 px-2.5 py-1 text-xs"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Open
          </Link>
          <button
            type="button"
            className="btn gap-1 px-2.5 py-1 text-xs text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash className="size-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>

      <p className="text-xs text-foreground">
        {[f.department, f.position].filter(Boolean).join(" · ") || "No department / position"}
      </p>
      {f.date_of_ob ? (
        <p className="flex items-center gap-1.5 text-xs text-foreground">
          <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          Date of OB: {formatMonthDayYear(f.date_of_ob)}
        </p>
      ) : null}
      <p
        className={cn(
          "flex items-start gap-1.5 text-xs",
          destination ? "text-foreground" : "text-muted-foreground italic",
        )}
        title={destination || undefined}
      >
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="line-clamp-2">{destination ? `To ${destination}` : "No destination"}</span>
      </p>
      <DeletionNotice days={f.deletes_in_days} />
      {f.updated_at ? (
        <p
          className="mt-auto flex items-center gap-1.5 pr-12 text-[11px] text-muted-foreground"
          title={new Date(f.updated_at).toLocaleString()}
        >
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          Updated {relativeTime(f.updated_at, now)}
        </p>
      ) : null}

      {/* The same seal as every other form card, one size down so the denser
          two-column list keeps the card's text lines clear. */}
      {f.attachment_approved ? (
        <ApprovedStamp
          approved
          size="xs"
          className="pointer-events-none absolute right-2 bottom-2 z-10"
        />
      ) : null}
    </div>
  );
}

function EmptyForms({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-xl font-medium text-foreground">No forms yet</p>
        <p className="text-sm text-muted-foreground">
          File an Official Business form whenever you travel or transact on behalf of the company.
        </p>
      </div>
      <button type="button" className="btn btn-primary" onClick={onCreate}>
        <Plus className="size-4" aria-hidden="true" />
        Create your first form
      </button>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium">No forms match these filters</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Try a different search, date range, or destination.
      </p>
      <button type="button" className="btn btn-outline mt-4" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

function ObListSkeleton() {
  return (
    <div className="mt-5 grid grid-cols-1 gap-5 @2xl:grid-cols-2" aria-label="Loading forms">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="mt-4 h-3 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-2 h-3 w-2/3" />
          <Skeleton className="mt-4 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function PlaceListSkeleton() {
  return (
    <div className="mt-3 space-y-2" aria-label="Loading destinations">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-6 w-full" />
      ))}
    </div>
  );
}

function formCountLabel(visible: number, total: number) {
  return `${visible} of ${total} ${total === 1 ? "form" : "forms"}`;
}

/** `date_of_ob` is a date-only input value; parse it in local time. */
function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year && month && day) return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startForRange(range: DateRange) {
  if (range === "any") return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (range === "7d") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(1);
  return start;
}
