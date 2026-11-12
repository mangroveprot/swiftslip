import { Link } from "@tanstack/react-router";
import {
  ArrowRightFromLine,
  ChevronsUpDown,
  Contrast,
  Monitor,
  Moon,
  Sun,
  User,
} from "lucide-react";
import type { ReactNode } from "react";

import { BrandLockup } from "@/components/common/BrandLockup";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { useSignOutFlow } from "@/components/common/SignOutButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

import { InstallAppItem } from "./InstallAppItem";
import { SIDEBAR_MENU_ITEM } from "./sidebar-classes";

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
 * The Regasco-style SwiftSlip lockup (plus an optional caption such as
 * "Admin Panel") over a hairline divider. The same mark on every sidebar,
 * regardless of the employee's employer. `linkHome` wraps the block in a link
 * back to the portal's landing screen, mirroring the old header.
 */
export function SidebarBrand({ subtitle, linkHome }: { subtitle?: string; linkHome?: boolean }) {
  const body = (
    <>
      <BrandLockup imageClassName="h-10" wordClassName="text-2xl" />
      {subtitle ? (
        <span className="mt-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
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

const THEME_LABEL = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const;

/**
 * Footer pinned under the nav. Utility rows come first (Notifications / Switch
 * app), then the signed-in identity at the very bottom. That identity is one
 * button: it opens a solid card upward with Theme, My account, Install app and
 * Sign out.
 *
 * Theme lives INSIDE that card, as its first row, rather than as a footer row
 * of its own — one press cycles Light → Dark → System in place; the icon is
 * the half-moon, the one mark for "theme", and the current preference with its
 * own state icon reads on the right.
 *
 * `photo` is the profile picture when the person has set one; without it the
 * avatar falls back to their initials, so the footer never renders an empty
 * circle while the profile query is still in flight. The whole row is one
 * target with an up/down arrow.
 *
 * `to` is the My Account route for this app (`/profile` or `/hr/profile`).
 */
export function SidebarFooter({
  name,
  photo,
  sublabel,
  to,
  signOutAccessName,
  children,
}: {
  name: string;
  photo?: string | undefined;
  sublabel?: ReactNode;
  /** The My Account route that the menu's first item opens. */
  to?: string | undefined;
  /** Named in the sign-out warning ("…sign in again to access <name>"). */
  signOutAccessName?: string | undefined;
  children: ReactNode;
}) {
  const { open: openSignOut, modal: signOutModal } = useSignOutFlow({
    accessName: signOutAccessName,
  });
  const { preference, cycle } = useTheme();
  const themeLabel = THEME_LABEL[preference];
  const ThemeIcon = preference === "dark" ? Moon : preference === "system" ? Monitor : Sun;

  const identity = (
    <>
      <ProfileAvatar photo={photo} name={name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {sublabel ? (
          <span className="block truncate text-xs text-muted-foreground">{sublabel}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <footer className="shrink-0 border-t border-border px-2 py-3">
      <div className="space-y-0.5">{children}</div>
      <div className="mt-2 flex items-center px-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${name} — open account menu`}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-muted/60"
            >
              {identity}
              <ChevronsUpDown
                className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-data-[state=open]:opacity-100"
                aria-hidden="true"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="z-[80] w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-lg"
          >
            {/* Theme first, then the account entries: it cycles in place on
                select — no navigation, no nested menu. */}
            <DropdownMenuItem
              onSelect={cycle}
              className={cn(SIDEBAR_MENU_ITEM, "flex items-center gap-2")}
              aria-label={`Theme: ${themeLabel}. Click to change.`}
            >
              <Contrast className="size-4" aria-hidden="true" />
              Theme
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                {themeLabel}
                <ThemeIcon className="size-3.5" aria-hidden="true" />
              </span>
            </DropdownMenuItem>
            {to ? (
              <DropdownMenuItem asChild>
                <Link to={to} className={cn("flex w-full items-center gap-2", SIDEBAR_MENU_ITEM)}>
                  <User className="size-4" aria-hidden="true" />
                  My account
                </Link>
              </DropdownMenuItem>
            ) : null}
            {/* No divider: Theme sits above My account, Install app is a quiet
                utility row, and Sign out closes the card. */}
            <InstallAppItem />
            <DropdownMenuItem
              onSelect={() => openSignOut()}
              className={cn(
                SIDEBAR_MENU_ITEM,
                "text-destructive focus:bg-destructive/15 focus:text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive dark:focus:bg-destructive/15 dark:focus:text-destructive dark:data-[highlighted]:bg-destructive/15 dark:data-[highlighted]:text-destructive",
              )}
            >
              <ArrowRightFromLine className="size-4" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {signOutModal}
    </footer>
  );
}
