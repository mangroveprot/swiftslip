import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";

import { APP } from "@/config/app";
import { roleLabel, visibleNavItems } from "./nav-items";
import type { Role } from "@/shared/types";

export function Sidebar({
  role,
  label,
  onSignOut,
  onNavigate,
}: {
  role: Role | undefined;
  label?: string;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  const items = visibleNavItems(role);

  return (
    <div className="flex h-full flex-col border-r border-white/40 bg-glass backdrop-blur-xl">
      <div className="px-6 py-6">
        <Link to="/records" className="block">
          <img
            src={APP.mindbridgeLogoPath}
            alt="Mindbridge"
            className="h-8 w-auto object-contain"
          />
          <span className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
            {APP.name}
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) =>
          item.soon ? (
            <span
              key={item.to}
              className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground/70"
              title="Coming soon"
            >
              {item.label}
              <Clock className="size-4 shrink-0 text-muted-foreground/60" aria-label="Coming soon" />
            </span>
          ) : (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground"
              activeProps={{
                className:
                  "block rounded-md bg-accent-tint px-3 py-2 text-sm font-medium text-accent-tint-foreground",
              }}
            >
              <span className="block">{item.label}</span>
              <span className="block text-[11px] text-muted-foreground">{item.note}</span>
            </Link>
          ),
        )}
      </nav>

      <div className="space-y-3 border-t px-4 py-4 text-sm">
        <div>
          <p className="font-medium">{label || roleLabel(role)}</p>
          {label && label !== roleLabel(role) ? (
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {roleLabel(role)}
            </p>
          ) : null}
        </div>
        <button className="btn btn-outline w-full" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
