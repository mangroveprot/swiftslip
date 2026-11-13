import { useRouterState } from "@tanstack/react-router";
import { PanelLeft, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { APP } from "@/config/app";
import { useEmployerLogo } from "@/features/profile/use-employer-logo";
import type { SessionUser } from "@swiftslip/shared/types";
import { MobileSidebarDrawer } from "./MobileSidebarDrawer";
import { Sidebar } from "./Sidebar";

/** Chrome (sidebar / mobile header) around every signed-in page. */
export function AppShell({ session, children }: { session: SessionUser; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { logoPath, isRegasco } = useEmployerLogo();
  // Re-key the content area per page (the deepest matched route) so each tab
  // switch replays a smooth fade/rise instead of hard-cutting to the new page.
  // Saving a draft only swaps the `$id` param, same route, so the key holds
  // and the editor keeps its mount instead of flashing like a reload.
  const page = useRouterState({
    // `routeId` is the route's static id (`/_app/records/$id`), unlike `id`,
    // which embeds the pathname and would change with every param.
    select: (s) => s.matches[s.matches.length - 1]?.routeId ?? s.location.pathname,
  });

  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[17rem_1fr] md:overflow-hidden print:block print:h-auto print:overflow-visible">
      <aside className="no-print hidden md:block md:h-dvh md:overflow-y-auto">
        <Sidebar role={session.role} label={session.label} />
      </aside>

      <header className="no-print flex items-center justify-between gap-3 border-b border-border bg-glass px-4 py-3 md:hidden">
        <span className="flex min-w-0 items-center gap-2">
          {/* The hamburger leads, where a phone user looks for navigation, and
              the drawer slides in from the same (left) edge as the desktop
              rail. The icon replaces the old "Menu" word. */}
          <button
            type="button"
            className="-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-muted/70"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            title="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <PanelLeft className="size-5" aria-hidden="true" />
            )}
          </button>
          <img
            src={logoPath}
            alt={isRegasco ? "Regasco" : "Mindbridge"}
            // A cap on the width as well as the height: the Regasco wordmark is
            // 5.6:1, so a height-only rule made it swallow the whole bar.
            className="max-h-8 w-auto max-w-32 shrink-0 object-contain object-left"
          />
          <span
            className="min-w-0 truncate text-xl font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {APP.name}
          </span>
        </span>
      </header>
      <MobileSidebarDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        <Sidebar
          role={session.role}
          label={session.label}
          onNavigate={() => setMenuOpen(false)}
          inDrawer
        />
      </MobileSidebarDrawer>

      <div
        key={page}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out print:overflow-visible"
      >
        {children}
      </div>
    </div>
  );
}
