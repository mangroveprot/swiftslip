import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { deleteStorageOrphans } from "@/api/storage.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes, formatCount, plural } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { OrphanedFile, StorageBackend, StorageBackendUsage } from "@swiftslip/shared/schemas";

import { storageOrphansPreviewQueryOptions } from "../../queries";
import { UsageDonut } from "./UsageDonut";

/** Rows shown before the list collapses; the rest sit behind "Show all". */
const COLLAPSED_ROWS = 5;

const idOf = (file: OrphanedFile) => `${file.backend}:${file.key}`;

/** "Sep 12" — the list's date column; the full date rides in the tooltip. */
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

/** The file's name — the last path segment of its storage key. */
const baseName = (key: string) => key.split("/").pop() || key;

/** "10 minutes" / "24 hours" — the grace window, in the unit that reads best. */
function graceLabel(seconds: number): string {
  if (seconds < 90) return plural(seconds, "second");
  if (seconds < 5400) return plural(Math.round(seconds / 60), "minute");
  return plural(Math.round(seconds / 3600), "hour");
}

const BACKEND_LABEL: Record<StorageBackend, string> = {
  supabase: "Supabase",
  b2: "Backblaze B2",
};

/**
 * The tick itself: the success green rather than the navy primary, so a ticked
 * row reads as "this one goes" at a glance. Theme-aware — dark mode's cream
 * fill arrives with its own ink.
 */
const TICK =
  "border-success data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground";

/**
 * Settings → Storage → "Clean up orphaned files".
 *
 * The review-before-delete window behind both cleanup buttons. It lists
 * every file no form points to — per backend, with the reason, age and size
 * — lets the admin untick anything to keep, and deletes only what is still
 * ticked. The API re-checks each key at delete time, so a stale list (a file
 * that gained a form since the preview, say) can never take a live file.
 *
 * Nothing here deletes on open: the query is read-only, and the destructive
 * action is the single button in the footer, which states exactly how many
 * files and bytes it will remove.
 */
