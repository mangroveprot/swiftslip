import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { plural } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  RETENTION_FORM_TYPES,
  RETENTION_MIN_DAYS,
  type CleanupRunResult,
  type RetentionFormType,
  type RetentionPreview,
  type RetentionRunForm,
  type RetentionSettings,
} from "@swiftslip/shared/schemas";
import { formatDate, relativeTime } from "@swiftslip/shared/time";

import { AdminClock } from "../AdminClock";
import {
  lastCleanupRunQueryOptions,
  retentionCountsQueryOptions,
  retentionSettingsQueryOptions,
} from "../../queries";
import { CleanupResultPanel } from "./CleanupResultPanel";
import { FORM_TYPE_ICONS, FORM_TYPE_LABELS } from "./form-types";
import { RetentionPreviewDialog } from "./RetentionPreviewDialog";

/** The editable shape on screen, `days` stays a string while typing. */
type Draft = { enabled: boolean; days: string; formTypes: RetentionFormType[] };

/** The usual keep periods, offered in the dropdown. A custom value is allowed. */
const DAY_PRESETS = [7, 30, 60, 90, 180] as const;

const MAX_DAYS = 3650;

const LINK =
  "rounded-sm text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

/** Identity of a rule, ignoring key order, used to detect unsaved changes. */
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

/** "1 day" / "3 days", the period is a free number now, so it can be one. */
const dayLabel = (days: number) => `${days} day${days === 1 ? "" : "s"}`;

/**
 * Admin Panel → Settings → Data retention.
 *
 * A settings sheet, one card: the rule, the forms it covers, the manual
 * cleanup and the last run, each as a labelled row (heading on the left, the
 * control on the right). Edits are explicit — Save settings — because a
 * preview must describe what the saved rule will delete, not a half-typed
 * draft. The cleanup itself always opens the review window listing every form
 * it would remove; nothing is deleted until the admin presses Delete there.
 */
