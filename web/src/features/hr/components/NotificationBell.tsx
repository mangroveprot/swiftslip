/**
 * The in-app notification bell (D8/D9): employee and HR see the same widget.
 *
 * The feed polls every 30 s (`notificationsQueryOptions`). Opening the panel
 * marks everything read — the badge exists to pull someone in, not to demand a
 * second click — and an item navigates to the form it is about.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markNotificationsRead } from "@/api/hr.functions";
import { relativeTime } from "@swiftslip/shared/time";
import { cn } from "@/lib/utils";
import { notificationsQueryOptions } from "../queries";

/** Turn a stored relative link into a typed navigation. */
function targetOf(link: string) {
  const hr = /^\/hr\/ob\/(.+)$/.exec(link);
  if (hr?.[1]) return { to: "/hr/ob/$id" as const, params: { id: hr[1] } };
  const ob = /^\/official-business\/(.+)$/.exec(link);
  if (ob?.[1]) return { to: "/official-business/$id" as const, params: { id: ob[1] } };
  return null;
}

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery(notificationsQueryOptions());
  const [open, setOpen] = useState(false);

  const unread = data?.unread ?? 0;
  const rows = data?.rows ?? [];

  function openChange(next: boolean) {
    setOpen(next);
    if (!next || unread === 0) return;
    // Optimistically clear the badge; the refetch confirms it.
    qc.setQueryData(notificationsQueryOptions().queryKey, (prev) =>
      prev ? { ...prev, unread: 0 } : prev,
    );
    void markNotificationsRead().then(() => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    });
  }

  function go(link: string) {
    const target = targetOf(link);
    setOpen(false);
    if (target) void navigate(target);
  }

  return (
    <DropdownMenu open={open} onOpenChange={openChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex size-9 items-center justify-center rounded-lg text-foreground/75 transition-colors hover:bg-card/60 hover:text-foreground",
            className,
          )}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          title="Notifications"
        >
          <Bell className="size-4" aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[22rem] max-w-[calc(100vw-2rem)] bg-card p-0 text-foreground"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread === 0 && rows.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCheck className="size-3.5" aria-hidden="true" />
              All read
            </span>
          ) : null}
        </header>

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Updates about your OB forms will appear here.
          </p>
        ) : (
          <ul className="max-h-[24rem] overflow-y-auto py-1">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => go(row.link)}
                  className={cn(
                    "block w-full px-4 py-3 text-left transition-colors hover:bg-muted",
                    !row.read_at && "bg-dashboard-soft/50",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-snug">{row.title}</span>
                    <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">
                      {relativeTime(row.created_at)}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                    {row.body}
                  </span>
                  {row.actor_name ? (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      by {row.actor_name}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
