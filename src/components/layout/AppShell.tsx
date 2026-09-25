import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { signOut } from "@/api/auth.functions";
import { APP } from "@/config/app";
import type { SessionUser } from "@/shared/types";
import { Sidebar } from "./Sidebar";

/** Chrome (sidebar / mobile header) around every signed-in page. */
export function AppShell({ session, children }: { session: SessionUser; children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[17rem_1fr] md:overflow-hidden print:block print:h-auto print:overflow-visible">
      <aside className="no-print hidden md:block md:h-dvh md:overflow-y-auto">
        <Sidebar role={session.role} label={session.label} onSignOut={handleSignOut} />
      </aside>

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
        </span>
        <button className="btn btn-outline" onClick={() => setMenuOpen((v) => !v)}>
          {menuOpen ? "Close" : "Menu"}
        </button>
      </header>
      {menuOpen ? (
        <div className="no-print border-b md:hidden">
          <Sidebar
            role={session.role}
            label={session.label}
            onSignOut={handleSignOut}
            onNavigate={() => setMenuOpen(false)}
          />
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto print:overflow-visible">
        {children}
      </div>
    </div>
  );
}
