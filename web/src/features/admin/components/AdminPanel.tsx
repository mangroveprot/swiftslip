import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Database,
  HardDrive,
  History,
  LayoutDashboard,
  LayoutGrid,
  PanelLeft,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { MobileSidebarDrawer } from "@/components/layout/MobileSidebarDrawer";
import { SIDEBAR_ACTION_CLASS, sidebarRowClass } from "@/components/layout/sidebar-classes";
import {
  SidebarBrand,
  SidebarFooter,
  SidebarSection,
  SidebarShell,
  SidebarSoonBadge,
} from "@/components/layout/sidebar-ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { APP } from "@/config/app";
import { accountCaption } from "@/components/layout/nav-items";
import { useEmployerLogo } from "@/features/profile/use-employer-logo";
import { sessionQueryOptions } from "@/features/auth/queries";
import { profileQueryOptions } from "@/features/profile/queries";
import { useProfilePhoto } from "@/features/profile/use-profile-photo";
import { cn } from "@/lib/utils";
import type { Employer } from "@swiftslip/shared/org";
import type { ActivityLogActionFilter } from "@swiftslip/shared/schemas";
import { ActivityLogs } from "./ActivityLogs";
import { AdminDashboard } from "./AdminDashboard";
import { AppAccess } from "./AppAccess";
import { DataRetention } from "./settings/DataRetention";
import { Storage } from "./settings/Storage";
import { UserManagement } from "./UserManagement";

type Section = "dashboard" | "users" | "access" | "logs" | "retention" | "storage";

/**
 * A nav row. `id` is the section it opens; a parent row (one with `children`)
 * or a "Soon" row has none, neither is selectable, only real children are.
 */
type AdminItem = {
  id: Section | null;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  children?: AdminItem[];
};

/** Grouped the same way the SwiftSlip sidebar groups its nav. */
const SECTION_GROUPS: { label: string; items: AdminItem[] }[] = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Manage",
    items: [
      { id: "users", label: "User management", icon: Users },
      { id: "access", label: "App access", icon: ShieldCheck },
      { id: "logs", label: "Activity logs", icon: History },
      {
        id: null,
        label: "Settings",
        icon: Settings,
        children: [
          { id: "retention", label: "Data retention", icon: Database },
          { id: "storage", label: "Storage", icon: HardDrive },
        ],
      },
    ],
  },
];

/**
 * The Admin Panel as its own page with its own chrome, reached from the
 * "Where would you like to go?" chooser, outside the SwiftSlip `_app` shell so
 * the portal's sidebar no longer carries admin navigation. The sidebar below
 * reuses the SwiftSlip sidebar's look (glass panel, same nav/button styles).
 */
