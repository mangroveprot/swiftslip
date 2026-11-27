/**
 * What the router shows while a route is still on its way.
 *
 * Routes are code-split and every app layout re-checks the session (and the
 * profile) in `beforeLoad`, so on a hard refresh the destination does not exist
 * yet: the layout chunk is still downloading and the gate is still waiting on
 * `/api/auth/session` + `/api/profile/me`. The fallback used to be a centred
 * spinner, which read as "this app is broken" on a page that was about to look
 * like the dashboard or the records grid.
 *
 * It now paints the destination's own loading state: the app's chrome as a
 * silhouette (see `pending/RouteShell`) around the skeleton that page already
 * uses (see `pending/RoutePages`). Two things make that safe:
 *
 * - The URL is known before the match is, so the page can be picked from
 *   `location.pathname` (and `?section=` for the Admin Panel).
 * - The shell is drawn only while its own layout route is still pending. Once
 *   `_app` / `/admin` / `/hr` / the inventory layout has mounted, the fallback
 *   renders inside it and must not draw a second sidebar.
 *
 * `/choose` still sets its own `pendingComponent`; the case here only covers
 * the moment before that route's match exists.
 */
import { useRouterState } from "@tanstack/react-router";

import { APP } from "@/config/app";

import {
  AdminPageSkeleton,
  AppChooserSkeleton,
  HrPageSkeleton,
  InventoryPageSkeleton,
  LoginSkeleton,
  OnboardingSkeleton,
  PortalPageSkeleton,
  ProfileSkeleton,
  ShowroomPageSkeleton,
} from "./pending/RoutePages";
import {
  PendingBoardShell,
  PendingInventoryShell,
  PendingShell,
  PendingSidebar,
} from "./pending/RouteShell";

type PendingApp =
  "portal" | "admin" | "hr" | "inventory" | "showroom" | "login" | "onboarding" | "choose";

/** Which app a URL belongs to. Unknown paths fall back to the portal shell. */
function appFor(pathname: string): PendingApp {
  if (pathname === "/") return "login";
  if (pathname === "/onboarding") return "onboarding";
  if (pathname === "/choose") return "choose";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/hr" || pathname.startsWith("/hr/")) return "hr";
  if (pathname === "/rgc-asset-inventory" || pathname.startsWith("/rgc-asset-inventory/")) {
    return "inventory";
  }
  if (pathname === "/showroom-updates") return "showroom";
  return "portal";
}

/** The layout route whose chrome a pending page needs. */
const SHELL_ROUTE_ID: Partial<Record<PendingApp, string>> = {
  portal: "/_app",
  admin: "/admin",
  hr: "/hr",
  inventory: "/rgc-asset-inventory",
  showroom: "/showroom-updates",
};

const SETTINGS_SECTIONS = new Set(["retention", "storage", "backup"]);

export function RoutePending() {
  const pathname = useRouterState({
    // `/hr/` and `/records/` are the same page as their unslashed form.
    select: (state) => {
      const path = state.location.pathname;
      return path.length > 1 ? path.replace(/\/+$/, "") : path;
    },
  });
  const section = useRouterState({
    select: (state) => (state.location.search as { section?: string } | undefined)?.section,
  });

  const app = appFor(pathname);
  const shellRouteId = SHELL_ROUTE_ID[app];

  // True once the app's own layout has mounted. A pending child route then
  // renders inside that layout, so only the content area is drawn.
  const shellMounted = useRouterState({
    select: (state) =>
      !shellRouteId ||
      state.matches.some((match) => match.routeId === shellRouteId && match.status === "success"),
  });

  if (app === "login") return <LoginSkeleton />;
  if (app === "onboarding") return <OnboardingSkeleton />;
  if (app === "choose") return <AppChooserSkeleton />;

  const content =
    app === "admin" ? (
      pathname === "/admin/profile" ? (
        <ProfileSkeleton />
      ) : (
        <AdminPageSkeleton section={section ?? "dashboard"} />
      )
    ) : app === "hr" ? (
      <HrPageSkeleton pathname={pathname} />
    ) : app === "inventory" ? (
      <InventoryPageSkeleton pathname={pathname} />
    ) : app === "showroom" ? (
      <ShowroomPageSkeleton />
    ) : (
      <PortalPageSkeleton pathname={pathname} />
    );

  if (shellMounted) return <>{content}</>;

  if (app === "showroom") {
    return <PendingBoardShell appName="Showroom Updates">{content}</PendingBoardShell>;
  }

  if (app === "inventory") {
    return <PendingInventoryShell>{content}</PendingInventoryShell>;
  }

  if (app === "admin") {
    const settingsOpen = section ? SETTINGS_SECTIONS.has(section) : false;
    return (
      <PendingShell
        appName="the Admin Panel"
        sidebar={
          <PendingSidebar subtitle="Admin Panel" groups={settingsOpen ? [1, 4, 3] : [1, 4]} />
        }
        mobileBadge={
          <span
            aria-hidden="true"
            className="h-5 w-14 shrink-0 rounded-full border border-border"
          />
        }
      >
        {content}
      </PendingShell>
    );
  }

  if (app === "hr") {
    return (
      <PendingShell appName="the HR app" sidebar={<PendingSidebar groups={[3]} footerRows={2} />}>
        {content}
      </PendingShell>
    );
  }

  return (
    <PendingShell appName={APP.name} sidebar={<PendingSidebar groups={[6]} footerRows={2} />}>
      {content}
    </PendingShell>
  );
}
