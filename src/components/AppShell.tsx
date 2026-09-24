import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { me, signOut } from "@/lib/dtr.functions";

export function useMe() {
  const whoAmI = useServerFn(me);
  return useQuery({
    queryKey: ["me"],
    queryFn: () => whoAmI(),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const doSignOut = useServerFn(signOut);
  const { data: who, isLoading } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !who) navigate({ to: "/" });
  }, [isLoading, who, navigate]);

  if (isLoading || !who) {
    return <main className="p-10 text-sm text-muted-foreground">Loading…</main>;
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await doSignOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[17rem_1fr] md:overflow-hidden print:block print:h-auto print:overflow-visible">
      <aside className="no-print hidden md:block md:h-dvh md:overflow-y-auto">
        <Sidebar role={who.role} label={who.label} onSignOut={handleSignOut} />
      </aside>

      <header className="no-print flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <span className="text-xl" style={{ fontFamily: "var(--font-display)" }}>
          SwiftSlip
        </span>
        <button className="btn btn-outline" onClick={() => setMenuOpen((v) => !v)}>
          {menuOpen ? "Close" : "Menu"}
        </button>
      </header>
      {menuOpen ? (
        <div className="no-print border-b md:hidden">
          <Sidebar
            role={who.role}
            label={who.label}
            onSignOut={handleSignOut}
            onNavigate={() => setMenuOpen(false)}
          />
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
    </div>
  );
}
