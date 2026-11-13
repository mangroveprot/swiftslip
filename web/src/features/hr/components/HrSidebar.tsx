import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, ClipboardList, LayoutGrid } from "lucide-react";

import { SIDEBAR_ACTION_CLASS, sidebarRowClass } from "@/components/layout/sidebar-classes";
import { accountCaption } from "@/components/layout/nav-items";
import {
  SidebarBrand,
  SidebarFooter,
  SidebarSection,
  SidebarShell,
} from "@/components/layout/sidebar-ui";
import { sessionQueryOptions } from "@/features/auth/queries";
import { profileQueryOptions } from "@/features/profile/queries";
import { useProfilePhoto } from "@/features/profile/use-profile-photo";
import { NotificationBell } from "./NotificationBell";
import { hrQueueQueryOptions } from "../queries";

/**
 * Right-aligned count on the Review queue row. Red so a waiting request
 * stands out from the quiet Rejected and Completed rows, which carry no count.
 */
function NavCount({ value }: { value: number }) {
  return (
    <span className="ml-auto min-w-5 shrink-0 rounded-md bg-destructive/15 px-1.5 py-0.5 text-center text-[11px] font-bold leading-4 tabular-nums text-destructive">
      {value}
    </span>
  );
}

/**
 * The HR app's sidebar (D1). It reuses the same brand, nav rows, footer and
 * surface as the main SwiftSlip shell. Reviewers get the HR queue, the
 * Records & Forms list stays out of the approval desk, and the account lives
 * in the footer: the profile block at the bottom opens My account / Sign out
 * (no "Account" nav row), captioned **Role - Position**.
 *
 * Review queue shows a count from the same cached queue the page uses, so the
 * number updates after an approval without a second request. Completed and
 * Rejected are filtered views of the same route (`?view=…`) and carry no count.
 */
export function HrSidebar({
  onNavigate,
  inDrawer = false,
}: {
  onNavigate?: () => void;
  /** True when this is the mobile drawer copy, not the desktop rail. */
  inDrawer?: boolean;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const view = useRouterState({
    select: (state) => (state.location.search as { view?: string } | undefined)?.view,
  });
  const { data: session } = useQuery(sessionQueryOptions());
  const { data: queue } = useQuery(hrQueueQueryOptions());
  // Same cached profile the My Account page edits, position for the caption.
  const { data: profile } = useQuery(profileQueryOptions());
  const photo = useProfilePhoto();
  const apps = session?.apps;

  const completedView = view === "completed";
  const rejectedView = view === "rejected";
  const onQueue = pathname === "/hr" || pathname.startsWith("/hr/ob/");
  const reviewActive = onQueue && !completedView && !rejectedView;
  const completedActive = pathname === "/hr" && completedView;
  const rejectedActive = pathname === "/hr" && rejectedView;

  const forms = queue ?? [];
  const queueCount = forms.filter(
    (form) =>
      form.hr_status !== "completed" && form.hr_status !== "rejected" && form.hr_status !== "draft",
  ).length;
  const loaded = Boolean(queue);

  return (
    <SidebarShell>
      <SidebarBrand linkHome />

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4">
        <SidebarSection label="Review">
          <Link to="/hr" onClick={onNavigate} className={sidebarRowClass({ active: reviewActive })}>
            <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">Review queue</span>
            {loaded ? <NavCount value={queueCount} /> : null}
          </Link>
          <Link
            to="/hr"
            search={{ view: "rejected" }}
            onClick={onNavigate}
            className={sidebarRowClass({ active: rejectedActive })}
          >
            <CircleX className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">Rejected</span>
          </Link>
          <Link
            to="/hr"
            search={{ view: "completed" }}
            onClick={onNavigate}
            className={sidebarRowClass({ active: completedActive })}
          >
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">Completed</span>
          </Link>
        </SidebarSection>
      </nav>

      {/* Identity block = My Account (click to open), captioned Employer -
          Position instead of the old hard-coded "HR reviewer". */}
      <SidebarFooter
        name={session?.label ?? "HR"}
        photo={photo}
        sublabel={accountCaption(profile?.employer, profile?.designation)}
        to="/hr/profile"
        signOutAccessName="the HR app"
      >
        <NotificationBell variant="row" inDrawer={inDrawer} onNavigate={onNavigate} />
        {apps && apps.length > 1 ? (
          <Link to="/choose" onClick={onNavigate} className={SIDEBAR_ACTION_CLASS}>
            <LayoutGrid className="size-4" aria-hidden="true" />
            Switch app
          </Link>
        ) : null}
      </SidebarFooter>
    </SidebarShell>
  );
}
