import { Outlet, useRouterState } from "@tanstack/react-router";
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

      <header className="no-print flex items-center justify-between border-b border-border bg-glass px-4 py-3 md:hidden">
        <span className="flex items-center gap-2">
          <img
            src={logoPath}
            alt={isRegasco ? "Regasco" : "Mindbridge"}
            className={`w-auto object-contain ${isRegasco ? "h-8" : "h-10"}`}
          />
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {APP.name}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </span>
      </header>

      <MobileSidebarDrawer open={open} onClose={() => setOpen(false)}>
        <HrSidebar onNavigate={() => setOpen(false)} />
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
