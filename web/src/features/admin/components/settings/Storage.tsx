import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getStorageOverview, saveStorageSettings } from "@/api/storage.functions";
import { PageTitle } from "@/components/common/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes, formatCount, plural } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type {
  StorageBackend,
  StorageBackendUsage,
  StorageOverview,
  StorageSettings,
} from "@swiftslip/shared/schemas";
import { formatDate } from "@swiftslip/shared/time";

import { AdminClock } from "../AdminClock";
import { storageOverviewQueryOptions } from "../../queries";
import { BrandMark } from "./BrandMark";
import { StorageOrphanCleanupDialog } from "./StorageOrphanCleanupDialog";
import { UsageDonut } from "./UsageDonut";

/** The rule as it travels over the wire; `rule` is one of the three choices. */
type StorageRule = StorageSettings["rule"];
/** The editable shape on screen — the threshold stays a string while typing. */
type Draft = { rule: StorageRule; minFull: string };

/**
 * The switch point as the admin types it: percent FULL, the way the sentence
 * reads ("switch at 90% full"). The API stores the complement — `minFreePercent`,
 * 1–50 in `shared` — so 50–99 % full is the same range, 100 − each bound.
 */
const SWITCH_AT_MIN = 50;
const SWITCH_AT_MAX = 99;

/**
 * The hatched "Backblaze B2 takes over" fill. Built from `--logo-mark` rather
 * than a literal hex so dark mode's lifted orange comes along for free.
 */
const HATCH = {
  backgroundColor: "color-mix(in srgb, var(--logo-mark) 12%, transparent)",
  backgroundImage:
    "repeating-linear-gradient(45deg, color-mix(in srgb, var(--logo-mark) 65%, transparent) 0 3px, transparent 3px 7px)",
} as const;

const HINT = "text-sm text-muted-foreground";
const LINK =
  "text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground";

/** The three choices, as the segmented control shows them. */
const RULES: { value: StorageRule; label: string }[] = [
  { value: "supabase-first", label: "Supabase first" },
  { value: "b2-only", label: "Backblaze B2 only" },
  { value: "supabase-only", label: "Supabase only" },
];

/**
 * Admin Panel → Settings → Storage.
 *
 * Both storage backends on one page: how much each holds, what of it is real
 * documents versus orphans, and the one rule that decides where the NEXT file
 * goes. The rule only ever moves new uploads — nothing already stored is
 * migrated — so the page can be changed without a migration job behind it.
 *
 * Cleanup is the only destructive move, so it happens inside the orphan
 * review modal: the admin sees the actual file list — per backend, with the
 * reason, age and size — unticks what to keep, and only then deletes. The
 * API re-checks every key at delete time, so confirming is safe by
 * construction.
 */
