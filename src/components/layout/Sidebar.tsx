import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";

import { SignOutButton } from "@/components/common/SignOutButton";
import { SIDEBAR_ACTION_CLASS, sidebarRowClass } from "./sidebar-classes";
import { roleLabel, NAV_SECTIONS } from "./nav-items";
import { InstallButton } from "./InstallButton";
import {
  SidebarBrand,
  SidebarFooter,
  SidebarSection,
  SidebarShell,
  SidebarSoonBadge,
} from "./sidebar-ui";
import type { Role } from "@/shared/types";

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
  // Role under the name — skipped when it would just repeat the name itself.
  const caption = label && label !== roleLabel(role) ? roleLabel(role) : undefined;

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

      <SidebarFooter name={name} sublabel={caption}>
        {role === "admin" ? (
          <Link to="/choose" onClick={onNavigate} className={SIDEBAR_ACTION_CLASS}>
            <LayoutGrid className="size-4" aria-hidden="true" />
            Switch app
          </Link>
        ) : null}
        <InstallButton className={SIDEBAR_ACTION_CLASS} />
        <SignOutButton className={SIDEBAR_ACTION_CLASS} />
      </SidebarFooter>
    </SidebarShell>
  );
}
