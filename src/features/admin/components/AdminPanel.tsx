import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, LogOut, Menu } from "lucide-react";
import { useState } from "react";

import { signOut } from "@/api/auth.functions";
import { APP } from "@/config/app";
import { sessionQueryOptions } from "@/features/auth/queries";
import { AdminDashboard } from "./AdminDashboard";
import { TemplateEditor } from "./TemplateEditor";
import { UserManagement } from "./UserManagement";

type Section = "dashboard" | "users" | "template";

const SECTIONS: { id: Section; label: string; note: string }[] = [
  { id: "dashboard", label: "Dashboard", note: "Totals & activity" },
  { id: "users", label: "User management", note: "Accounts & roles" },
  { id: "template", label: "DTR template", note: "Sheet headings" },
];

/**
 * The Admin Panel as its own page with its own chrome — reached from the
 * "Where would you like to go?" chooser, outside the SwiftSlip `_app` shell so
 * the portal's sidebar no longer carries admin navigation. The sidebar below
 * reuses the SwiftSlip sidebar's look (glass panel, same nav/button styles).
 */
export function AdminPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions());
  const [section, setSection] = useState<Section>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/", replace: true });
  }

  const sidebar = (
    <AdminSidebar
      section={section}
      onSelect={(next) => setSection(next)}
      label={session?.label}
      onSignOut={handleSignOut}
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
          className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out"
        >
          {section === "dashboard" ? (
            <AdminDashboard />
          ) : section === "users" ? (
            <UserManagement />
          ) : (
            <TemplateEditor />
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
  onSignOut,
  onNavigate,
}: {
  section: Section;
  onSelect: (section: Section) => void;
  label?: string | undefined;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col border-r border-white/40 bg-glass backdrop-blur-xl">
      <div className="px-6 py-6">
        <img src={APP.mindbridgeLogoPath} alt="Mindbridge" className="h-8 w-auto object-contain" />
        <span className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
          {APP.name}
        </span>
        <span className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Admin Panel
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={section === item.id ? "page" : undefined}
            className={
              section === item.id
                ? "block w-full rounded-md bg-accent-tint px-3 py-2 text-left text-sm font-medium text-accent-tint-foreground"
                : "block w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground"
            }
            onClick={() => {
              onSelect(item.id);
              onNavigate?.();
            }}
          >
            <span className="block">{item.label}</span>
            <span className="block text-[11px] text-muted-foreground">{item.note}</span>
          </button>
        ))}
      </nav>

      <div className="space-y-3 border-t px-4 py-4 text-sm">
        <div>
          <p className="font-medium">{label || "Administrator"}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Administrator</p>
        </div>
        <Link to="/choose" onClick={onNavigate} className="btn btn-outline w-full">
          <LayoutGrid className="size-4" aria-hidden="true" />
          All apps
        </Link>
        <button className="btn btn-outline w-full" onClick={onSignOut}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}
