import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, LayoutDashboard, LayoutGrid, Menu, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { SignOutButton } from "@/components/common/SignOutButton";
import { SIDEBAR_ACTION_CLASS, sidebarRowClass } from "@/components/layout/sidebar-classes";
import {
  SidebarBrand,
  SidebarFooter,
  SidebarSection,
  SidebarShell,
} from "@/components/layout/sidebar-ui";
import { APP } from "@/config/app";
import { sessionQueryOptions } from "@/features/auth/queries";
import { ActivityLogs } from "./ActivityLogs";
import { AdminDashboard } from "./AdminDashboard";
import { UserManagement } from "./UserManagement";

type Section = "dashboard" | "users" | "logs";

type AdminItem = { id: Section; label: string; icon: LucideIcon };

/** Grouped the same way the SwiftSlip sidebar groups its nav. */
const SECTION_GROUPS: { label: string; items: AdminItem[] }[] = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Manage",
    items: [
      { id: "users", label: "User management", icon: Users },
      { id: "logs", label: "Activity logs", icon: History },
    ],
  },
];

/**
 * The Admin Panel as its own page with its own chrome — reached from the
 * "Where would you like to go?" chooser, outside the SwiftSlip `_app` shell so
 * the portal's sidebar no longer carries admin navigation. The sidebar below
 * reuses the SwiftSlip sidebar's look (glass panel, same nav/button styles).
 */
export function AdminPanel() {
  const { data: session } = useQuery(sessionQueryOptions());
  const [section, setSection] = useState<Section>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  const sidebar = (
    <AdminSidebar
      section={section}
      onSelect={(next) => setSection(next)}
      label={session?.label}
      idNumber={session?.idNumber}
      onNavigate={() => setMenuOpen(false)}
    />
  );

  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[17rem_1fr] md:overflow-hidden">
      <aside className="no-print hidden md:block md:h-dvh md:overflow-y-auto">{sidebar}</aside>

      <header className="no-print flex items-center justify-between border-b border-white/40 bg-glass px-4 py-3 backdrop-blur-xl md:hidden">
        <span className="flex items-center gap-2">
          <img
            src={APP.mindbridgeLogoPath}
            alt="Mindbridge"
            className="h-7 w-auto object-contain"
          />
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {APP.name}
          </span>
          <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Admin
          </span>
        </span>
        <button className="btn btn-outline" onClick={() => setMenuOpen((v) => !v)}>
          <Menu className="size-4" aria-hidden="true" />
          {menuOpen ? "Close" : "Menu"}
        </button>
      </header>
      {menuOpen ? (
        <div className="no-print border-b motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300 md:hidden">
          {sidebar}
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div
          key={section}
          className={`${section === "dashboard" ? "max-w-[100rem]" : "max-w-5xl"} mx-auto space-y-6 px-4 py-8 md:px-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out`}
        >
          {section === "dashboard" ? (
            <AdminDashboard />
          ) : section === "users" ? (
            <UserManagement />
          ) : (
            <ActivityLogs />
          )}
        </div>
      </div>
    </div>
  );
}

/** The panel's own nav — a copy of the SwiftSlip sidebar's structure and styles. */
function AdminSidebar({
  section,
  onSelect,
  label,
  idNumber,
  onNavigate,
}: {
  section: Section;
  onSelect: (section: Section) => void;
  label?: string | undefined;
  idNumber?: string | undefined;
  onNavigate?: () => void;
}) {
  return (
    <SidebarShell>
      <SidebarBrand subtitle="Admin Panel" />

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {SECTION_GROUPS.map((group) => (
          <SidebarSection key={group.label} label={group.label}>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? "page" : undefined}
                className={sidebarRowClass({ active: section === item.id })}
                onClick={() => {
                  onSelect(item.id);
                  onNavigate?.();
                }}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            ))}
          </SidebarSection>
        ))}
      </nav>

      <SidebarFooter
        name={label || "Administrator"}
        // The ID number under the full name — the old second line repeated
        // "Administrator" for no reason. Hidden for cookies issued before the
        // session carried the ID number (sign in again to get it).
        sublabel={idNumber || undefined}
      >
        <Link to="/choose" onClick={onNavigate} className={SIDEBAR_ACTION_CLASS}>
          <LayoutGrid className="size-4" aria-hidden="true" />
          Switch app
        </Link>
        <SignOutButton className={SIDEBAR_ACTION_CLASS} />
      </SidebarFooter>
    </SidebarShell>
  );
}
