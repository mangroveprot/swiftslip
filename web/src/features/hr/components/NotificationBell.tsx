/**
 * The in-app notification bell (D8/D9): employee and HR see the same widget.
 *
 * The feed refreshes over the shared SSE stream (`lib/live-updates.tsx`) rather
 * than polling, so a new row appears the moment it is written. Opening the
 * panel marks everything read, the badge exists to pull someone in, not to
 * demand a second click, and an item navigates to the form it is about.
 *
 * Each row leads with the outcome icon (submitted / approved / rejected /
 * resubmitted / departure) and, when the event has an actor, their photo and
 * "by Name · Position", a face and a title, never a bare id.
 *
 * The panel can also triage the feed: `Select` turns the rows into checkboxes
 * (select all / delete selected) and every row carries its own trash button.
 * Deletion is confirmed inline and only ever removes the signed-in account's
 * rows — the API scopes it by recipient.
 *
 * Two presentations share one body:
 * - desktop rail / HR header: a Radix dropdown anchored to the bell;
 * - mobile drawer: a floating card pinned to the right edge just above the
 *   notification row, over a dimmed backdrop. The drawer is only 18rem wide,
 *   so a popper on its right would land off-screen; this card overlaps the
 *   page instead and leaves the left of the drawer (the nav) visible.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { deleteNotifications, markNotificationsRead } from "@/api/hr.functions";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SIDEBAR_ACTION_CLASS } from "@/components/layout/sidebar-classes";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { relativeTime } from "@swiftslip/shared/time";
import { notificationsQueryOptions } from "../queries";
import { notificationMeta } from "../lib/notification-meta";

/** Turn a stored relative link into a typed navigation. */
function targetOf(link: string) {
  const hr = /^\/hr\/ob\/(.+)$/.exec(link);
  if (hr?.[1]) return { to: "/hr/ob/$id" as const, params: { id: hr[1] } };
  const ob = /^\/official-business\/(.+)$/.exec(link);
  if (ob?.[1]) return { to: "/official-business/$id" as const, params: { id: ob[1] } };
  return null;
}

/** Quiet text action in the panel header (Select / Select all / Clear). */
const HEADER_BUTTON =
  "rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