export function Storage() {
  const queryClient = useQueryClient();
  const { data: overview, isPending } = useQuery(storageOverviewQueryOptions());

  const [draft, setDraft] = useState<Draft | null>(null);
  /** Which orphan list the review modal is open on: one backend, or both. */
  const [cleaning, setCleaning] = useState<StorageBackend | "everywhere" | null>(null);
  const ruleRef = useRef<HTMLDivElement>(null);

  // Seed the editor once from the saved rule. Deliberately not re-seeded on
  // every refetch: a background save's refetch must not overwrite typing.
  useEffect(() => {
    if (!overview) return;
    setDraft(
      (current) =>
        current ?? {
          rule: overview.settings.rule,
          // The screen speaks "% full"; the rule travels as its complement.
          minFull: String(100 - overview.settings.minFreePercent),
        },
    );
  }, [overview]);

  const minFullNumber = Number(draft?.minFull ?? "");
  const minFullValid =
    Number.isInteger(minFullNumber) &&
    minFullNumber >= SWITCH_AT_MIN &&
    minFullNumber <= SWITCH_AT_MAX;

  const dirty =
    !!draft &&
    !!overview &&
    (draft.rule !== overview.settings.rule ||
      (minFullValid && minFullNumber !== 100 - overview.settings.minFreePercent) ||
      !minFullValid);

  const onError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Something went wrong.");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["storage-overview"] });

  /** Save the rule. Writes, logs the change server-side, then re-lists usage. */
  const saveMutation = useMutation({
    mutationFn: (input: StorageSettings) => saveStorageSettings({ data: input }),
    onSuccess: () => {
      toast.success("Storage rule saved.");
      invalidate();
    },
    onError,
  });

  /** "Refresh usage": ask the API to skip its cache and write the answer here. */
  const refreshMutation = useMutation({
    mutationFn: () => getStorageOverview({ refresh: true }),
    onSuccess: (fresh: StorageOverview) => {
      queryClient.setQueryData(["storage-overview"], fresh);
    },
    onError,
  });

  if (!overview || !draft) return <StorageSkeleton />;

  const { settings, nextBackend, totals, supabase, b2 } = overview;
  /** Where Supabase hands over to B2, in percent full; null while invalid. */
  const switchPercent = minFullValid ? minFullNumber : null;
  const b2DowngradeNeeded = draft.rule === "b2-only" && !b2.connected;

  /** The sentence in the "New uploads go to" column. */
  const nextNote =
    draft.rule === "supabase-only"
      ? "Every new file goes to Supabase."
      : draft.rule === "b2-only"
        ? b2.connected
          ? "Every new file goes to Backblaze B2."
          : "Backblaze B2 is not connected — uploads will fail until it is."
        : switchPercent !== null
          ? `Switch to Backblaze B2 at ${switchPercent}% full.`
          : "Enter a valid switch point first.";

  const jumpToRule = () => {
    ruleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => document.getElementById(`rule-${draft.rule}`)?.focus(), 350);
  };

  const saveDisabled = !dirty || !minFullValid || saveMutation.isPending;

  /**
   * The sentence under the choice pills — what actually happens next, in the
   * admin's words. Storage names carry the weight; a disconnected B2 says so
   * instead of quietly promising a switch that would fail.
   */
  const ruleSentence =
    draft.rule === "supabase-first" ? (
      <>
        New files go to <strong className="font-semibold text-foreground">Supabase</strong>.
        {switchPercent !== null ? (
          <>
            {" "}
            Once it is <strong className="font-semibold text-foreground">
              {switchPercent}%
            </strong>{" "}
            full, they go to <strong className="font-semibold text-foreground">Backblaze B2</strong>{" "}
            instead.
          </>
        ) : (
          <>
            {" "}
            Type the switch point above: once Supabase is that full, new files go to{" "}
            <strong className="font-semibold text-foreground">Backblaze B2</strong>.
          </>
        )}
        {!b2.connected ? (
          <span className="text-logo">
            {" "}
            Backblaze B2 is not connected — uploads will fail until it is.
          </span>
        ) : null}
      </>
    ) : draft.rule === "b2-only" ? (
      <>
        Every new file goes to{" "}
        <strong className="font-semibold text-foreground">Backblaze B2</strong>.
        {!b2.connected ? (
          <span className="text-logo">
            {" "}
            Backblaze B2 is not connected — uploads will fail until it is.
          </span>
        ) : null}
      </>
    ) : (
      <>
        Every new file goes to <strong className="font-semibold text-foreground">Supabase</strong>.
        Uploads fail when it is full.
      </>
    );
  const lastChanged =
    settings.updatedAt.startsWith("1970") || !settings.updatedAt
      ? "No rule saved yet — the default is in use."
      : `Last changed ${formatDate(new Date(settings.updatedAt))}${
          settings.updatedByName ? ` by ${settings.updatedByName}` : ""
        }.`;

  /**
   * The line beside Save. Unsaved work says so (the button's grey state alone
   * is easy to miss); otherwise it is simply when the rule last moved.
   */
  const footerNote = !minFullValid
    ? `Enter a whole number between ${SWITCH_AT_MIN} and ${SWITCH_AT_MAX}.`
    : dirty
      ? saveMutation.isPending
        ? "Saving…"
        : "Unsaved changes"
      : lastChanged;

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <PageTitle as="h2">Storage</PageTitle>
          <p className="mt-2 max-w-[42rem] text-sm leading-6 text-muted-foreground">
            Where uploaded files are kept. New files go to one storage at a time; choose which
            below. Files already stored stay where they are.
          </p>
        </div>
        <AdminClock />
      </header>

      <div className="mt-5 border-t-2 border-dashboard-rule" />

      {/* ── The numbers at a glance ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-border">
        <SummaryColumn
          label="Stored in total"
          value={formatBytes(totals.usedBytes)}
          note={`${plural(totals.files, "file")} across ${supabase.connected && b2.connected ? "2" : "1"} storage${totals.files === 1 ? "" : "s"}.`}
        >
          <button
            type="button"
            className={LINK}
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            {refreshMutation.isPending ? "Refreshing…" : "Refresh usage"}
          </button>
        </SummaryColumn>

        <SummaryColumn
          label="New uploads go to"
          value={nextBackend === "b2" ? "Backblaze B2" : "Supabase"}
          valueClassName={b2DowngradeNeeded ? "text-logo" : ""}
          note={nextNote}
        >
          <button type="button" className={LINK} onClick={jumpToRule}>
            Change rule
          </button>
        </SummaryColumn>

        <SummaryColumn
          label="Orphaned files"
          value={formatCount(totals.orphanFiles)}
          valueClassName={totals.orphanFiles > 0 ? "" : "text-muted-foreground"}
          note={
            totals.orphanFiles === 0
              ? "Every stored file is linked to a form."
              : `${formatBytes(totals.orphanBytes)} not linked to any form.`
          }
          noteDot={totals.orphanFiles > 0}
        >
          <button
            type="button"
            className={cn(LINK, totals.orphanFiles === 0 && "pointer-events-none opacity-50")}
            onClick={() => setCleaning("everywhere")}
            disabled={totals.orphanFiles === 0}
          >
            Clean up everywhere
          </button>
        </SummaryColumn>
      </div>

      {/* ── The two backends, side by side ────────────────────────────────── */}
      <div className="grid gap-6 pt-8 lg:grid-cols-2">
        <BackendCard
          usage={supabase}
          title="Supabase Storage"
          planNote="Free plan"
          onCleanup={() => setCleaning("supabase")}
        />
        <BackendCard
          usage={b2}
          title="Backblaze B2"
          planNote="Free tier"
          onCleanup={() => setCleaning("b2")}
        />
      </div>

      {/* ── Where new uploads go ──────────────────────────────────────────── */}
      <div
        ref={ruleRef}
        className="mt-10 grid gap-x-10 gap-y-8 border-t pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]"
      >
        <section aria-labelledby="storage-rule-title" className="min-w-0">
          <h3 id="storage-rule-title" className="text-lg font-semibold tracking-tight">
            Where new uploads go
          </h3>
          <p className="mt-0.5 max-w-sm text-sm leading-6 text-muted-foreground">
            Each file is stored in one place only. This rule picks it. Nothing already uploaded is
            moved.
          </p>
        </section>

        <section aria-label="Storage rule choices" className="min-w-0">
          {/* The three choices as one segmented pill: active choice filled. */}
          <div
            role="radiogroup"
            aria-label="Storage rule"
            className="inline-flex flex-wrap gap-1 rounded-full border bg-muted/60 p-1"
          >
            {RULES.map((rule) => {
              const selected = draft.rule === rule.value;
              const disabled = rule.value === "b2-only" && !b2.connected;
              return (
                <button
                  key={rule.value}
                  id={`rule-${rule.value}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => !disabled && setDraft({ ...draft, rule: rule.value })}
                  className={cn(
                    "cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  {rule.label}
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-sm leading-6 text-muted-foreground">{ruleSentence}</p>

          {/* ── The switch point, and the ruler it marks ─────────────────── */}
          {draft.rule === "supabase-first" ? (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
                <span className="text-muted-foreground">Switch at</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={SWITCH_AT_MIN}
                  max={SWITCH_AT_MAX}
                  aria-label="Switch to Backblaze B2 when Supabase is this full"
                  value={draft.minFull}
                  onChange={(e) => setDraft({ ...draft, minFull: e.target.value })}
                  className="h-7 w-16 px-1.5 text-center text-sm tabular-nums"
                />
                <span className="text-muted-foreground">% full</span>
              </div>

              {minFullValid ? null : (
                <p className="text-right text-xs font-medium text-destructive">
                  Enter a whole number between {SWITCH_AT_MIN} and {SWITCH_AT_MAX}.
                </p>
              )}

              <CapacityBar
                usedBytes={supabase.usedBytes}
                limitBytes={supabase.limitBytes}
                switchPercent={switchPercent}
              />
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p
              className={cn(
                HINT,
                "min-w-0",
                dirty && !saveMutation.isPending && "font-medium text-foreground",
              )}
            >
              {footerNote}
            </p>
            <Button
              size="sm"
              onClick={() =>
                saveMutation.mutate({ rule: draft.rule, minFreePercent: 100 - minFullNumber })
              }
              disabled={saveDisabled}
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save rule
            </Button>
          </div>
        </section>
      </div>

      {/* ── The review-before-delete window ───────────────────────────────── */}
      <StorageOrphanCleanupDialog
        open={cleaning !== null}
        scope={cleaning ?? "everywhere"}
        supabase={supabase}
        b2={b2}
        onOpenChange={(open) => !open && setCleaning(null)}
      />
    </section>
  );
}

/** One of the three divided summary columns: label, big value, note, action. */
function SummaryColumn({
  label,
  value,
  note,
  noteDot = false,
  valueClassName = "",
  children,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
  /** Orange dot before the note — the "there is something there" flag. */
  noteDot?: boolean;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      {/*
        The value can be a word ("Supabase"), not just a number, so it steps
        down rather than spilling into the next column: at sm the columns are
        only ~145 px of text, which 36 px bold type outgrows. `break-words` is
        the backstop for a value longer than even the smallest step.
      */}
      <p
        className={cn(
          "mt-1 text-3xl font-bold tracking-tight break-words tabular-nums sm:text-2xl md:text-3xl lg:text-4xl",
          valueClassName,
        )}
      >
        {value}
      </p>
      <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
        {noteDot ? (
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-logo" aria-hidden="true" />
        ) : null}
        <span>{note}</span>
      </p>
      {children ? <div className="mt-3 space-y-2">{children}</div> : null}
    </div>
  );
}

/** One backend's card: name, connection, the split donut, and its cleanup. */
function BackendCard({
  usage,
  title,
  planNote,
  onCleanup,
}: {
  usage: StorageBackendUsage;
  title: string;
  planNote: string;
  onCleanup: () => void;
}) {
  const segments = [
    { key: "approval", bytes: usage.approvalBytes, className: "bg-dashboard-accent" },
    { key: "other", bytes: usage.otherBytes, className: "bg-dashboard-current" },
    { key: "orphan", bytes: usage.orphanBytes, className: "bg-logo" },
    { key: "free", bytes: usage.freeBytes, className: "bg-muted" },
  ];

  return (
    <section aria-label={title} className="flex flex-col rounded-xl border bg-card p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
          <BrandMark backend={usage.backend} />
          <span className="truncate">{title}</span>
        </p>
        <p className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              usage.connected ? "bg-dashboard-accent" : "bg-muted-foreground/50",
            )}
            aria-hidden="true"
          />
          {usage.connected ? "Connected" : "Not connected"}
        </p>
      </header>

      <p className="mt-2 text-xs text-muted-foreground">
        Bucket {usage.bucket} · {planNote}, {formatBytes(usage.limitBytes)}
      </p>

      {/* Stacked on phones (the donut sits above the legend), side by side
          from sm up — the row overflows a 360px screen otherwise. */}
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
        <UsageDonut usage={usage} />
        <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn("size-2.5 shrink-0 rounded-sm", segment.className)}
                  aria-hidden="true"
                />
                <span className="truncate text-muted-foreground">
                  {
                    {
                      approval: "Approval slips",
                      other: "Other attachments",
                      orphan: "Orphaned files",
                      free: "Free",
                    }[segment.key]
                  }
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatBytes(segment.bytes)}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-4 border-t pt-3.5">
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>
            {formatBytes(usage.usedBytes)} of {formatBytes(usage.limitBytes)} used
          </span>
          <span>{plural(usage.files, "file")}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onCleanup}
            disabled={!usage.connected || usage.orphanFiles === 0}
          >
            Clean up orphans
          </Button>
          {usage.dashboardUrl ? (
            <a
              href={usage.dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(LINK, "inline-flex items-center gap-1")}
            >
              Open in {usage.backend === "b2" ? "Backblaze" : "Supabase"}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </footer>
    </section>
  );
}

/**
 * The ruler under the switch input: one track is the backend's whole limit —
 * green with what is stored now, hatched from the switch point on as the zone
 * where Backblaze B2 takes over, with the point itself marked and labelled in
 * bytes so "90% full" reads as "900 MB of 1 GB".
 */
function CapacityBar({
  usedBytes,
  limitBytes,
  switchPercent,
}: {
  usedBytes: number;
  limitBytes: number;
  /** The hand-over point in percent full; null while the typed value is invalid. */
  switchPercent: number | null;
}) {
  const limit = Math.max(0, limitBytes);
  const used = Math.max(0, usedBytes);
  const usedShare = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const switchAt = switchPercent === null ? null : Math.min(100, Math.max(0, switchPercent));
  const switchBytes = switchAt === null || limit === 0 ? null : (limit * switchAt) / 100;

  return (
    <div className="space-y-2">
      <div className="relative h-3.5 rounded-full border border-border bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-dashboard-accent"
          style={{ width: `${usedShare}%` }}
        />
        {switchAt === null ? null : (
          <>
            {/* From the switch point on, the space belongs to B2. */}
            <div
              className="absolute inset-y-0 right-0 rounded-r-full"
              style={{ left: `${switchAt}%`, ...HATCH }}
            />
            {/* The switch point itself. */}
            <div
              className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
              style={{ left: `${switchAt}%` }}
            />
          </>
        )}
      </div>

      {/* 0 · the switch point · the limit, each sitting under its own mark. */}
      <div className="relative h-4 text-xs text-muted-foreground">
        <span className="absolute top-0 left-0">0</span>
        {switchAt === null || switchBytes === null ? null : (
          <span
            className={cn(
              "absolute top-0 whitespace-nowrap",
              // Near the end the centred label would collide with the limit.
              switchAt >= 88 ? "pr-1.5" : "-translate-x-1/2",
            )}
            style={switchAt >= 88 ? { right: `${100 - switchAt}%` } : { left: `${switchAt}%` }}
          >
            {formatBytes(switchBytes)}
          </span>
        )}
        <span className="absolute top-0 right-0">{formatBytes(limit)}</span>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-dashboard-accent" aria-hidden="true" />
          Used now, {Math.round(usedShare)}% ({formatBytes(used)})
        </li>
        {switchAt === null ? null : (
          <li className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-[3px] border border-border"
              style={HATCH}
              aria-hidden="true"
            />
            Backblaze B2 takes over
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * First paint, before the overview arrives: the same page in grey, so it
 * never flashes an empty shell or shifts when the numbers land.
 */
function StorageSkeleton() {
  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading storage usage"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="h-8 w-32 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
        </div>
        <div className="shrink-0 space-y-2">
          <div className="ml-auto h-7 w-24 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>

      <div className="mt-5 border-t-2 border-dashboard-rule" />

      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-border">
        {[0, 1, 2].map((column) => (
          <div key={column} className="py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
            <div className="h-4 w-28 max-w-full animate-pulse rounded bg-muted" />
            <div className="mt-2 h-9 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-4 w-44 max-w-full animate-pulse rounded bg-muted" />
            <div className="mt-3 h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 pt-8 lg:grid-cols-2">
        {[0, 1].map((card) => (
          <div key={card} className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="h-6 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-muted" />
            <div className="mt-4 flex items-center gap-5">
              <div className="size-[108px] shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="min-w-0 flex-1 space-y-2.5">
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="h-4 w-full max-w-[14rem] animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3.5">
              <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-x-10 gap-y-8 border-t pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div>
          <div className="h-5 w-56 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-3">
          <div className="h-9 w-full max-w-sm animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-full max-w-lg animate-pulse rounded bg-muted" />
          <div className="h-4 w-full max-w-xs animate-pulse rounded bg-muted" />
          <div className="flex items-center justify-end gap-2 pt-2">
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-7 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-3.5 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-64 animate-pulse rounded bg-muted" />
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </div>
    </section>
  );
}
