import { Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { formatCount, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  RetentionFormItem,
  RetentionPreview,
  RetentionRunForm,
} from "@swiftslip/shared/schemas";
import { formatDate } from "@swiftslip/shared/time";

import { FORM_TYPE_ICONS, FORM_TYPE_LABELS } from "./form-types";

/** Rows shown before the list collapses; the rest sit behind "Show all". */
const COLLAPSED_ROWS = 6;

const idOf = (item: RetentionFormItem) => `${item.type}:${item.id}`;

/** "Sep 12", the list's date column; the full date rides in the tooltip. */
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

/**
 * The tick itself: the success green rather than the navy primary, so a ticked
 * row reads as "this one goes" at a glance. Matches the storage cleanup
 * window, the other review-before-delete screen.
 */
const TICK =
  "border-success data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground";

/**
 * Settings → Data retention → Preview.
 *
 * The review-before-delete window, modelled on the orphaned-files cleanup:
 * it lists every form the rule would delete, oldest first, with the type, the
 * person, the date and how many files go with it. Unticking a form keeps it —
 * the run then deletes only what is still ticked. The API re-checks every id
 * against the keep period and the scaffold rule at delete time, so a stale
 * list can never take a form that has since become ineligible.
 *
 * The preview itself changes nothing: the single destructive button in the
 * footer, which states exactly how many forms and files it will remove, is
 * the only thing that deletes.
 */
export function RetentionPreviewDialog({
  open,
  preview,
  busy = false,
  blockedReason = null,
  onOpenChange,
  onDelete,
}: {
  open: boolean;
  preview: RetentionPreview;
  busy?: boolean;
  /**
   * Why the run cannot start yet (rule unsaved, cleanup off). Null means the
   * list is the saved rule's, so deleting is exactly what the admin sees.
   */
  blockedReason?: string | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (forms: RetentionRunForm[]) => void;
}) {
  const items = preview.items;

  /**
   * `null` means "everything ticked", which is how a fresh preview opens; a
   * Set is a deliberate choice. Deriving the default instead of seeding it in
   * an effect avoids one painted frame of "0 of 5 selected" with every row
   * dimmed before the ticks land.
   */
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Closing must not carry the last ticks into the next open.
  useEffect(() => {
    if (open) return;
    setSelected(null);
    setShowAll(false);
  }, [open]);

  const isTicked = (item: RetentionFormItem) => selected === null || selected.has(idOf(item));

  const selectedItems = useMemo(
    () => items.filter((item) => selected === null || selected.has(idOf(item))),
    [items, selected],
  );
  const selectedFiles = selectedItems.reduce((sum, item) => sum + item.files, 0);

  const shown = showAll ? items : items.slice(0, COLLAPSED_ROWS);
  const hidden = items.length - shown.length;

  const allTicked = items.length > 0 && items.every(isTicked);
  const someTicked = !allTicked && items.some(isTicked);

  const toggleAll = () => {
    setSelected(allTicked ? new Set() : null);
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current ?? items.map(idOf));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview cleanup</DialogTitle>
          <DialogDescription>
            These forms are older than {preview.days} day{preview.days === 1 ? "" : "s"}. Review the
            list, then delete what you don't need.
          </DialogDescription>
        </DialogHeader>

        {/* ── Preview banner ─────────────────────────────────────────────── */}
        <p className="flex items-start gap-2 rounded-lg border border-dashboard-accent/30 bg-dashboard-soft px-3.5 py-2.5 text-sm text-foreground">
          <Eye className="mt-0.5 size-4 shrink-0 text-dashboard-accent" aria-hidden="true" />
          <span>
            <span className="font-medium">Preview only.</span> Nothing has been deleted yet. Every
            form past the keep period is here, approved or still waiting for approval.
          </span>
        </p>

        {/* ── Selection bar ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allTicked ? true : someTicked ? "indeterminate" : false}
              onCheckedChange={toggleAll}
              disabled={items.length === 0 || busy}
              className={TICK}
              aria-label="Select every form in this list"
            />
            <span>
              {formatCount(selectedItems.length)} of {formatCount(items.length)} forms selected
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            Cut-off {formatDate(new Date(preview.cutoff))}
          </p>
        </div>

        {/* ── The list itself ────────────────────────────────────────────── */}
        {items.length === 0 ? (
          <p className="rounded-lg border border-border px-3.5 py-4 text-sm text-muted-foreground">
            Nothing to delete. No forms of the chosen types are past the keep period.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {/* Column heads, hidden on phones, where rows stack instead. */}
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 border-b border-border px-3 py-2.5 text-xs font-medium text-muted-foreground sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,9rem)_minmax(0,4.5rem)_3.75rem]">
              <span aria-hidden="true" />
              <span>Form</span>
              <span className="hidden sm:block">Type</span>
              <span className="hidden sm:block">Filed</span>
              <span className="hidden text-right sm:block">Files</span>
            </div>

            <ul className="max-h-[38vh] divide-y divide-border overflow-y-auto">
              {shown.map((item) => {
                const id = idOf(item);
                const ticked = isTicked(item);
                const Icon = FORM_TYPE_ICONS[item.type];
                return (
                  <li
                    key={id}
                    className={cn(
                      "grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 text-sm transition-colors sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,9rem)_minmax(0,4.5rem)_3.75rem] sm:py-3",
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
                      aria-label={`Select ${FORM_TYPE_LABELS[item.type]} for ${item.label}`}
                    />
                    <span className="flex min-w-0 items-start gap-2 sm:items-center sm:gap-2.5">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md border border-border sm:size-7",
                          ticked
                            ? "bg-dashboard-soft text-dashboard-accent"
                            : "bg-muted text-muted-foreground",
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium" title={item.label}>
                          {item.label}
                        </span>
                        {/* The type, date and files show under the name on
                            phones, so the two columns can stay hidden there. */}
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:hidden">
                          {FORM_TYPE_LABELS[item.type]}
                          {item.reference ? ` · ${item.reference}` : ""} · {shortDate(item.date)} ·{" "}
                          {item.files === 0 ? "no files" : plural(item.files, "file")}
                        </span>
                      </span>
                    </span>
                    <span className="hidden min-w-0 sm:block">
                      <span
                        className="inline-block max-w-full truncate rounded-md border border-border bg-muted px-2 py-0.5 align-bottom text-xs text-muted-foreground"
                        title={FORM_TYPE_LABELS[item.type]}
                      >
                        {FORM_TYPE_LABELS[item.type]}
                      </span>
                    </span>
                    <span
                      className="hidden text-xs text-muted-foreground sm:block"
                      title={item.date ? new Date(item.date).toLocaleString() : undefined}
                    >
                      {shortDate(item.date)}
                    </span>
                    <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                      {item.files === 0 ? "—" : plural(item.files, "file")}
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
                {plural(hidden, "more form")} in this list.{" "}
                <span className="font-medium underline underline-offset-2">Show all</span>
              </button>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-3 sm:justify-between">
          <div className="max-w-sm text-xs leading-5 text-muted-foreground">
            {blockedReason ? (
              <p className="font-medium text-foreground">{blockedReason}</p>
            ) : (
              <p>
                <span className="font-medium text-foreground">Deleting is permanent.</span> Deleted
                forms and their files can't be recovered. Untick any form you want to keep.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || blockedReason !== null || selectedItems.length === 0}
              onClick={() =>
                onDelete(selectedItems.map((item) => ({ type: item.type, id: item.id })))
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Delete {plural(selectedItems.length, "form")}
              {selectedFiles > 0 ? ` + ${plural(selectedFiles, "file")}` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
