import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  previewRetentionCleanup,
  runRetentionCleanup,
  saveRetentionSettings,
} from "@/api/retention.functions";
import { PageTitle } from "@/components/common/PageTitle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  RETENTION_FORM_TYPES,
  RETENTION_MIN_DAYS,
  type CleanupRunSummary,
  type RetentionFormType,
  type RetentionPreview,
  type RetentionSettings,
} from "@swiftslip/shared/schemas";
import { formatDate, relativeTime } from "@swiftslip/shared/time";

import { AdminClock } from "../AdminClock";
import {
  lastCleanupRunQueryOptions,
  retentionCountsQueryOptions,
  retentionSettingsQueryOptions,
} from "../../queries";
import { FORM_TYPE_LABELS } from "./form-types";
import { RetentionConfirmDialog } from "./RetentionConfirmDialog";

/** The editable shape on screen — `days` stays a string while typing. */
type Draft = { enabled: boolean; days: string; formTypes: RetentionFormType[] };

/**
 * The day counts offered as one-click chips beside the free-text field. The
 * field is the real control — the period is the office's call, so these are
 * only the usual answers, and the smallest is a single week.
 */
const DAY_PRESETS: { days: number; label: string }[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
];

const MAX_DAYS = 3650;

const HINT = "text-sm text-muted-foreground";
const LINK =
  "text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground";

/** Identity of a rule, ignoring key order — used to detect unsaved changes. */
const keyOf = (rule: { enabled: boolean; days: number; formTypes: readonly RetentionFormType[] }) =>
  JSON.stringify({
    enabled: rule.enabled,
    days: rule.days,
    formTypes: [...rule.formTypes].sort(),
  });

const toInput = (draft: Draft): RetentionSettings => ({
  enabled: draft.enabled,
  days: Number(draft.days),
  formTypes: draft.formTypes,
});

const sumCounts = (map: Partial<Record<RetentionFormType, number>>) =>
  RETENTION_FORM_TYPES.reduce((sum, type) => sum + (map[type] ?? 0), 0);

/** "Official Business", "Official Business and Overtime", "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "1 day" / "3 days" — the period is a free number now, so it can be one. */
const dayLabel = (days: number) => `${days} day${days === 1 ? "" : "s"}`;

/**
 * Admin Panel → Settings → Data retention.
 *
 * Laid out like the dashboard: one panel, a rule under the title, three
 * divided summary columns, then the rule on the left and the form types on
 * the right, then preview/run beside the last run's history.
 *
 * Three moves, in the order the safety demands them: (1) set the rule — it
 * saves itself a moment after the last change, (2) preview what it would
 * delete, counts only, nothing touched, (3) run, behind a confirm dialog that
 * repeats those counts. Run stays locked until a preview has been taken for
 * exactly the saved rule, so the admin always approves the numbers they see.
 */
