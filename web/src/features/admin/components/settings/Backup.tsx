import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import {
  disconnectGoogleDrive,
  rotateBackupLink,
  runBackupNow,
  saveBackupSettings,
  startGoogleDriveConnect,
} from "@/api/backup.functions";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorStateFromError } from "@/components/common/ErrorStateFromError";
import { PageTitle } from "@/components/common/PageTitle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiStreamUrl } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  BACKUP_KEEP_MAX,
  BACKUP_KEEP_MIN,
  BACKUP_TARGETS,
  type BackupRun,
} from "@swiftslip/shared/schemas";
import { formatDateTime } from "@swiftslip/shared/time";

import { AdminClock } from "../AdminClock";
import { backupOverviewQueryOptions } from "../../queries";

/**
 * Admin Panel → Settings → Backup.
 *
 * One subject: the databases. Each run saves one gzipped `pg_dump` PER
 * database — SwiftSlip and the RGC inventory — into a folder in the admin's own
 * Google Drive, started either here or by a link a cron service calls. The app
 * schedules nothing itself — a host that sleeps cannot wake itself, which is
 * why the page hands out a link instead of a "weekly" dropdown.
 *
 * Attachments are deliberately out of scope and the subtitle says so; 10 GB
 * through a free host is the whole month's bandwidth on one leg (BACKUP_GUIDE.md).
 *
 * Layout: a single narrow settings sheet, the way the owner's reference shows it
 * — header, then one section per subject with a hairline between them, each
 * answering "what is this, what is its state, what can I press".
 */