export function DataRetention() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(retentionSettingsQueryOptions());
  const { data: lastRun, isPending: lastRunPending } = useQuery(lastCleanupRunQueryOptions());

  const [draft, setDraft] = useState<Draft | null>(null);
  /** True once Custom… is chosen; a saved non-preset value opens it too. */
  const [customDaysOpen, setCustomDaysOpen] = useState(false);
  /** The preview the admin has actually asked for, with the rule it was for. */
  const [previewed, setPreviewed] = useState<{ key: string; doc: RetentionPreview } | null>(null);
  /** The review window: the preview's list, where the run happens. */
  const [reviewOpen, setReviewOpen] = useState(false);
  /** The receipt of the last run this page made, cleared on the next preview. */
  const [lastResult, setLastResult] = useState<CleanupRunResult | null>(null);
  const daysRef = useRef<HTMLInputElement>(null);

  // Seed the editor once from the saved rule. Deliberately not re-seeded on
  // every refetch: a save's refetch must not overwrite typing.
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
  const customDays = customDaysOpen || !DAY_PRESETS.some((days) => days === daysNumber);
  const periodLabel = daysValid ? dayLabel(daysNumber) : "the keep period";

  const draftKey =
    draft && daysValid
      ? keyOf({ enabled: draft.enabled, days: daysNumber, formTypes: draft.formTypes })
      : "";
  const savedKey = settings ? keyOf(settings) : "";
  const dirty = !settings || !daysValid || draftKey !== savedKey;

  // Every type's pile past the keep period, so the list is populated before
  // anyone presses Preview. Same read-only endpoint, different intent.
  const countsQuery = useQuery(retentionCountsQueryOptions(daysValid ? daysNumber : 0));
  const counts = countsQuery.data ?? null;

  const onError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Something went wrong.");

  const saveMutation = useMutation({
    mutationFn: (input: RetentionSettings) => saveRetentionSettings({ data: input }),
    onSuccess: () => {
      toast.success("Retention settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["retention-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-counts"] });
    },
    onError,
  });
  const save = saveMutation.mutate;

  const previewMutation = useMutation({
    mutationFn: async (vars: { settings: RetentionSettings; key: string }) => ({
      key: vars.key,
      doc: await previewRetentionCleanup({
        data: { settings: vars.settings, includeItems: true },
      }),
    }),
    onSuccess: ({ key, doc }) => {
      setPreviewed({ key, doc });
      // The window is the point of the preview: it lists what would go, so the
      // admin can untick anything to keep before the run. An empty preview
      // needs no window, the inline result below already says nothing would go.
      if (doc.totalForms > 0) setReviewOpen(true);
    },
    onError,
  });

  const runMutation = useMutation({
    mutationFn: (forms: RetentionRunForm[]) => runRetentionCleanup(forms),
    onSuccess: (run: CleanupRunResult) => {
      setReviewOpen(false);
      setPreviewed(null);
      // The receipt outlives the toast: naming the forms is the point, and a
      // toast that disappears in four seconds cannot be read back.
      setLastResult(run);
      toast.success("Cleanup finished", {
        description: `${plural(sumCounts(run.formsDeleted), "form")} and ${plural(sumCounts(run.filesDeleted), "file")} deleted · older than ${dayLabel(run.days)}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["cleanup-run"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-counts"] });
    },
    onError: (error) => {
      setReviewOpen(false);
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

  /**
   * Preview, then review. The list the window shows is always freshly counted
   * from the saved rule, so the numbers the admin ticks against are the
   * numbers the delete will use.
   */
  const takePreview = () => {
    setLastResult(null);
    previewMutation.mutate({ settings: toInput(draft), key: draftKey });
  };

  // The status line under the button says what still has to happen before a
  // cleanup can run: a valid period, no unsaved edits, at least one type.
  const status = !daysValid
    ? { tone: "warn" as const, text: "Fix the keep period first" }
    : dirty
      ? { tone: "warn" as const, text: saveMutation.isPending ? "Saving…" : "Unsaved changes" }
      : draft.formTypes.length === 0
        ? { tone: "warn" as const, text: "No form types ticked" }
        : previewMatchesSaved
          ? { tone: "ok" as const, text: "Preview ready" }
          : { tone: "warn" as const, text: "Not previewed yet" };

  return (
    <section className="mx-auto w-full max-w-6xl rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div className="min-w-0 flex-1">
          <PageTitle as="h2">Data retention</PageTitle>
          <p className="mt-2 max-w-[40rem] text-[15px] leading-7 text-muted-foreground">
            Choose how long forms are kept. Nothing is ever deleted on its own: an admin opens the
            list here, then deletes from it.
          </p>
        </div>
        <AdminClock />
      </header>

      {/* ── The rule ─────────────────────────────────────────────────────── */}
      <SettingRow title="Retention rule" description="Decide what is kept and for how long.">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={draft.enabled}
            onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked === true })}
            className="mt-0.5"
            aria-label="Delete old forms when a cleanup runs"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Delete old forms when a cleanup runs</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              While off, nothing is deleted, whatever the settings below say.
            </span>
          </span>
        </label>

        <div className="mt-5">
          <p className="text-sm font-medium">Keep forms for</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select
              value={customDays ? "custom" : String(daysNumber)}
              onValueChange={(value) => {
                if (value === "custom") {
                  setCustomDaysOpen(true);
                  daysRef.current?.focus();
                  return;
                }
                setCustomDaysOpen(false);
                setDraft({ ...draft, days: value });
              }}
            >
              <SelectTrigger className="h-9 w-32" aria-label="Keep forms for">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_PRESETS.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {dayLabel(days)}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>

            {customDays ? (
              <span className="flex items-center gap-1.5">
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
                  className="h-9 w-20 px-2 text-center text-sm tabular-nums"
                />
                <span className="text-sm text-muted-foreground">
                  {daysValid && daysNumber === 1 ? "day" : "days"}
                </span>
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Forms older than {periodLabel} are eligible for cleanup, oldest first.
          </p>
          {daysValid ? null : (
            <p className="mt-2 text-xs font-medium text-destructive">
              Enter a whole number of days, at least {dayLabel(RETENTION_MIN_DAYS)}.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => save(toInput(draft))}
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </SettingRow>

      {/* ── The forms it covers ──────────────────────────────────────────── */}
      <SettingRow
        title="Form types"
        description="Tick the types to clean up. Counts are forms past the keep period."
      >
        <div className="flex items-center justify-end">
          <button type="button" className={cn(LINK, "text-xs")} onClick={toggleAll}>
            {allTicked ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b pb-2 text-xs text-muted-foreground">
          <span aria-hidden="true" />
          <span>Form type</span>
          <span>Past the keep period</span>
        </div>

        <ul aria-busy={countsQuery.isPending}>
          {RETENTION_FORM_TYPES.map((type) => {
            const entry = counts?.types.find((row) => row.type === type);
            const count = entry?.forms ?? 0;
            const ticked = draft.formTypes.includes(type);
            const counting = countsQuery.isPending;
            const Icon = FORM_TYPE_ICONS[type];
            return (
              <li key={type} className="border-b border-border/60 last:border-b-0">
                <label className="grid cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                  <Checkbox
                    checked={ticked}
                    onCheckedChange={(checked) => toggleType(type, checked === true)}
                    aria-label={FORM_TYPE_LABELS[type]}
                  />
                  <span className="flex min-w-0 items-center gap-2.5">
                    {/* The icon itself carries the brand orange; no tile behind it. */}
                    <Icon className="size-4 shrink-0 text-logo" aria-hidden="true" />
                    <span className="min-w-0 truncate text-sm" title={FORM_TYPE_LABELS[type]}>
                      {FORM_TYPE_LABELS[type]}
                    </span>
                  </span>
                  {counting ? (
                    <span
                      className="ml-auto block h-3 w-24 animate-pulse rounded bg-muted"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className={cn(
                        "text-right text-xs whitespace-nowrap tabular-nums",
                        ticked && count > 0
                          ? "font-medium text-dashboard-accent"
                          : "text-muted-foreground",
                      )}
                    >
                      {count === 0
                        ? `None past ${periodLabel}`
                        : ticked
                          ? `${count} to delete`
                          : `${count} kept`}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </SettingRow>

      {/* ── The cleanup ──────────────────────────────────────────────────── */}
      <SettingRow title="Clean up old forms" description="Review before anything is deleted.">
        <Button
          size="sm"
          onClick={takePreview}
          disabled={
            previewMutation.isPending || !daysValid || dirty || draft.formTypes.length === 0
          }
          className="bg-success text-success-foreground shadow-sm hover:bg-success-hover"
        >
          {previewMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
          Preview and clean up
        </Button>

        <p className="mt-3 flex items-center gap-2 text-sm">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              status.tone === "ok" ? "bg-dashboard-accent" : "bg-logo",
            )}
            aria-hidden="true"
          />
          <span className="text-foreground">{status.text}</span>
        </p>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The list shows every form a cleanup would delete, oldest first. Nothing is removed until
          you delete from it, and only what you leave ticked goes.
        </p>

        {previewed ? (
          <div className="mt-4 rounded-lg border border-dashboard-accent/25 bg-dashboard-soft/70 p-3.5 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-[220ms] motion-safe:ease-strong">
            {previewed.doc.totalForms === 0 ? (
              <p>
                Nothing to delete: no forms older than {dayLabel(previewed.doc.days)} in the chosen
                types.
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
                    .filter((entry) => entry.forms > 0 && previewed.doc.chosen.includes(entry.type))
                    .map((entry) => (
                      <li key={entry.type}>
                        {FORM_TYPE_LABELS[entry.type]}: {entry.forms} form
                        {entry.forms === 1 ? "" : "s"}, {entry.files} file
                        {entry.files === 1 ? "" : "s"}
                      </li>
                    ))}
                </ul>
              </>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Cut-off {formatDate(new Date(previewed.doc.cutoff))} · forms still waiting for
              approval are deleted too.
            </p>
          </div>
        ) : null}

        {/* The receipt of this run, below the list that ran it. */}
        {lastResult ? <CleanupResultPanel result={lastResult} /> : null}
      </SettingRow>

      {/* ── The run before this one ──────────────────────────────────────── */}
      <SettingRow title="Last cleanup run" description="The most recent cleanup.">
        {lastRunPending ? (
          <div className="space-y-2.5" aria-busy="true" aria-label="Loading the last run">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : lastRun ? (
          <>
            <p className="text-sm">
              <span className="font-medium" title={new Date(lastRun.ranAt).toLocaleString()}>
                {relativeTime(lastRun.ranAt)}
              </span>
              , by {lastRun.ranByName || lastRun.ranByNumber || "an administrator"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sumCounts(lastRun.formsDeleted)} form(s) and {sumCounts(lastRun.filesDeleted)}{" "}
              file(s) deleted. Kept {dayLabel(lastRun.days)}.{" "}
              <span
                className={lastRun.status === "completed" ? "" : "font-medium text-destructive"}
              >
                {lastRun.status.replace(/_/g, " ")}
              </span>
              .
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              This stays in the permanent run history. The activity log only keeps 30 days.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">No cleanup has run yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When one does, the date and the number of deleted forms will appear here.
            </p>
          </>
        )}
      </SettingRow>

      {previewed ? (
        <RetentionPreviewDialog
          open={reviewOpen}
          preview={previewed.doc}
          busy={runMutation.isPending}
          blockedReason={
            !draft.enabled
              ? "Turn the cleanup switch on first."
              : dirty
                ? "Waiting for your changes to save…"
                : null
          }
          onOpenChange={setReviewOpen}
          onDelete={(forms) => runMutation.mutate(forms)}
        />
      ) : null}
    </section>
  );
}

/**
 * One labelled row of the settings sheet: heading and explanation on the left,
 * the control on the right. The hairline between rows is on the section, so the
 * last row ends flush with the card.
 */
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-b py-7 last:border-b-0 last:pb-0 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * First paint, before the saved rule arrives: the same sheet in grey, so the
 * page never flashes an empty shell or shifts when the numbers land.
 */
function RetentionSkeleton() {
  return (
    <section
      className="mx-auto w-full max-w-6xl rounded-2xl border bg-card p-6 shadow-sm sm:p-10"
      aria-busy="true"
      aria-label="Loading retention settings"
    >
      <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div className="min-w-0 flex-1">
          <div className="h-8 w-44 animate-pulse rounded-md bg-muted" />
          <div className="mt-3 h-4 w-full max-w-sm animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-2/3 max-w-xs animate-pulse rounded bg-muted" />
        </div>
        <div className="shrink-0 space-y-2">
          <div className="ml-auto h-7 w-20 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className="grid gap-x-10 gap-y-4 border-b py-7 last:border-b-0 last:pb-0 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
        >
          <div>
            <div className="h-4 w-28 max-w-full animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-40 max-w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-56 max-w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 max-w-full animate-pulse rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-40 max-w-full animate-pulse rounded bg-muted" />
            </div>
            <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </section>
  );
}