export function NotificationBell({
  className,
  variant = "icon",
  inDrawer = false,
  onNavigate,
}: {
  className?: string;
  /**
   * `row` is the sidebar footer entry: bell, label, and the unread count as a
   * red dot sitting ON the bell, never a separate pill on the right.
   */
  variant?: "icon" | "row";
  /** True for the mobile drawer copy, which uses the floating card. */
  inDrawer?: boolean;
  /** Called after an item is picked, so the drawer can close behind it. */
  onNavigate?: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery(notificationsQueryOptions());
  const [open, setOpen] = useState(false);
  const [drawerBottom, setDrawerBottom] = useState(112);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const unread = data?.unread ?? 0;
  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && picked.length === rows.length;

  // Escape closes the floating card, matching the drawer and other overlays.
  useEffect(() => {
    if (!inDrawer || !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setSelecting(false);
        setPicked([]);
        setPendingDelete(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inDrawer, open]);

  function resetSelection() {
    setSelecting(false);
    setPicked([]);
    setPendingDelete(null);
  }

  function openChange(next: boolean) {
    setOpen(next);
    if (!next) resetSelection();
    if (!next || unread === 0) return;
    // Optimistically clear the badge; the refetch confirms it.
    qc.setQueryData(notificationsQueryOptions().queryKey, (prev) =>
      prev ? { ...prev, unread: 0 } : prev,
    );
    void markNotificationsRead().then(() => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    });
  }

  /** The drawer card opens just above the row it belongs to, 12px clear. */
  function toggleDrawerCard(event: MouseEvent<HTMLButtonElement>) {
    if (open) {
      openChange(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setDrawerBottom(Math.max(12, window.innerHeight - rect.top + 12));
    openChange(true);
  }

  function go(link: string) {
    const target = targetOf(link);
    setOpen(false);
    if (!target) return;
    // Close the mobile drawer first so the destination is not left behind it.
    onNavigate?.();
    void navigate(target);
  }

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  async function confirmDelete() {
    const ids = pendingDelete ?? [];
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      await deleteNotifications(ids);
      // Drop the rows (and their unread count) in place; the refetch confirms.
      qc.setQueryData(notificationsQueryOptions().queryKey, (prev) => {
        if (!prev) return prev;
        const gone = new Set(ids);
        const removedUnread = prev.rows.filter((row) => gone.has(row.id) && !row.read_at).length;
        return {
          unread: Math.max(0, prev.unread - removedUnread),
          rows: prev.rows.filter((row) => !gone.has(row.id)),
        };
      });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(
        ids.length === 1 ? "Notification deleted" : `${ids.length} notifications deleted`,
      );
      resetSelection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the notification.");
    } finally {
      setDeleting(false);
    }
  }

  /** Red unread count, always anchored to the bell, never a right-side pill. */
  const badge =
    unread > 0 ? (
      <span
        className={cn(
          "pointer-events-none absolute flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground",
          variant === "row" ? "-right-2 -top-2" : "-right-0.5 -top-0.5",
        )}
      >
        {unread > 9 ? "9+" : unread}
      </span>
    ) : null;

  const trigger = (
    <button
      type="button"
      className={
        variant === "row"
          ? cn(SIDEBAR_ACTION_CLASS, className)
          : cn(
              "relative flex size-9 items-center justify-center rounded-lg text-foreground/75 transition-colors hover:bg-card/60 hover:text-foreground",
              className,
            )
      }
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      aria-expanded={open}
      title="Notifications"
      onClick={inDrawer ? toggleDrawerCard : undefined}
    >
      {variant === "row" ? (
        // The count rides ON the bell in both variants; the old grey pill
        // on the right of the row read as a second control.
        <span className="relative flex shrink-0 items-center justify-center">
          <Bell className="size-4" aria-hidden="true" />
          {badge}
        </span>
      ) : (
        <>
          <Bell className="size-4 shrink-0" aria-hidden="true" />
          {badge}
        </>
      )}
      {variant === "row" ? <span>Notifications</span> : null}
    </button>
  );

  const panel = (
    <>
      <header className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2.5">
        <p className="mr-auto text-sm font-semibold">Notifications</p>
        {rows.length === 0 ? null : selecting ? (
          <>
            <button
              type="button"
              className={HEADER_BUTTON}
              onClick={() => setPicked(allPicked ? [] : rows.map((row) => row.id))}
            >
              {allPicked ? "Clear" : "Select all"}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-[11px] font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              disabled={picked.length === 0}
              onClick={() => setPendingDelete(picked)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete{picked.length > 0 ? ` (${picked.length})` : ""}
            </button>
            <button
              type="button"
              aria-label="Cancel selection"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={resetSelection}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            {unread === 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <CheckCheck className="size-3.5" aria-hidden="true" />
                All read
              </span>
            ) : null}
            <button type="button" className={HEADER_BUTTON} onClick={() => setSelecting(true)}>
              Select
            </button>
          </>
        )}
      </header>

      {pendingDelete ? (
        // Inline confirmation, not a second modal: the panel is already an
        // overlay and a dialog on top of it fought the dropdown for focus.
        <div className="px-4 py-5">
          <p className="text-sm font-medium">
            {pendingDelete.length === 1
              ? "Delete this notification?"
              : `Delete ${pendingDelete.length} notifications?`}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            This clears them from your bell and can't be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline h-8 px-3 text-xs"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn h-8 bg-destructive px-3 text-xs text-destructive-foreground disabled:opacity-60"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing yet. Updates about your OB forms will appear here.
        </p>
      ) : (
        <ul className="max-h-[24rem] overflow-y-auto py-1">
          {rows.map((row) => {
            const meta = notificationMeta(row.kind);
            const byline = row.actor_position
              ? `${row.actor_name} · ${row.actor_position}`
              : row.actor_name;
            return (
              <li
                key={row.id}
                className={cn(
                  "flex items-start gap-1 pr-2",
                  !row.read_at && "bg-dashboard-soft/50",
                )}
              >
                {selecting ? (
                  <Checkbox
                    className="ml-3 mt-4 shrink-0"
                    checked={picked.includes(row.id)}
                    onCheckedChange={() => toggle(row.id)}
                    aria-label={`Select: ${row.title}`}
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => (selecting ? toggle(row.id) : go(row.link))}
                  className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                      meta.tone,
                    )}
                    aria-hidden="true"
                  >
                    <meta.icon className="size-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">{row.title}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {!row.read_at ? (
                          <span
                            className="size-1.5 rounded-full bg-primary"
                            aria-label="Unread"
                            title="Unread"
                          />
                        ) : null}
                        <span className="text-[10px] text-muted-foreground">
                          {relativeTime(row.created_at)}
                        </span>
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {row.body}
                    </span>
                    {byline ? (
                      <span className="mt-1.5 flex items-center gap-1.5">
                        <ProfileAvatar
                          photo={row.actor_photo ?? undefined}
                          name={row.actor_name ?? ""}
                          size={16}
                        />
                        <span className="truncate text-[11px] text-muted-foreground">
                          by {byline}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </button>

                {selecting ? null : (
                  <button
                    type="button"
                    aria-label={`Delete: ${row.title}`}
                    title="Delete"
                    onClick={() => setPendingDelete([row.id])}
                    className="mt-2.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  // Mobile drawer: a floating card pinned above the row, over a dimmed page.
  if (inDrawer) {
    return (
      <>
        {trigger}
        {open
          ? createPortal(
              <>
                <button
                  type="button"
                  aria-label="Close notifications"
                  className="fixed inset-0 z-[55] cursor-default bg-black/30 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
                  onClick={() => openChange(false)}
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Notifications"
                  style={{ bottom: drawerBottom }}
                  className="fixed right-3 z-[60] flex max-h-[calc(100dvh-9rem)] w-[min(22rem,calc(100vw-4rem))] flex-col overflow-hidden rounded-xl border bg-card text-foreground shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
                >
                  {panel}
                </div>
              </>,
              document.body,
            )
          : null}
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={openChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "row" ? "right" : "bottom"}
        align="end"
        sideOffset={8}
        className="w-[22rem] max-w-[calc(100vw-2rem)] bg-card p-0 text-foreground"
      >
        {panel}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
