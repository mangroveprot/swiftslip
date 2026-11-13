import { Outlet, useRouterState } from "@tanstack/react-router";
import { PanelLeft, X } from "lucide-react";
import { useState } from "react";

import { APP } from "@/config/app";
import { useEmployerLogo } from "@/features/profile/use-employer-logo";
import { MobileSidebarDrawer } from "@/components/layout/MobileSidebarDrawer";
import { NotificationBell } from "./NotificationBell";
import { HrSidebar } from "./HrSidebar";

/**
 * The HR app shell (D1): its own sidebar and its own mobile header, outside
 * the `_app` shell. The route guard in `routes/hr.tsx` gates every child; the
 * API re-checks each request with `requireApp('hr')`.
 */
export function HrLayout() {
  const [open, setOpen] = useState(false);
  const { logoPath, isRegasco } = useEmployerLogo();
  const page = useRouterState({
    select: (state) => state.matches[state.matches.length - 1]?.routeId ?? state.location.pathname,
  });

  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[17rem_1fr] md:overflow-hidden print:block print:h-auto print:overflow-visible">
      <aside className="no-print hidden md:block md:h-dvh md:overflow-y-auto">
        <HrSidebar />
      </aside>

      <header className="no-print flex items-center justify-between gap-3 border-b border-border bg-glass px-4 py-3 md:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-muted/70"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            title="Menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <PanelLeft className="size-5" aria-hidden="true" />
            )}
          </button>
          <img
            src={logoPath}
            alt={isRegasco ? "Regasco" : "Mindbridge"}
            className="max-h-8 w-auto max-w-32 shrink-0 object-contain object-left"
          />
          <span
            className="min-w-0 truncate text-xl font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {APP.name}
          </span>
        </span>
        <NotificationBell />
      </header>

      <MobileSidebarDrawer open={open} onClose={() => setOpen(false)}>
        <HrSidebar onNavigate={() => setOpen(false)} inDrawer />
      </MobileSidebarDrawer>

      <div
        key={page}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out print:overflow-visible"
      >
        <Outlet />
      </div>
    </div>
  );
}