export function StorageOrphanCleanupDialog({
  open,
  scope,
  supabase,
  b2,
  onOpenChange,
}: {
  open: boolean;
  /** Which backend's orphans to show: one of them, or both. */
  scope: StorageBackend | "everywhere";
  /** The page's live usage — feeds the "full → full" arrows on the cards. */
  supabase: StorageBackendUsage;
  b2: StorageBackendUsage;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const preview = useQuery(storageOrphansPreviewQueryOptions(scope, open));

  const files = useMemo(() => {
    const data = preview.data;
    if (!data) return [];
    return [...data.supabase, ...data.b2];
  }, [preview.data]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<StorageBackend | "all">("all");
  const [showAll, setShowAll] = useState(false);

  // Each fresh preview starts with everything ticked — the modal is "delete
  // what you don't need", so the default is all of it. Keyed on `open` and
  // `scope`, not just the data's identity: reopening on already-cached data
  // (same object, so the effect would not re-run) must re-tick from scratch.
  useEffect(() => {
    if (!open || !preview.data) return;
    setSelected(new Set(files.map(idOf)));
    setTab("all");
    setShowAll(false);
  }, [open, scope, preview.data, files]);

  // Closing and reopening must not carry the last tab or the stale ticks.
  useEffect(() => {
    if (open) return;
    setSelected(new Set());
    setTab("all");
    setShowAll(false);
  }, [open]);

  const selectedFiles = useMemo(
    () => files.filter((file) => selected.has(idOf(file))),
    [files, selected],
  );
  const selectedBytes = selectedFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

  const perBackend = useMemo(() => {
    const count = (backend: StorageBackend) => files.filter((f) => f.backend === backend).length;
    return { supabase: count("supabase"), b2: count("b2") };
  }, [files]);

  const visible = useMemo(
    () => (tab === "all" ? files : files.filter((f) => f.backend === tab)),
    [files, tab],
  );
  const shown = showAll ? visible : visible.slice(0, COLLAPSED_ROWS);
  const hidden = visible.length - shown.length;

  const allVisibleTicked = visible.length > 0 && visible.every((f) => selected.has(idOf(f)));
  const someVisibleTicked = !allVisibleTicked && visible.some((f) => selected.has(idOf(f)));

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      for (const file of visible) {
        if (allVisibleTicked) next.delete(idOf(file));
        else next.add(idOf(file));
      }
      return next;
    });
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteStorageOrphans({
        data: {
          files: selectedFiles.map((f) => ({ key: f.key, backend: f.backend })),
        },
      }),
    onSuccess: (results) => {
      const removed = results.reduce((sum, r) => sum + r.removed, 0);
      const bytes = results.reduce((sum, r) => sum + r.bytes, 0);
      const failed = results.reduce((sum, r) => sum + r.failed, 0);
      toast.success(
        `Removed ${plural(removed, "orphaned file")} (${formatBytes(bytes)}).` +
          (failed > 0 ? ` ${formatCount(failed)} could not be deleted — try again later.` : ""),
      );
      void queryClient.invalidateQueries({ queryKey: ["storage-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["storage-orphans-preview"] });
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Something went wrong."),
  });

  const busy = deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Clean up orphaned files</DialogTitle>
          <DialogDescription>
            These files are in storage, but no form points to them anymore. Review the list, then
            delete what you don't need.
          </DialogDescription>
        </DialogHeader>

        {/* ── Preview banner ─────────────────────────────────────────────── */}
        <p className="flex items-start gap-2 rounded-lg border border-dashboard-accent/30 bg-dashboard-soft px-3.5 py-2.5 text-sm text-foreground">
          <Eye className="mt-0.5 size-4 shrink-0 text-dashboard-accent" aria-hidden="true" />
          <span>
            <span className="font-medium">Preview only.</span> Nothing has been deleted yet. Files
            uploaded in the last {graceLabel(preview.data?.graceSeconds ?? 0) || "a few minutes"}{" "}
            are skipped.
          </span>
        </p>

        {/* ── One summary card per backend in scope ──────────────────────── */}
        <div
          className={cn("grid gap-3", scope === "everywhere" ? "sm:grid-cols-2" : "grid-cols-1")}
        >
          {(scope === "everywhere" || scope === "supabase") && (
            <SummaryCard
              usage={supabase}
              title="Supabase Storage"
              files={perBackend.supabase}
              selectedBytes={selectedFiles
                .filter((f) => f.backend === "supabase")
                .reduce((sum, f) => sum + f.sizeBytes, 0)}
            />
          )}
          {(scope === "everywhere" || scope === "b2") && (
            <SummaryCard
              usage={b2}
              title="Backblaze B2"
              files={perBackend.b2}
              selectedBytes={selectedFiles
                .filter((f) => f.backend === "b2")
                .reduce((sum, f) => sum + f.sizeBytes, 0)}
            />
          )}
        </div>

        {/* ── Selection bar + backend tabs ───────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allVisibleTicked ? true : someVisibleTicked ? "indeterminate" : false}
              onCheckedChange={toggleAll}
              disabled={visible.length === 0 || busy}
              className={TICK}
              aria-label="Select every orphaned file in this list"
            />
            <span>
              {formatCount(selectedFiles.length)} of {formatCount(files.length)} files selected
            </span>
          </label>

          {scope === "everywhere" && files.length > 0 ? (
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Storage">
              {[
                { key: "all" as const, label: `All ${formatCount(files.length)}` },
                {
                  key: "supabase" as const,
                  label: `Supabase ${formatCount(perBackend.supabase)}`,
                },
                { key: "b2" as const, label: `Backblaze B2 ${formatCount(perBackend.b2)}` },
              ]
                .filter((entry) => entry.key === "all" || perBackend[entry.key] > 0)
                .map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === entry.key}
                    onClick={() => {
                      setTab(entry.key);
                      setShowAll(false);
                    }}
                    className={cn(
                      "cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                      tab === entry.key
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
            </div>
          ) : null}
        </div>

        {/* ── The list itself ────────────────────────────────────────────── */}
        {preview.isPending ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Listing orphaned files…
          </div>
        ) : preview.isError ? (
          <p className="rounded-lg border border-border px-3.5 py-4 text-sm text-muted-foreground">
            The list could not be loaded. Close this window and try again.
          </p>
        ) : files.length === 0 ? (
          <p className="rounded-lg border border-border px-3.5 py-4 text-sm text-muted-foreground">
            Nothing to clean up — every stored file is linked to a form.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {/* Column heads — hidden on phones, where rows stack instead. */}
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-xs font-medium text-muted-foreground sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,6rem)_minmax(0,11.5rem)_3.25rem_3.5rem]">
              <span aria-hidden="true" />
              <span>File</span>
              <span className="hidden sm:block">Storage</span>
              <span className="hidden sm:block">Why it's orphaned</span>
              <span className="hidden sm:block">Uploaded</span>
              <span className="text-right">Size</span>
            </div>

            <ul className="max-h-[38vh] divide-y divide-border overflow-y-auto">
              {shown.map((file) => {
                const id = idOf(file);
                const ticked = selected.has(id);
                return (
                  <li
                    key={id}
                    className={cn(
                      "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-sm transition-colors sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,6rem)_minmax(0,11.5rem)_3.25rem_3.5rem] sm:py-3",
                      // Ticked rows stay white, unticked dim: what is left
                      // behind after the delete is visible without counting.
                      ticked ? "hover:bg-muted/40" : "bg-muted/30 hover:bg-muted/50",
                    )}
                  >
                    <Checkbox
                      checked={ticked}
                      onCheckedChange={() => toggle(id)}
                      disabled={busy}
                      className={TICK}
                      aria-label={`Select ${baseName(file.key)} for deletion`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium" title={file.key}>
                        {baseName(file.key)}
                      </span>
                      {/* The reason and storage show under the name on phones. */}
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground sm:hidden">
                        <span
                          className={cn(
                            "size-2 rounded-[3px]",
                            file.backend === "b2" ? "bg-logo" : "bg-foreground",
                          )}
                          aria-hidden="true"
                        />
                        {BACKEND_LABEL[file.backend]} · {file.reason} ·{" "}
                        {shortDate(file.lastModified)}
                      </span>
                    </span>
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-[3px]",
                          file.backend === "b2" ? "bg-logo" : "bg-foreground",
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{BACKEND_LABEL[file.backend]}</span>
                    </span>
                    <span className="hidden min-w-0 sm:block">
                      <span
                        className="inline-block max-w-full truncate rounded-md border border-border bg-muted px-2 py-0.5 align-bottom text-xs text-muted-foreground"
                        title={file.reason}
                      >
                        {file.reason}
                      </span>
                    </span>
                    <span
                      className="hidden text-xs text-muted-foreground sm:block"
                      title={
                        file.lastModified ? new Date(file.lastModified).toLocaleString() : undefined
                      }
                    >
                      {shortDate(file.lastModified)}
                    </span>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </li>
                );
              })}
            </ul>

            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full cursor-pointer border-t border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {plural(hidden, "more file")} in this list.{" "}
                <span className="font-medium underline underline-offset-2">Show all</span>
              </button>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-3 sm:justify-between">
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            <span className="font-medium text-foreground">Deleting is permanent.</span> Deleted
            files can't be recovered. Untick any file you want to keep.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || selectedFiles.length === 0}
              onClick={() => deleteMutation.mutate()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Delete {plural(selectedFiles.length, "file")} ({formatBytes(selectedBytes)})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One backend's card in the modal: its ring, and what deleting will free. */
function SummaryCard({
  usage,
  title,
  files,
  selectedBytes,
}: {
  usage: StorageBackendUsage;
  title: string;
  /** Orphaned files currently in the list for this backend. */
  files: number;
  /** Bytes ticked for deletion on this backend — drives the arrow below. */
  selectedBytes: number;
}) {
  const usedPercent =
    usage.limitBytes > 0 ? Math.min(100, (usage.usedBytes / usage.limitBytes) * 100) : 0;
  const afterPercent =
    usage.limitBytes > 0
      ? Math.max(0, ((usage.usedBytes - selectedBytes) / usage.limitBytes) * 100)
      : 0;

  return (
    <section className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <UsageDonut usage={usage} size={72} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {plural(files, "file")}, {formatBytes(selectedBytes)} to delete
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">
            {Math.round(usedPercent)}%
          </span>{" "}
          full →{" "}
          <span className="font-medium tabular-nums text-foreground">
            {Math.round(afterPercent)}%
          </span>{" "}
          full
        </p>
      </div>
    </section>
  );
}