export function Backup() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState<"disconnect" | "rotate" | null>(null);

  const { data, error, isError, isFetching, refetch } = useQuery({
    ...backupOverviewQueryOptions(),
    // A run started elsewhere (the cron link) shows up as "running": follow it.
    refetchInterval: running ? 5_000 : 15_000,
  });

  /** The editor, seeded once from the saved row (never clobbered by a refetch). */
  const [draft, setDraft] = useState<{ enabled: boolean; keep: string } | null>(null);
  useEffect(() => {
    if (!data) return;
    setDraft(
      (current) =>
        current ?? { enabled: data.settings.enabled, keep: String(data.settings.keepCount) },
    );
  }, [data]);

  // Google sends the browser back to /admin?backup=…; turn that into a toast
  // once, then drop it so a reload does not repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("backup");
    if (!flag) return;

    if (flag === "connected") {
      const account = params.get("account");
      toast.success(account ? `Google Drive connected as ${account}.` : "Google Drive connected.");
    } else if (flag === "denied") {
      toast.error("Google Drive was not connected: access was declined.");
    } else {
      toast.error(params.get("reason") || "Google Drive could not be connected.");
    }

    for (const key of ["backup", "reason", "account", "section"]) params.delete(key);
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, []);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["backup-overview"] });
  const onError = (problem: unknown) =>
    toast.error(problem instanceof Error ? problem.message : "Something went wrong.");

  const saveMutation = useMutation({
    mutationFn: () =>
      saveBackupSettings({
        data: {
          enabled: draft?.enabled ?? false,
          keepCount: Number(draft?.keep ?? data?.settings.keepCount ?? 14),
        },
      }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["backup-overview"], fresh);
      setDraft({ enabled: fresh.settings.enabled, keep: String(fresh.settings.keepCount) });
      toast.success("Backup settings saved.");
    },
    onError,
  });

  const connectMutation = useMutation({
    mutationFn: () => startGoogleDriveConnect(),
    // A full navigation: Google's consent screen, then back to /admin.
    onSuccess: ({ url }) => window.location.assign(url),
    onError,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGoogleDrive(),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["backup-overview"], fresh);
      setDraft(null);
      setConfirm(null);
      toast.success("Google Drive disconnected. Scheduled backups are off.");
    },
    onError: (problem) => {
      setConfirm(null);
      onError(problem);
    },
  });

  const rotateMutation = useMutation({
    mutationFn: () => rotateBackupLink(),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["backup-overview"], fresh);
      setConfirm(null);
      toast.success("New link generated. The old one no longer works.");
    },
    onError: (problem) => {
      setConfirm(null);
      onError(problem);
    },
  });

  const runMutation = useMutation({
    mutationFn: () => runBackupNow(),
    onMutate: () => setRunning(true),
    onSuccess: (runs) => {
      const saved = runs.filter((run) => run.status === "succeeded" && run.fileName);
      const failedCount = runs.filter((run) => run.status === "failed").length;
      if (saved.length === 0) {
        toast.error("No database could be backed up. See Recent backups for the reason.");
      } else {
        toast.success(
          `Saved to Drive: ${saved
            .map((run) => `${run.fileName} (${formatDumpSize(run.sizeBytes ?? 0)})`)
            .join(", ")}.`,
        );
      }
      if (failedCount > 0 && saved.length > 0) {
        toast.error(
          `${failedCount} database${failedCount > 1 ? "s" : ""} could not be backed up. See Recent backups.`,
        );
      }
      invalidate();
    },
    onError,
    onSettled: () => {
      setRunning(false);
      invalidate();
    },
  });

  if (isError) {
    return (
      <section className="mx-auto w-full max-w-4xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <PageTitle as="h2">Backup</PageTitle>
        <ErrorStateFromError
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
          className="mt-6"
        />
      </section>
    );
  }

  if (!data || !draft) return <BackupSkeleton />;

  const { settings, drive, pgDump, cronToken, ready, migrationApplied, targetColumnReady } = data;
  const keepNumber = Number(draft.keep);
  const keepValid =
    Number.isInteger(keepNumber) && keepNumber >= BACKUP_KEEP_MIN && keepNumber <= BACKUP_KEEP_MAX;
  const dirty =
    draft.enabled !== settings.enabled || (keepValid && keepNumber !== settings.keepCount);

  const triggerUrl = cronToken
    ? new URL(apiStreamUrl(`/backup/cron/${cronToken}`), window.location.origin).toString()
    : null;

  const anyDatabase = data.databases.some((database) => database.configured);

  /** Why "Back up now" cannot run, in the order the Setup list fixes them. */
  const blockedBy = !data.oauthConfigured
    ? "Add the Google OAuth client first."
    : !drive.connected
      ? "Connect Google Drive first."
      : !anyDatabase
        ? "Add a database connection string on the server first."
        : !pgDump.available
          ? "pg_dump was not found on the server."
          : !targetColumnReady
            ? "Run migration 0044_backup_target.sql in Supabase first."
            : null;

  const setup: {
    label: string;
    hint: React.ReactNode;
    status: string;
    tone: string;
  }[] = [
    {
      label: "Google OAuth client",
      hint: (
        <>
          Set <code className="font-mono text-[0.95em]">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
          <code className="font-mono text-[0.95em]">GOOGLE_OAUTH_CLIENT_SECRET</code> on the server.
        </>
      ),
      status: data.oauthConfigured ? "Ready" : "Missing",
      tone: data.oauthConfigured ? TONE.ready : TONE.missing,
    },
    {
      label: "Google Drive account",
      hint: drive.connected
        ? (drive.accountEmail ?? "Connected.")
        : data.oauthConfigured
          ? "Not connected yet. Use Connect Google Drive below."
          : "Needs the OAuth client above before it can be connected.",
      status: drive.connected ? "Ready" : "Not connected",
      tone: drive.connected ? TONE.ready : TONE.idle,
    },
    {
      label: "pg_dump on this server",
      hint: pgDump.available ? (
        (pgDump.version ?? "Found.")
      ) : (
        <>Not found. The Docker image includes it; on Windows set PG_DUMP_PATH.</>
      ),
      status: pgDump.available ? "Ready" : "No pg_dump",
      tone: pgDump.available ? TONE.ready : TONE.warn,
    },
    ...data.databases.map((database) => ({
      label: `${database.label} database`,
      hint: (
        <>
          <code className="font-mono text-[0.95em]">{database.envKey}</code>
          {database.configured
            ? ", the address pg_dump connects to."
            : " is not set on this server."}
        </>
      ),
      status: database.configured ? "Ready" : "Missing",
      tone: database.configured ? TONE.ready : TONE.missing,
    })),
  ];
  const setupReady = setup.every((row) => row.status === "Ready");

  const lastSaved = settings.updatedAt.startsWith("1970")
    ? "Nothing saved yet. Scheduled runs are off."
    : `Last changed ${formatDateTime(new Date(settings.updatedAt))}.`;

  const saveNote = !keepValid
    ? ""
    : dirty
      ? saveMutation.isPending
        ? "Saving…"
        : "Unsaved changes"
      : lastSaved;

  return (
    <section className="mx-auto w-full max-w-4xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="min-w-0 flex-1">
          <PageTitle as="h2">Backup</PageTitle>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Saves a copy of every database you have configured to your Google Drive. Attachments are
            not included, because they are too large to copy through this server. The Storage page
            looks after those.
          </p>
        </div>
        <AdminClock />
      </header>

      {!migrationApplied ? (
        <div className="mt-6 flex gap-3 rounded-lg border border-logo/30 bg-muted/40 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-logo" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium">The backup tables are missing</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Run{" "}
              <code className="font-mono text-[0.9em]">api/drizzle/migrations/0043_backup.sql</code>{" "}
              in the Supabase SQL editor, then reload this page. Nothing is lost while it waits.
            </p>
          </div>
        </div>
      ) : !targetColumnReady ? (
        <div className="mt-6 flex gap-3 rounded-lg border border-logo/30 bg-muted/40 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-logo" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium">One more migration is needed</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Run{" "}
              <code className="font-mono text-[0.9em]">
                api/drizzle/migrations/0044_backup_target.sql
              </code>{" "}
              in the Supabase SQL editor, then reload this page. It only adds a column, so it is
              safe to run.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Setup ─────────────────────────────────────────────────────── */}
          <Block
            title="Setup"
            description={
              setupReady
                ? "Everything is ready, so “Back up now” saves one dump per database."
                : "A backup needs all of these. “Back up now” tells you which one is still missing."
            }
          >
            <ul className="space-y-4">
              {setup.map((row) => (
                <li key={row.label} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{row.hint}</p>
                  </div>
                  <Status tone={row.tone} label={row.status} />
                </li>
              ))}
            </ul>
          </Block>

          {/* ── Google Drive ──────────────────────────────────────────────── */}
          <Block
            title="Google Drive"
            description={
              <>
                Backups go into a folder named “{settings.folderName}” in the account you connect.
                SwiftSlip can only see files it created there, never the rest of your Drive.
              </>
            }
          >
            {drive.connected ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {drive.accountEmail ?? "Google Drive connected"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Connected {formatDateTime(new Date(drive.connectedAt ?? Date.now()))}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirm("disconnect")}
                  disabled={disconnectMutation.isPending}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => connectMutation.mutate()}
                  disabled={!data.oauthConfigured || connectMutation.isPending}
                  title={data.oauthConfigured ? undefined : "Add the Google OAuth client first."}
                >
                  {connectMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Connect Google Drive
                </Button>
                {!data.oauthConfigured ? (
                  <span className="text-xs text-muted-foreground">
                    Add the Google OAuth client first.
                  </span>
                ) : null}
              </div>
            )}

            {!data.oauthConfigured ? (
              <>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  To create the client, open Google Cloud, go to APIs &amp; Services, then
                  Credentials, and create an OAuth client of type{" "}
                  <span className="font-medium text-foreground">Web application</span>. Register
                  exactly this redirect URI:
                </p>
                <div className="mt-2 flex gap-2">
                  <Input
                    readOnly
                    value={data.googleRedirectUri}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="OAuth redirect URI"
                    className="h-8 bg-muted/50 font-mono text-[11px]"
                  />
                  <CopyButton value={data.googleRedirectUri} />
                </div>
              </>
            ) : null}
          </Block>

          {/* ── Automatic backups ─────────────────────────────────────────── */}
          <Block
            title="Automatic backups"
            description="Nothing runs on its own until you paste the trigger link below into a cron service."
          >
            <label className="flex items-start gap-2.5">
              <Checkbox
                checked={draft.enabled}
                onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked === true })}
                className="mt-0.5"
                aria-label="Allow the trigger link to start a backup"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  Allow the trigger link to start a backup
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  When this is off, the link replies “turned off” and does nothing. “Back up now”
                  always works.
                </span>
              </span>
            </label>

            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="backup-keep" className="text-sm font-medium">
                  Keep the latest
                </label>
                <Input
                  id="backup-keep"
                  name="backup-keep"
                  type="number"
                  inputMode="numeric"
                  min={BACKUP_KEEP_MIN}
                  max={BACKUP_KEEP_MAX}
                  value={draft.keep}
                  onChange={(event) => setDraft({ ...draft, keep: event.target.value })}
                  className="h-8 w-14 px-1 text-center text-sm tabular-nums"
                />
                <span className="text-sm font-medium">of each database</span>
              </div>
              <p
                className={cn(
                  "mt-1 text-xs",
                  keepValid ? "text-muted-foreground" : "font-medium text-destructive",
                )}
              >
                {keepValid
                  ? "After each successful backup, older copies of each database are deleted."
                  : `Enter a whole number between ${BACKUP_KEEP_MIN} and ${BACKUP_KEEP_MAX}.`}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={!dirty || !keepValid || saveMutation.isPending}
              >
                Save settings
              </Button>
              <span
                className={cn(
                  "text-xs text-muted-foreground",
                  dirty && keepValid && !saveMutation.isPending && "font-medium text-foreground",
                )}
              >
                {saveNote}
              </span>
            </div>
          </Block>

          {/* ── Trigger link ──────────────────────────────────────────────── */}
          <Block
            title="Trigger link"
            description="Anyone with this link can start a backup, and nothing else. It replies at once and the backup carries on in the background."
          >
            <div className="flex gap-2">
              <Input
                readOnly
                value={triggerUrl ?? "Generating…"}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Backup trigger link"
                className="h-8 bg-muted/50 font-mono text-[11px]"
              />
              <CopyButton value={triggerUrl} />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Paste it into cron-job.org, a GitHub Actions schedule or Render Cron Jobs. Weekly is
              enough for a database this size. All of them send a plain GET.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm("rotate")}
                disabled={rotateMutation.isPending || !cronToken}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                New link
              </Button>
              <span className="text-xs text-muted-foreground">The old link stops working.</span>
            </div>
          </Block>

          {/* ── Recent backups ────────────────────────────────────────────── */}
          <section className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold tracking-tight">Recent backups</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  The last {settings.keepCount} of each database are kept.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Button
                  size="sm"
                  className="bg-save text-save-foreground hover:bg-save-hover"
                  onClick={() => runMutation.mutate()}
                  disabled={!ready || running || runMutation.isPending}
                  title={blockedBy ?? undefined}
                >
                  {running || runMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="size-4" aria-hidden="true" />
                  )}
                  {running || runMutation.isPending ? "Backing up…" : "Back up now"}
                </Button>
                {blockedBy ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{blockedBy}</p>
                ) : null}
              </div>
            </div>

            {data.runs.length === 0 ? (
              <p className="mt-4 max-w-[40ch] text-sm leading-6 text-muted-foreground">
                No backups yet. The first one appears here after you connect Google Drive and press
                Back up now.
              </p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="w-[30%] pb-2 text-left font-normal">Date</th>
                    <th className="w-[20%] pb-2 text-left font-normal">Database</th>
                    <th className="w-[12%] pb-2 text-left font-normal">Size</th>
                    <th className="w-[20%] pb-2 text-left font-normal">Started by</th>
                    <th className="w-[18%] pb-2 text-right font-normal">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirm === "disconnect"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Disconnect Google Drive?"
        description="Backups stop until you connect again. Dumps already in the folder stay there."
        confirmLabel="Disconnect"
        busy={disconnectMutation.isPending}
        onConfirm={() => disconnectMutation.mutate()}
      />
      <ConfirmDialog
        open={confirm === "rotate"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Generate a new trigger link?"
        description="The current link stops working at once. Anything using it — a cron service, a bookmark — has to be updated."
        confirmLabel="Generate"
        destructive={false}
        busy={rotateMutation.isPending}
        onConfirm={() => rotateMutation.mutate()}
      />
    </section>
  );
}

/** Status dot colours, by meaning rather than by hue name. */
const TONE = {
  ready: "bg-dashboard-accent",
  missing: "bg-destructive",
  idle: "bg-muted-foreground/40",
  warn: "bg-logo",
} as const;

/** The small "● Ready" on the right of a Setup row. */
function Status({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-xs text-foreground/80">
      <span className={cn("size-1.5 rounded-full", tone)} aria-hidden="true" />
      {label}
    </span>
  );
}

/** One section of the sheet: title, one line of context, then the control. */
function Block({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b py-6">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Copy-to-clipboard next to a read-only field, with a short "Copied" state. */
function CopyButton({ value, label = "Copy" }: { value: string | null; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      disabled={!value}
      className="shrink-0"
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

const RUN_TONE: Record<BackupRun["status"], { dot: string; word: string }> = {
  succeeded: { dot: TONE.ready, word: "Done" },
  failed: { dot: TONE.missing, word: "Failed" },
  running: { dot: "bg-logo motion-safe:animate-pulse", word: "Running" },
};

/**
 * A dump's size with one decimal, the way the history reads best: "18.4 MB".
 *
 * Deliberately not the shared `formatBytes`, which rounds to whole MB — right
 * for a 10 GB storage bar, useless for telling one weekly dump from the next.
 */
function formatDumpSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The label for a run's database; rows from before 0044 are SwiftSlip dumps. */
function targetLabel(run: BackupRun): string {
  const target = BACKUP_TARGETS.find((candidate) => candidate.id === run.target);
  return target?.label ?? "SwiftSlip";
}

/** One line of the history: date, database, size, who started it, what happened. */
function RunRow({ run }: { run: BackupRun }) {
  const tone = RUN_TONE[run.status];
  return (
    <>
      <tr className="align-top">
        <td className="py-2.5 pr-3 text-[13px] tabular-nums">
          {formatDateTime(new Date(run.startedAt))}
        </td>
        <td className="py-2.5 pr-3 text-[13px]">{targetLabel(run)}</td>
        <td className="py-2.5 pr-3 text-[13px] text-muted-foreground tabular-nums">
          {run.sizeBytes === null ? "—" : formatDumpSize(run.sizeBytes)}
        </td>
        <td className="py-2.5 pr-3 text-[13px]">
          {run.trigger === "cron" ? "Trigger link" : "Back up now"}
        </td>
        <td className="py-2.5 text-right text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden="true" />
            {tone.word}
          </span>
        </td>
      </tr>
      {run.error ? (
        <tr>
          <td colSpan={5} className="pb-2.5 text-xs leading-5 text-destructive">
            {run.error}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** First paint: the same sheet in grey, so nothing jumps when the data lands. */
function BackupSkeleton() {
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
      aria-busy="true"
      aria-label="Loading backup settings"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="min-w-0 flex-1">
          <div className="h-8 w-28 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="mt-3 h-4 w-full max-w-sm animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-full max-w-xs animate-pulse rounded bg-muted" />
        </div>
        <div className="shrink-0 space-y-2">
          <div className="ml-auto h-5 w-20 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-3.5 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {[0, 1, 2, 3].map((block) => (
        <div key={block} className="border-b py-6">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3.5 w-full max-w-sm animate-pulse rounded bg-muted" />
          <div className="mt-4 h-8 w-full max-w-xs animate-pulse rounded-md bg-muted" />
        </div>
      ))}
    </section>
  );
}
