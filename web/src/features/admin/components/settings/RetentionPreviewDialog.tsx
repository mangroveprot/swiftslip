import { ChevronDown, Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ProfileAvatar } from "@/components/common/ProfileAvatar";
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
import { useUserPhotos } from "../../use-user-photos";

/** Rows shown before the faded peek; each "Show more" reveals another batch. */
const VISIBLE_INITIAL = 10;
const VISIBLE_STEP = 10;

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
 * Settings → Data retention → Preview and clean up.
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
  const [visible, setVisible] = useState(VISIBLE_INITIAL);

  // Closing must not carry the last ticks or the expanded list into the next open.
  useEffect(() => {
    if (open) return;
    setSelected(null);
    setVisible(VISIBLE_INITIAL);
  }, [open]);

  const isTicked = (item: RetentionFormItem) => selected === null || selected.has(idOf(item));

  const selectedItems = useMemo(
    () => items.filter((item) => selected === null || selected.has(idOf(item))),
    [items, selected],
  );
  const selectedFiles = selectedItems.reduce((sum, item) => sum + item.files, 0);

  // The faces on the rows in view, from the same batched cache the admin lists
  // use. A legacy row with no owner falls back to initials.
  const photos = useUserPhotos(items.map((item) => item.ownerId));

  const shown = items.slice(0, visible);
  // One faded, half-cut row says "the list continues" without printing it.
  const peek = visible < items.length ? (items[visible] ?? null) : null;
  const hasMore = peek !== null;

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

  /** One row; `peek` is the decorative, half-height glimpse of the next form. */
  const rowOf = (item: RetentionFormItem, peek = false) => {
    const id = idOf(item);
    const ticked = isTicked(item);
    const Icon = FORM_TYPE_ICONS[item.type];
    return (
      <li
        key={peek ? `peek-${id}` : id}
        aria-hidden={peek || undefined}
        style={
          peek
            ? {
                maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)",
              }
            : undefined
        }
        className={cn(
          "grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 py-3.5 text-sm transition-colors sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,10rem)_minmax(0,4.5rem)_3.75rem]",
          peek
            ? "pointer-events-none max-h-[26px] select-none overflow-hidden opacity-60 blur-[1.5px]"
            : "hover:bg-muted/40",
          // A form left behind reads muted; the orange icon, the checkbox and
          // the footer count still say what goes.
          !ticked && "text-muted-foreground",
        )}
      >
        <Checkbox
          checked={ticked}
          onCheckedChange={() => toggle(id)}
          disabled={busy || peek}
          tabIndex={peek ? -1 : undefined}
          className={TICK}
          aria-label={`Select ${FORM_TYPE_LABELS[item.type]} for ${item.label}`}
        />
        <span className="flex min-w-0 items-center gap-2">
          <ProfileAvatar
            photo={photos[item.ownerId ?? ""]}
            name={item.label}
            size={22}
            className="shrink-0"
          />
          <Icon className="size-4 shrink-0 text-logo" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate font-medium" title={item.label}>
              {item.label}
            </span>
            {/* The type, date and files show under the name on phones, so the
                two columns can stay hidden there. */}
            <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:hidden">
              {FORM_TYPE_LABELS[item.type]}
              {item.reference ? ` · ${item.reference}` : ""} · {shortDate(item.date)} ·{" "}
              {item.files === 0 ? "no files" : plural(item.files, "file")}
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 truncate sm:block" title={FORM_TYPE_LABELS[item.type]}>
          {FORM_TYPE_LABELS[item.type]}
        </span>
        <span
          className="hidden whitespace-nowrap sm:block"
          title={item.date ? new Date(item.date).toLocaleString() : undefined}
        >
          {shortDate(item.date)}
        </span>
        <span className="hidden text-right whitespace-nowrap tabular-nums sm:block">
          {item.files === 0 ? "—" : plural(item.files, "file")}
        </span>
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl tracking-tight">Clean up old forms</DialogTitle>
          <DialogDescription className="leading-6">
            These forms are older than {preview.days} day{preview.days === 1 ? "" : "s"}. Review the
            list, then delete what you don't need.
          </DialogDescription>
        </DialogHeader>

        {/* ── Preview note ───────────────────────────────────────────────── */}
        <p className="flex items-start gap-2.5 text-sm leading-6">
          <Eye className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
          <span>
            <span className="font-semibold">Preview only.</span> Nothing has been deleted yet. Every
            form past the keep period is listed here, approved or still waiting for approval.
          </span>
        </p>

        {/* ── Selection bar ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
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
          <p className="text-sm text-muted-foreground">
            Cut-off {formatDate(new Date(preview.cutoff))}
          </p>
        </div>

        {/* ── The list itself ────────────────────────────────────────────── */}
        {items.length === 0 ? (
          <p className="rounded-lg border border-border px-3.5 py-4 text-sm text-muted-foreground">
            Nothing to delete. No forms of the chosen types are past the keep period.
          </p>
        ) : (
          <div>
            {/* Column heads, hidden on phones, where rows stack instead. */}
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 border-b border-border pb-2.5 text-xs text-muted-foreground sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,10rem)_minmax(0,4.5rem)_3.75rem]">
              <span aria-hidden="true" />
              <span>Form</span>
              <span className="hidden sm:block">Type</span>
              <span className="hidden sm:block">Filed</span>
              <span className="hidden text-right sm:block">Files</span>
            </div>

            <ul className="divide-y divide-border">
              {shown.map((item) => rowOf(item))}
              {peek ? rowOf(peek, true) : null}
            </ul>

            {hasMore ? (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="ghost"
                  type="button"
                  className="h-auto gap-1.5 px-0 py-0 text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                  onClick={() => setVisible((count) => count + VISIBLE_STEP)}
                >
                  <ChevronDown className="size-4" aria-hidden="true" />
                  Show more
                </Button>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-4 sm:items-center sm:justify-between sm:space-x-0">
          <div className="max-w-[22rem] text-[13px] leading-5 text-muted-foreground">
            {blockedReason ? (
              <p className="font-medium text-foreground">{blockedReason}</p>
            ) : (
              <p>
                <span className="font-semibold text-foreground">Deleting is permanent.</span>{" "}
                Deleted forms and their files can't be recovered. Untick any form you want to keep.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              className="h-10 px-4"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="h-10 px-4 font-semibold"
              disabled={busy || blockedReason !== null || selectedItems.length === 0}
              onClick={() =>
                onDelete(selectedItems.map((item) => ({ type: item.type, id: item.id })))
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Delete {plural(selectedItems.length, "form")}
              {selectedFiles > 0 ? ` and ${plural(selectedFiles, "file")}` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
