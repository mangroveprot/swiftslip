import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";

import { sessionQueryOptions } from "@/features/auth/queries";
import { NotificationBell } from "@/features/hr/components/NotificationBell";
import { profileQueryOptions } from "@/features/profile/queries";
import { useProfilePhoto } from "@/features/profile/use-profile-photo";
import { SIDEBAR_ACTION_CLASS, sidebarRowClass } from "./sidebar-classes";
import { accountCaption, roleLabel, NAV_SECTIONS } from "./nav-items";
import { InstallButton } from "./InstallButton";
import {
  SidebarBrand,
  SidebarFooter,
  SidebarSection,
  SidebarShell,
  SidebarSoonBadge,
} from "./sidebar-ui";
import type { Role } from "@swiftslip/shared/types";

export function Sidebar({
  role,
  label,
  onNavigate,
}: {
  role: Role | undefined;
  label?: string;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const name = label || roleLabel(role);
  // Same query the route guards use, so this is a cache hit rather than a new
  // request. Only the granted apps are needed, never the session itself.
  const { data: session } = useQuery(sessionQueryOptions());
  const apps = session?.apps;
  // The caption is "Role - Position" from the same cached profile the My
  // Account page edits; it falls back to the role alone until a position is
  // on file. Skipped when it would just repeat the name itself.
  const { data: profile } = useQuery(profileQueryOptions());
  const caption = accountCaption(role, profile?.designation);
  const sublabel = label && label !== caption ? caption : undefined;
  // The profile photo, if one has been set — one cached entry shared by every
  // screen that shows a face. The footer falls back to initials while it
  // loads, so this never blocks paint.
  const photo = useProfilePhoto();

  return (
    <SidebarShell>
      <SidebarBrand linkHome />

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {NAV_SECTIONS.map((section) => (
          <SidebarSection key={section.label} label={section.label}>
            {section.items.map((item) => {
              const Icon = item.icon;
              // A row is active when the current path is its route or one of
              // its children (e.g. /records/:id keeps "Daily Time Record" lit).
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);

              return item.soon ? (
                <span
                  key={item.to}
                  className={sidebarRowClass({ disabled: true })}
                  title="Coming soon"
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{item.label}</span>
                  <SidebarSoonBadge />
                </span>
              ) : (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={sidebarRowClass({ active })}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </SidebarSection>
        ))}
      </nav>

      {/* The identity block IS the account entry: clicking it opens My
          Account, which is why the old "Account" nav row is gone. */}
      <SidebarFooter name={name} photo={photo} sublabel={sublabel} to="/profile">
        <NotificationBell variant="row" />
        {/* Shown when there is more than one app to move between. Keyed on the
            resolved grants rather than the role: a staff account given the
            inventory alongside SwiftSlip needs this just as an admin does, and
            a single-app account has nothing to switch to. */}
        {apps && apps.length > 1 ? (
          <Link to="/choose" onClick={onNavigate} className={SIDEBAR_ACTION_CLASS}>
            <LayoutGrid className="size-4" aria-hidden="true" />
            Switch app
          </Link>
        ) : null}
        <InstallButton className={SIDEBAR_ACTION_CLASS} />
      </SidebarFooter>
    </SidebarShell>
  );
}
