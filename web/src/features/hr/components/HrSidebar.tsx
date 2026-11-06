import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, LayoutGrid, UserRound, XCircle } from "lucide-react";

import { SignOutButton } from "@/components/common/SignOutButton";
import { InstallButton } from "@/components/layout/InstallButton";
import { SIDEBAR_ACTION_CLASS, sidebarRowClass } from "@/components/layout/sidebar-classes";
import {
  SidebarBrand,
  SidebarFooter,
  SidebarSection,
  SidebarShell,
} from "@/components/layout/sidebar-ui";
import { sessionQueryOptions } from "@/features/auth/queries";
import { useProfilePhoto } from "@/features/profile/use-profile-photo";
import { hrQueueQueryOptions } from "../queries";

/**
 * The sidebar's only count: how many forms are waiting in the review queue.
 * Green rather than grey so the number is the first thing a reviewer sees —
 * deliberately NOT the old solid orange pill, which was too loud in dark mode.
 * Rejected and Completed carry no count at all.
 */
function NavCount({ value }: { value: number }) {
  return (
    <span className="ml-auto min-w-5 shrink-0 rounded-md bg-dashboard-rule/15 px-1.5 py-0.5 text-center text-[11px] font-bold leading-4 tabular-nums text-dashboard-rule dark:bg-emerald-400/15 dark:text-emerald-300">
      {value}
    </span>
  );
}

/**
 * The HR app's sidebar (D1). It reuses the same brand, nav rows, footer and
 * surface as the main SwiftSlip shell. Reviewers get the HR queue plus the
 * Account row — the Records & Forms list stays out of the approval desk.
 *
 * Only Review queue shows a count, from the same cached queue the page uses,
 * so it updates after an approval without a second request. Completed and
 * Rejected are filtered views of the same route (`?view=…`), and stay
 * uncluttered — no counter beside them.
 */
export function HrSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const view = useRouterState({
    select: (state) => (state.location.search as { view?: string } | undefined)?.view,
  });
  const { data: session } = useQuery(sessionQueryOptions());
  const { data: queue } = useQuery(hrQueueQueryOptions());
  const photo = useProfilePhoto();
  const apps = session?.apps;

  const completedView = view === "completed";
  const rejectedView = view === "rejected";
  const onQueue = pathname === "/hr" || pathname.startsWith("/hr/ob/");
  const reviewActive = onQueue && !completedView && !rejectedView;
  const completedActive = pathname === "/hr" && completedView;
  const rejectedActive = pathname === "/hr" && rejectedView;
  const accountActive = pathname === "/hr/profile";

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
        <SidebarSection label="HR">
          <Link to="/hr" onClick={onNavigate} className={sidebarRowClass({ active: reviewActive })}>
            <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">Review queue</span>
            {loaded ? <NavCount value={queueCount} /> : null}
          </Link>
          <Link
            to="/hr"
            search={{ view: "rejected" }}
            onClick={onNavigate}
            className={sidebarRowClass({ active: rejectedActive })}
          >
            <XCircle className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">Rejected</span>
          </Link>
          <Link
            to="/hr"
            search={{ view: "completed" }}
            onClick={onNavigate}
            className={sidebarRowClass({ active: completedActive })}
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">Completed</span>
          </Link>
        </SidebarSection>

        <SidebarSection label="Account">
          <Link
            to="/hr/profile"
            onClick={onNavigate}
            className={sidebarRowClass({ active: accountActive })}
          >
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">My Account</span>
          </Link>
        </SidebarSection>
      </nav>

      <SidebarFooter name={session?.label ?? "HR"} photo={photo} sublabel="HR reviewer">
        {apps && apps.length > 1 ? (
          <Link to="/choose" onClick={onNavigate} className={SIDEBAR_ACTION_CLASS}>
            <LayoutGrid className="size-4" aria-hidden="true" />
            Switch app
          </Link>
        ) : null}
        <InstallButton className={SIDEBAR_ACTION_CLASS} />
        <SignOutButton className={SIDEBAR_ACTION_CLASS} accessName="the HR app" />
      </SidebarFooter>
    </SidebarShell>
  );
}