export function DataRetention() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(retentionSettingsQueryOptions());
  const { data: lastRun, isPending: lastRunPending } = useQuery(lastCleanupRunQueryOptions());

  const [draft, setDraft] = useState<Draft | null>(null);
  /** The preview the admin has actually asked for, with the rule it was for. */
  const [previewed, setPreviewed] = useState<{ key: string; doc: RetentionPreview } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const daysRef = useRef<HTMLInputElement>(null);

  // Seed the editor once from the saved rule. Deliberately not re-seeded on
  // every refetch: a background save's refetch must not overwrite typing.
  useEffect(() => {
    if (!settings) return;
    setDraft(
      (current) =>
        current ?? {
          enabled: settings.enabled,
          days: String(settings.days),
          formTypes: [...settings.formTypes],
        },
    );
  }, [settings]);

  const daysNumber = Number(draft?.days ?? "");
  const daysValid =
    Number.isInteger(daysNumber) && daysNumber >= RETENTION_MIN_DAYS && daysNumber <= MAX_DAYS;

  const draftKey =
    draft && daysValid
      ? keyOf({ enabled: draft.enabled, days: daysNumber, formTypes: draft.formTypes })
      : "";
  const savedKey = settings ? keyOf(settings) : "";
  const dirty = !settings || !daysValid || draftKey !== savedKey;

  // Every type's pile past the keep period, so the bars are populated before
  // anyone presses Preview. Same read-only endpoint, different intent.
  const countsQuery = useQuery(retentionCountsQueryOptions(daysValid ? daysNumber : 0));
  const counts = countsQuery.data ?? null;

  const onError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Something went wrong.");

  const saveMutation = useMutation({
    mutationFn: (input: RetentionSettings) => saveRetentionSettings({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["retention-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-counts"] });
    },
    onError,
  });
  const save = saveMutation.mutate;

  // Autosave: the design has no Save button, and a settings page that forgets
  // a toggle is worse than one that writes it. Only valid drafts are sent, so
  // a half-typed "3" never reaches the API; a rejected save leaves the draft
  // dirty, which keeps Run locked and says so in the third summary column.
  useEffect(() => {
    if (!draft || !daysValid || draftKey === savedKey) return;
    const input = toInput(draft);
    const timer = setTimeout(() => save(input), 700);
    return () => clearTimeout(timer);
  }, [draft, draftKey, savedKey, daysValid, save]);

  const previewMutation = useMutation({
    mutationFn: async (vars: { settings: RetentionSettings; key: string }) => ({
      key: vars.key,
      doc: await previewRetentionCleanup({ data: { settings: vars.settings } }),
    }),
    onSuccess: ({ key, doc }) => setPreviewed({ key, doc }),
    onError,
  });

  const runMutation = useMutation({
    mutationFn: runRetentionCleanup,
    onSuccess: (run: CleanupRunSummary) => {
      setConfirmOpen(false);
      setPreviewed(null);
      toast.success(
        `Cleanup finished: ${sumCounts(run.formsDeleted)} form(s) and ${sumCounts(run.filesDeleted)} file(s) deleted.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["cleanup-run"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-counts"] });
    },
    onError: (error) => {
      setConfirmOpen(false);
      onError(error);
    },
  });

  if (!settings || !draft) return <RetentionSkeleton />;

  const toggleType = (type: RetentionFormType, on: boolean) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            formTypes: on
              ? [...current.formTypes, type].sort()
              : current.formTypes.filter((t) => t !== type),
          }
        : current,
    );

  const allTicked = draft.formTypes.length === RETENTION_FORM_TYPES.length;
  const toggleAll = () =>
    setDraft({ ...draft, formTypes: allTicked ? [] : [...RETENTION_FORM_TYPES] });

  const previewMatchesSaved = previewed !== null && previewed.key === savedKey && !dirty;
  const nothingToDelete = previewed !== null && previewed.doc.totalForms === 0;
  const canRun = previewMatchesSaved && draft.enabled && !nothingToDelete;

  const runHint = !daysValid
    ? `Enter at least ${dayLabel(RETENTION_MIN_DAYS)} first.`
    : draft.formTypes.length === 0
      ? "Tick at least one form type first."
      : !draft.enabled
        ? "Turn the switch on first."
        : dirty
          ? "Waiting for your changes to save."
          : nothingToDelete
            ? "Nothing to delete — the preview found no finished forms."
            : !previewMatchesSaved
              ? "Run a preview before cleaning up."
              : "Deletes exactly what the preview showed.";

  // The third summary column is the "what still has to happen" line. With no
  // type ticked nothing can ever be deleted — not even previewed — so that
  // comes first: it is the reason the form lists show no deletion warnings.
  const status = dirty
    ? { tone: "warn" as const, text: saveMutation.isPending ? "Saving…" : "Unsaved changes" }
    : draft.formTypes.length === 0
      ? { tone: "warn" as const, text: "No form types ticked" }
      : previewMatchesSaved
        ? { tone: "ok" as const, text: "Preview ready" }
        : { tone: "warn" as const, text: "Not previewed yet" };

  const chosenNames = RETENTION_FORM_TYPES.filter((type) => draft.formTypes.includes(type)).map(
    (type) => FORM_TYPE_LABELS[type],
  );

  const maxCount = Math.max(1, ...(counts?.types ?? []).map((entry) => entry.forms));

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <PageTitle as="h2">Data retention</PageTitle>
          <p className="mt-2 max-w-[42rem] text-sm leading-6 text-muted-foreground">
            Choose how long forms are kept. Nothing is ever deleted on its own — only when an admin
            previews, then presses Run cleanup.
          </p>
        </div>
        <AdminClock />
      </header>

      <div className="mt-5 border-t-2 border-dashboard-rule" />

      {/* ── The rule at a glance ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-border">
        <SummaryColumn
          label="Keep forms for"
          value={
            <>
              {daysValid ? daysNumber : "—"}
              <span className="ml-2 font-medium text-muted-foreground">
                {daysValid && daysNumber === 1 ? "day" : "days"}
              </span>
            </>
          }
          note="Older forms are eligible for cleanup."
        >
          <button type="button" className={LINK} onClick={() => daysRef.current?.focus()}>
            Change period
          </button>
        </SummaryColumn>

        <SummaryColumn
          label="Form types covered"
          value={
            <>
              {draft.formTypes.length}
              <span className="ml-2 font-medium text-muted-foreground">
                of {RETENTION_FORM_TYPES.length}
              </span>
            </>
          }
          note="Only the ticked types are cleaned up."
        >
          <button type="button" className={LINK} onClick={toggleAll}>
            {allTicked ? "Clear all types" : "Select all types"}
          </button>
        </SummaryColumn>

        <SummaryColumn
          label="Cleanup"
          value={draft.enabled ? "On" : "Off"}
          valueClassName={draft.enabled ? "" : "text-muted-foreground"}
          note={
            draft.enabled ? "Only when you press Run cleanup." : "While off, nothing is deleted."
          }
        >
          <p className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                status.tone === "ok" ? "bg-dashboard-accent" : "bg-logo",
              )}
              aria-hidden="true"
            />
            <span className={status.tone === "ok" ? "text-foreground" : "text-muted-foreground"}>
              {status.text}
            </span>
          </p>
        </SummaryColumn>
      </div>

      {/* ── The rule, and what each type holds ───────────────────────────── */}
      <div className="grid gap-x-10 gap-y-10 pt-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section aria-labelledby="retention-rule-title" className="min-w-0">
          <h3 id="retention-rule-title" className="text-lg font-semibold tracking-tight">
            Retention rule
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Decide what is kept and for how long.
          </p>

          <div className="mt-5 flex items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Delete old forms when a cleanup runs</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                While off, nothing is ever deleted no matter the settings below. Nothing is deleted
                on a timer either — only when an admin runs a cleanup.
              </p>
            </div>
            <Switch
              id="retention-enabled"
              aria-label="Delete old forms when a cleanup runs"
              checked={draft.enabled}
              onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })}
              className="data-[state=checked]:bg-dashboard-accent"
            />
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium">Keep forms for</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {DAY_PRESETS.map((preset) => {
                const active = daysValid && daysNumber === preset.days;
                return (
                  <button
                    key={preset.days}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDraft({ ...draft, days: String(preset.days) })}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-foreground/25 bg-background text-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <span className="flex items-center gap-1.5 pl-1">
                <Input
                  ref={daysRef}
                  id="retention-days"
                  type="number"
                  inputMode="numeric"
                  min={RETENTION_MIN_DAYS}
                  max={MAX_DAYS}
                  aria-label="Keep forms for this many days"
                  value={draft.days}
                  onChange={(e) => setDraft({ ...draft, days: e.target.value })}
                  className="h-8 w-16 px-2 text-center text-xs tabular-nums"
                />
                <span className="text-xs text-muted-foreground">
                  {daysValid && daysNumber === 1 ? "day" : "days"}
                </span>
              </span>
            </div>
            {daysValid ? null : (
              <p className="mt-2 text-xs font-medium text-destructive">
                Enter a whole number of days — at least {dayLabel(RETENTION_MIN_DAYS)}.
              </p>
            )}
          </div>

          <p className="mt-5 border-l-2 border-dashboard-accent pl-3 text-sm leading-6">
            {chosenNames.length === 0 ? (
              <span className="text-muted-foreground">
                No form types are ticked — nothing will be deleted.
              </span>
            ) : (
              <>
                <strong className="font-semibold">{joinNames(chosenNames)}</strong> forms older than{" "}
                <strong className="font-semibold">
                  {dayLabel(daysValid ? daysNumber : RETENTION_MIN_DAYS)}
                </strong>{" "}
                will be deleted, oldest first.
              </>
            )}
          </p>
        </section>

        <section aria-labelledby="by-form-type-title" className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 id="by-form-type-title" className="text-lg font-semibold tracking-tight">
              By form type
            </h3>
            <button type="button" className={cn(LINK, "shrink-0")} onClick={toggleAll}>
              {allTicked ? "Clear all" : "Select all"}
            </button>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Tick the types to clean up. Counts are forms past the keep period.
          </p>

          <ul className="mt-4" aria-busy={countsQuery.isPending}>
            {RETENTION_FORM_TYPES.map((type) => {
              const entry = counts?.types.find((row) => row.type === type);
              const count = entry?.forms ?? 0;
              const ticked = draft.formTypes.includes(type);
              const counting = countsQuery.isPending;
              return (
                <li key={type} className="py-2">
                  <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_3.5rem_2rem_3.75rem] items-center gap-x-3">
                    <Checkbox
                      checked={ticked}
                      onCheckedChange={(checked) => toggleType(type, checked === true)}
                      className="data-[state=checked]:border-dashboard-accent data-[state=checked]:bg-dashboard-accent data-[state=checked]:text-white"
                    />
                    <span className="min-w-0 truncate text-sm">{FORM_TYPE_LABELS[type]}</span>
                    {counting ? (
                      // Counting walks every expired row; the row keeps its
                      // shape while it waits so nothing jumps when it lands.
                      <>
                        <BarSkeleton />
                        <CountSkeleton />
                        <StatusSkeleton />
                      </>
                    ) : (
                      <>
                        <TypeBar value={count} max={maxCount} muted={!ticked} />
                        <span className="text-right text-sm font-semibold tabular-nums">
                          {count}
                        </span>
                        <span
                          className={cn(
                            "text-right text-xs whitespace-nowrap tabular-nums",
                            ticked && count > 0 ? "text-dashboard-accent" : "text-muted-foreground",
                          )}
                        >
                          {count === 0 ? "None due" : ticked ? "to delete" : "kept"}
                        </span>
                      </>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>

          <p className="mt-2 text-xs text-muted-foreground">
            Bars show how many forms of each type are past the keep period. Greyed types are left
            alone.
          </p>
        </section>
      </div>

      {/* ── Preview, run, and the run before this one ────────────────────── */}
      <div className="mt-10 grid gap-x-10 gap-y-10 border-t pt-8 lg:grid-cols-2">
        <section aria-labelledby="preview-run-title" className="min-w-0">
          <h3 id="preview-run-title" className="text-lg font-semibold tracking-tight">
            Preview and run
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A preview only counts — it never deletes. The run then removes exactly what the preview
            showed, oldest first.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => previewMutation.mutate({ settings: toInput(draft), key: draftKey })}
              disabled={previewMutation.isPending || !daysValid || draft.formTypes.length === 0}
            >
              {previewMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
              Preview
            </Button>
            <p className={HINT}>
              {previewed
                ? `${previewed.doc.totalForms} form${previewed.doc.totalForms === 1 ? "" : "s"} and ${previewed.doc.totalFiles} file${previewed.doc.totalFiles === 1 ? "" : "s"} would go.`
                : "Run a preview to see what would be removed."}
            </p>
          </div>

          {previewed ? (
            <div className="mt-4 rounded-lg border border-dashboard-accent/25 bg-dashboard-soft/70 p-3.5 text-sm">
              {previewed.doc.totalForms === 0 ? (
                <p>
                  Nothing to delete — no finished forms older than {dayLabel(previewed.doc.days)} in
                  the chosen types.
                </p>
              ) : (
                <>
                  <p className="font-medium">
                    {previewed.doc.totalForms} form
                    {previewed.doc.totalForms === 1 ? "" : "s"} and {previewed.doc.totalFiles} file
                    {previewed.doc.totalFiles === 1 ? "" : "s"} would be permanently deleted.
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                    {previewed.doc.types
                      .filter(
                        (entry) => entry.forms > 0 && previewed.doc.chosen.includes(entry.type),
                      )
                      .map((entry) => (
                        <li key={entry.type}>
                          {FORM_TYPE_LABELS[entry.type]} — {entry.forms} form
                          {entry.forms === 1 ? "" : "s"}, {entry.files} file
                          {entry.files === 1 ? "" : "s"}
                        </li>
                      ))}
                  </ul>
                </>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground">
                Cut-off {formatDate(new Date(previewed.doc.cutoff))} · forms waiting for approval
                are excluded.
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex items-end justify-between gap-4 border-t pt-5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Run cleanup</p>
              <p className={cn(HINT, "mt-0.5")}>{runHint}</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!canRun || runMutation.isPending}
            >
              <Play className="size-4" aria-hidden="true" />
              Run cleanup
            </Button>
          </div>
        </section>

        <section aria-labelledby="last-run-title" className="min-w-0">
          <h3 id="last-run-title" className="text-lg font-semibold tracking-tight">
            Last cleanup run
          </h3>

          {lastRunPending ? (
            <div className="mt-4 space-y-2.5" aria-busy="true" aria-label="Loading the last run">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ) : lastRun ? (
            <>
              <p className="mt-4 flex items-start gap-2 text-sm">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-dashboard-accent"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-medium" title={new Date(lastRun.ranAt).toLocaleString()}>
                    {relativeTime(lastRun.ranAt)}
                  </span>{" "}
                  by {lastRun.ranByName || lastRun.ranByNumber || "an administrator"} —{" "}
                  {sumCounts(lastRun.formsDeleted)} form(s) and {sumCounts(lastRun.filesDeleted)}{" "}
                  file(s) deleted.
                </span>
              </p>
              <p className="mt-1.5 pl-3.5 text-sm text-muted-foreground">
                Kept {dayLabel(lastRun.days)} · status{" "}
                <span
                  className={lastRun.status === "completed" ? "" : "font-medium text-destructive"}
                >
                  {lastRun.status.replace(/_/g, " ")}
                </span>
                . Kept in the permanent run history — the activity log only keeps 30 days.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 flex items-start gap-2 text-sm">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                  aria-hidden="true"
                />
                <span className="font-medium">No cleanup has run yet.</span>
              </p>
              <p className="mt-1.5 pl-3.5 text-sm text-muted-foreground">
                When one does, the date and the number of deleted forms will appear here.
              </p>
            </>
          )}
        </section>
      </div>

      <RetentionConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        preview={
          previewed?.doc ?? {
            days: daysNumber || RETENTION_MIN_DAYS,
            cutoff: new Date().toISOString(),
            chosen: draft.formTypes,
            types: [],
            totalForms: 0,
            totalFiles: 0,
          }
        }
        busy={runMutation.isPending}
        onConfirm={() => runMutation.mutate()}
      />
    </section>
  );
}

/** One of the three divided summary columns: label, big value, note, action. */
function SummaryColumn({
  label,
  value,
  note,
  valueClassName = "",
  children,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-4xl font-bold tracking-tight tabular-nums", valueClassName)}>
        {value}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{note}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/** The thin meter beside each form type — green when it is in scope. */
function TypeBar({ value, max, muted }: { value: number; max: number; muted: boolean }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-secondary">
      <span
        className={cn(
          "block h-full rounded-full transition-[width] duration-500 ease-out",
          muted ? "bg-muted-foreground/35" : "bg-dashboard-accent",
        )}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** Placeholder meter while the counts are being worked out. */
function BarSkeleton() {
  return <span className="block h-2 animate-pulse rounded-full bg-muted" aria-hidden="true" />;
}

/** Placeholder number, right-aligned in the count column. */
function CountSkeleton() {
  return (
    <span className="ml-auto block h-3.5 w-5 animate-pulse rounded bg-muted" aria-hidden="true" />
  );
}

/** Placeholder for the "to delete / kept" label. */
function StatusSkeleton() {
  return (
    <span className="ml-auto block h-3 w-11 animate-pulse rounded bg-muted" aria-hidden="true" />
  );
}

/**
 * First paint, before the saved rule arrives: the same panel in grey, so the
 * page never flashes an empty shell or shifts when the numbers land.
 */
function RetentionSkeleton() {
  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading retention settings"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="h-8 w-56 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-muted" />
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
            <div className="mt-2 h-9 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-4 w-40 max-w-full animate-pulse rounded bg-muted" />
            <div className="mt-3 h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="grid gap-x-10 gap-y-10 pt-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-56 max-w-full animate-pulse rounded bg-muted" />
          <div className="mt-6 flex items-center justify-between gap-6">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 max-w-full animate-pulse rounded bg-muted" />
            </div>
            <div className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="mt-6 h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[0, 1, 2, 3, 4].map((chip) => (
              <div key={chip} className="h-7 w-16 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="grid grid-cols-[auto_minmax(0,1fr)_3.5rem_2rem_3.75rem] items-center gap-x-3 py-1"
              >
                <div className="size-4 animate-pulse rounded-sm bg-muted" />
                <div className="h-3.5 w-32 max-w-full animate-pulse rounded bg-muted" />
                <BarSkeleton />
                <CountSkeleton />
                <StatusSkeleton />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-x-10 gap-y-10 border-t pt-8 lg:grid-cols-2">
        <div>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-full max-w-sm animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-48 max-w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-6 flex items-end justify-between gap-4 border-t pt-5">
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-40 max-w-full animate-pulse rounded bg-muted" />
            </div>
            <div className="h-8 w-28 shrink-0 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
        <div>
          <div className="h-5 w-36 animate-pulse rounded bg-muted" />
          <div className="mt-4 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </section>
  );
}
