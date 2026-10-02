import { Link } from "@tanstack/react-router";
import { Hourglass, LayoutGrid } from "lucide-react";

import { APP } from "@/config/app";
import { roleLabel, NAV_ITEMS } from "./nav-items";
import { InstallButton } from "./InstallButton";
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
  const items = NAV_ITEMS;

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
        {items.map((item) => {
          const Icon = item.icon;
          return item.soon ? (
            <span
              key={item.to}
              className="flex cursor-not-allowed items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/70"
              title="Coming soon"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </span>
              <Hourglass
                className="size-4 shrink-0 text-muted-foreground/60"
                aria-label="Coming soon"
              />
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
              <span className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block">{item.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.note}</span>
                </span>
              </span>
            </Link>
          );
        })}
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
        {role === "admin" ? (
          <Link to="/choose" onClick={onNavigate} className="btn btn-outline w-full">
            <LayoutGrid className="size-4" aria-hidden="true" />
            Switch app
          </Link>
        ) : null}
        <InstallButton className="btn btn-outline w-full" />
        <button className="btn btn-outline w-full" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