export function AdminPanel() {
  const { data: session } = useQuery(sessionQueryOptions());
  // The same photo the portal's sidebar shows, one cache entry, so moving
  // between the panel and the app never re-fetches it.
  const photo = useProfilePhoto();
  // Position and employer for the footer caption ("Mindbridge - IT Support"),
  // from the same cached profile the My Account page edits.
  const { data: profile } = useQuery(profileQueryOptions());
  const { logoPath, isRegasco } = useEmployerLogo();
  const [section, setSection] = useState<Section>("dashboard");
  const [logFilter, setLogFilter] = useState<ActivityLogActionFilter | "all">("all");
  const [menuOpen, setMenuOpen] = useState(false);

  // A dashboard link can open Activity logs already narrowed to sign-ins.
  const navigate = (next: Section, filter?: ActivityLogActionFilter) => {
    if (next === "logs") setLogFilter(filter ?? "all");
    setSection(next);
  };
  // The session query is seeded by the route loader, but the query cache is not
  // available on the first client paint. Keep the footer's initial markup
  // identical on both sides, then fill in the name after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const sidebar = (
    <AdminSidebar
      section={section}
      onSelect={(next) => navigate(next)}
      label={mounted ? session?.label : undefined}
      employer={mounted ? profile?.employer : undefined}
      position={mounted ? profile?.designation : undefined}
      photo={mounted ? photo : undefined}
      onNavigate={() => setMenuOpen(false)}
    />
  );

  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[17rem_1fr] md:overflow-hidden">
      <aside className="no-print hidden md:block md:h-dvh md:overflow-y-auto">{sidebar}</aside>

      <header className="no-print flex items-center justify-between gap-3 border-b border-border bg-glass px-4 py-3 md:hidden">
        <span className="flex min-w-0 items-center gap-2">
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
            className="max-h-7 w-auto max-w-28 shrink-0 object-contain object-left"
          />
          <span
            className="min-w-0 truncate text-xl font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {APP.name}
          </span>
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Admin
          </span>
        </span>
      </header>
      <MobileSidebarDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        {sidebar}
      </MobileSidebarDrawer>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div
          key={section}
          // User management is a seven-column roster: a 5xl cap left most of a
          // wide screen empty while the table squeezed itself into the middle.
          // It now fills the panel; the reading-width cap stays on the prose
          // screens. (The dashboard keeps its own slightly wider cap.)
          className={`${section === "dashboard" ? "max-w-6xl" : section === "users" ? "max-w-none" : "max-w-5xl"} mx-auto space-y-6 px-4 py-8 md:px-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out`}
        >
          {section === "dashboard" ? (
            <AdminDashboard onNavigate={navigate} />
          ) : section === "users" ? (
            <UserManagement />
          ) : section === "access" ? (
            <AppAccess />
          ) : section === "retention" ? (
            <DataRetention />
          ) : section === "storage" ? (
            <Storage />
          ) : (
            <ActivityLogs initialFilter={logFilter} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The panel's own nav, a copy of the SwiftSlip sidebar's structure and styles. */
function AdminSidebar({
  section,
  onSelect,
  label,
  employer,
  position,
  photo,
  onNavigate,
}: {
  section: Section;
  onSelect: (section: Section) => void;
  label?: string | undefined;
  employer?: Employer | undefined;
  position?: string | undefined;
  photo?: string | undefined;
  onNavigate?: () => void;
}) {
  return (
    <SidebarShell>
      <SidebarBrand subtitle="Admin Panel" />

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {SECTION_GROUPS.map((group) => (
          <SidebarSection key={group.label} label={group.label}>
            {group.items.map((item) =>
              item.children ? (
                <SettingsGroup
                  key={item.label}
                  item={item}
                  section={section}
                  onSelect={onSelect}
                  onNavigate={onNavigate}
                />
              ) : (
                renderAdminRow(item, section, onSelect, onNavigate)
              ),
            )}
          </SidebarSection>
        ))}
      </nav>

      <SidebarFooter
        name={label || "Administrator"}
        photo={photo}
        // "Employer - Position" under the name, the same caption every sidebar
        // uses, falling back to whichever half is known.
        sublabel={accountCaption(employer, position)}
        // The identity block is the way into My Account (there is no Account
        // nav row in this panel either).
        to="/profile"
      >
        <Link to="/choose" onClick={onNavigate} className={SIDEBAR_ACTION_CLASS}>
          <LayoutGrid className="size-4" aria-hidden="true" />
          Switch app
        </Link>
      </SidebarFooter>
    </SidebarShell>
  );
}

/** One nav row: a selectable section, or a dimmed "Soon" row that isn't. */
function renderAdminRow(
  item: AdminItem,
  section: Section,
  onSelect: (section: Section) => void,
  onNavigate?: (() => void) | undefined,
) {
  if (item.soon || !item.id) {
    return (
      <span key={item.label} className={sidebarRowClass({ disabled: true })} title="Coming soon">
        <item.icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{item.label}</span>
        <SidebarSoonBadge />
      </span>
    );
  }
  const id = item.id;
  return (
    <button
      key={id}
      type="button"
      aria-current={section === id ? "page" : undefined}
      className={sidebarRowClass({ active: section === id })}
      onClick={() => {
        onSelect(id);
        onNavigate?.();
      }}
    >
      <item.icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{item.label}</span>
    </button>
  );
}

/** True when this item, or anything under it, is the current section. */
function isActiveSection(item: AdminItem, section: Section): boolean {
  if (item.id === section) return true;
  return (item.children ?? []).some((child) => isActiveSection(child, section));
}

/**
 * A parent row ("Settings ▾"), not selectable itself. It opens on click and
 * opens by itself when one of its children is the current section, so a deep
 * link into Data retention never hides it. It takes the SAME active ink as a
 * child while one of those children is current, so the group never reads grey
 * next to the black active row under it.
 */
function SettingsGroup({
  item,
  section,
  onSelect,
  onNavigate,
}: {
  item: AdminItem;
  section: Section;
  onSelect: (section: Section) => void;
  onNavigate?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const expanded = open ?? isActiveSection(item, section);

  return (
    <Collapsible open={expanded} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={expanded}
          className={sidebarRowClass({ active: isActiveSection(item, section) })}
        >
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{item.label}</span>
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded ? "" : "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* Indented under a hairline so the children read as one group. */}
        <div className="ml-[0.9rem] space-y-0.5 border-l border-border/70 pl-3 pt-0.5">
          {(item.children ?? []).map((child) =>
            renderAdminRow(child, section, onSelect, onNavigate),
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
