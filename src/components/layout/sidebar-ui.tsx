import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { APP } from "@/config/app";

/**
 * Building blocks shared by the SwiftSlip portal sidebar and the Admin
 * Panel's — both should read as the same product, so the brand header, the
 * sectioned nav rows, the "Soon" pill and the user footer all live here
 * instead of being copied between the two.
 */

/** Full-height glass panel every sidebar renders inside. */
export function SidebarShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col border-r border-white/40 bg-glass backdrop-blur-xl">
      {children}
    </div>
  );
}

/**
 * Mindbridge logo + the app name (plus an optional caption such as
 * "Admin Panel") over a hairline divider. `linkHome` wraps the block in a
 * link back to the portal's landing screen, mirroring the old header.
 */
export function SidebarBrand({ subtitle, linkHome }: { subtitle?: string; linkHome?: boolean }) {
  const body = (
    <>
      <img src={APP.mindbridgeLogoPath} alt="Mindbridge" className="h-6 w-auto object-contain" />
      <span
        className="mt-1.5 block text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {APP.name}
      </span>
      {subtitle ? (
        <span className="mt-0.5 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {subtitle}
        </span>
      ) : null}
    </>
  );

  return (
    <header className="shrink-0 border-b border-border px-4 pb-4 pt-5">
      {linkHome ? (
        <Link to="/records" className="block">
          {body}
        </Link>
      ) : (
        body
      )}
    </header>
  );
}

/** Uppercase group heading ("RECORDS & FORMS") over one run of nav rows. */
export function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

/** Right-aligned pill marking a nav row whose screen isn't built yet. */
export function SidebarSoonBadge() {
  return (
    <span className="ml-auto shrink-0 rounded-full border border-border bg-white/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      Soon
    </span>
  );
}

/** "Gerald Vilaver" → "GV" — the initials shown in the footer avatar. */
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Footer pinned under the nav: avatar + the signed-in user's name over a
 * caption (role or employee number), then the plain icon rows passed as
 * children (Switch app / Install / Sign out).
 */
export function SidebarFooter({
  name,
  sublabel,
  children,
}: {
  name: string;
  sublabel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <footer className="shrink-0 border-t border-border px-2 py-4">
      <div className="flex items-center gap-3 px-2 pb-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {initialsOf(name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {sublabel ? (
            <span className="block truncate text-xs text-muted-foreground">{sublabel}</span>
          ) : null}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </footer>
  );
}
