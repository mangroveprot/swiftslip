import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { APP } from "@/config/app";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Building blocks shared by the SwiftSlip portal sidebar and the Admin
 * Panel's — both should read as the same product, so the brand header, the
 * sectioned nav rows, the "Soon" pill and the user footer all live here
 * instead of being copied between the two.
 */

/**
 * Full-height panel every sidebar renders inside.
 *
 * The surface is an arbitrary-value `bg-[image:…]`, not a `--color-*` theme
 * entry: Tailwind's colour namespace only emits `background-color`, so a
 * gradient registered there silently renders nothing at all.
 */
export function SidebarShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col border-r border-border bg-[image:var(--sidebar-surface)]">
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
      <img src={APP.mindbridgeLogoPath} alt="Mindbridge" className="h-10 w-auto object-contain" />
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
    <span className="ml-auto shrink-0 rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      Soon
    </span>
  );
}

/**
 * Footer pinned under the nav: avatar + the signed-in user's name over a
 * caption (role or employee number), then the plain icon rows passed as
 * children (Switch app / Install / Sign out).
 * The theme toggle sits beside the name, at the top-right of the footer — the
 * one spot that is always visible in both the portal and the Admin Panel.
 *
 * `photo` is the profile picture when the person has set one; without it the
 * avatar falls back to their initials, so the footer never renders an empty
 * circle while the profile query is still in flight.
 */
export function SidebarFooter({
  name,
  photo,
  sublabel,
  children,
}: {
  name: string;
  photo?: string | undefined;
  sublabel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <footer className="shrink-0 border-t border-border px-2 py-4">
      <div className="flex items-center gap-3 px-2 pb-3">
        <ProfileAvatar photo={photo} name={name} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {sublabel ? (
            <span className="block truncate text-xs text-muted-foreground">{sublabel}</span>
          ) : null}
        </span>
        <ThemeToggle />
      </div>
      <div className="space-y-0.5">{children}</div>
    </footer>
  );
}
