/**
 * The chrome a pending route paints before its own layout chunk has landed.
 *
 * On a hard refresh nothing of the app exists yet: the route guard is still
 * waiting on `/api/auth/session` + `/api/profile/me`, and the layout chunk is
 * still downloading. The router's pending component therefore has to draw the
 * shell itself — a centred spinner on an empty page read as "this app is
 * broken", not "this page is opening".
 *
 * These are silhouettes, not copies: the surface, the 17rem rail, the brand
 * lockup, the section rhythm and the footer identity block match the real
 * shells, while every string is a bar. Keeping labels out means a nav rename
 * never leaves a stale name behind in a loading state.
 *
 * They are deliberately self-contained (only `BrandLockup`, `cn` and the
 * sidebar row classes) so importing them cannot pull an app chunk into the
 * entry bundle.
 */
import type { ReactNode } from "react";

import { BrandLockup } from "@/components/common/BrandLockup";
import { sidebarRowClass } from "@/components/layout/sidebar-classes";
import { cn } from "@/lib/utils";

/** One placeholder bar. `bg-foreground/20` because `bg-muted` disappears in dark. */
export function PendingBar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded bg-foreground/20", className)}
    />
  );
}

/**
 * The 17rem rail every sidebar app shares: brand, grouped nav rows, footer.
 * `groups` is the number of rows per section (a count, not labels).
 */
export function PendingSidebar({
  subtitle,
  groups,
  footerRows = 1,
}: {
  /** Static caption under the lockup ("Admin Panel"); omitted for the portal. */
  subtitle?: string;
  groups: number[];
  footerRows?: number;
}) {
  return (
    <div className="flex h-full flex-col border-r border-border bg-[image:var(--sidebar-surface)]">
      <header className="shrink-0 border-b border-border px-4 pb-4 pt-5">
        <BrandLockup imageClassName="h-10" wordClassName="text-2xl" />
        {subtitle ? (
          <span className="mt-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </header>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4" aria-hidden="true">
        {groups.map((rows, group) => (
          <section key={group}>
            <div className="px-2 pb-1.5">
              <PendingBar className="h-2.5 w-20 rounded-sm bg-foreground/15" />
            </div>
            <div className="space-y-0.5">
              {Array.from({ length: rows }).map((_, row) => (
                <div key={row} className={sidebarRowClass()}>
                  <PendingBar className="size-4 shrink-0 rounded-sm" />
                  <PendingBar className={cn("h-3", row % 3 === 1 ? "w-32" : "w-24")} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </nav>

      <footer className="shrink-0 border-t border-border px-2 py-3" aria-hidden="true">
        <div className="space-y-0.5">
          {Array.from({ length: footerRows }).map((_, row) => (
            <div key={row} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <PendingBar className="size-4 shrink-0 rounded-sm" />
              <PendingBar className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3 px-1 py-1.5">
          <PendingBar className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <PendingBar className="h-3.5 w-24" />
            <PendingBar className="h-3 w-32 bg-foreground/10" />
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * The portal / Admin / HR shell: fixed rail on desktop, a compact mobile
 * header, and the single content scroller the real layouts use.
 */
export function PendingShell({
  appName,
  sidebar,
  mobileBadge,
  children,
  className,
}: {
  appName: string;
  sidebar: ReactNode;
  /** Extra pill next to the app name on phones ("Admin"). */
  mobileBadge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex h-dvh flex-col md:grid md:grid-cols-[17rem_1fr] md:overflow-hidden",
        className,
      )}
    >
      <span className="sr-only">Loading {appName}…</span>

      <aside className="no-print hidden md:block md:h-dvh md:overflow-y-auto" aria-hidden="true">
        {sidebar}
      </aside>

      <header className="no-print flex items-center justify-between gap-3 border-b border-border bg-glass px-4 py-3 md:hidden">
        <span className="flex min-w-0 items-center gap-2" aria-hidden="true">
          <PendingBar className="size-9 shrink-0 rounded-md" />
          <BrandLockup className="gap-2" imageClassName="h-8" wordClassName="text-xl" />
          {mobileBadge}
        </span>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

/**
 * Showroom Updates is a single board with no rail: its own top bar (brand,
 * Switch app, account chip) floats over the page gradient.
 */
export function PendingBoardShell({ appName, children }: { appName: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="min-h-dvh pb-16 text-foreground">
      <span className="sr-only">Loading {appName}…</span>
      <header
        className="mx-auto flex w-full max-w-[1760px] items-center justify-between gap-3 px-4 py-4 md:px-8 md:py-5"
        aria-hidden="true"
      >
        <BrandLockup
          className="min-w-0 gap-2 sm:gap-3"
          imageClassName="h-8 sm:h-9"
          wordClassName="text-xl sm:text-2xl"
        />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <PendingBar className="h-9 w-24 rounded-lg sm:h-10 sm:w-28" />
          <PendingBar className="h-9 w-40 rounded-lg sm:h-10 sm:w-52" />
        </div>
      </header>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/**
 * Inventory's shell is different on purpose: a ~20rem rail that is `static`
 * above `lg`, and a padded main area instead of a grid. The `.rgc-inventory`
 * scope is required, its table/banner classes are written under it.
 */
export function PendingInventoryShell({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="rgc-inventory flex h-dvh overflow-hidden relative text-foreground"
    >
      <span className="sr-only">Loading the asset inventory…</span>

      <aside
        className="app-sidebar hidden lg:flex h-full w-80 shrink-0 flex-col"
        aria-hidden="true"
      >
        {/* The inventory rail has its own brand lockup (REGASCO), not the
            SwiftSlip one. Markup mirrors `InventorySidebar`; the classes live
            in the global stylesheet under `.rgc-inventory`. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 px-3.5 pt-5 pb-4">
          <div className="sidebar-brand">
            <img src="/inventory/logo.webp" alt="" className="sidebar-brand__logo" />
            <div className="sidebar-brand__wordmark">
              <span className="sidebar-brand__name">REGASCO</span>
              <span className="sidebar-brand__rule" />
              <span className="sidebar-brand__sub">ASSET INVENTORY</span>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-3.5 pt-4">
          <p className="sidebar-section-label">Branch</p>
          <PendingBar className="h-11 w-full rounded-md border border-white/15 bg-white/10" />
          <PendingBar className="h-10 w-full rounded-md bg-white/10" />
        </div>
        <nav className="mt-6 space-y-1 px-3">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-3 rounded-md px-2 py-2.5">
              <PendingBar className="size-4 shrink-0 rounded-sm bg-white/25" />
              <PendingBar className={cn("h-3 bg-white/25", row === 0 ? "w-20" : "w-24")} />
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 px-4 py-4">
          <div className="flex items-center gap-2.5 px-1">
            <div className="min-w-0 flex-1 space-y-1.5">
              <PendingBar className="h-3.5 w-24 bg-white/30" />
              <PendingBar className="h-3 w-32 bg-white/20" />
            </div>
            <PendingBar className="size-8 rounded-md bg-white/15" />
          </div>
          <div className="mt-3 space-y-2">
            <PendingBar className="h-9 w-full rounded-md bg-white/15" />
            <PendingBar className="h-9 w-full rounded-md bg-white/10" />
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <main className="flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
          <div className="flex flex-col flex-1 min-h-0 gap-3 md:gap-4" aria-hidden="true">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
