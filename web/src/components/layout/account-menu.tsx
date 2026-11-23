/**
 * The account card's rows: Theme, My account, Install app, Sign out.
 *
 * ONE copy, rendered by the sidebar footer (SwiftSlip, Admin Panel, HR) and by
 * the Showroom Updates header, so the four rows, the theme cycle and the
 * sign-out confirmation can never drift apart between apps.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRightFromLine, Contrast, Monitor, Moon, Sun, User } from "lucide-react";
import type { ReactNode } from "react";

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

const THEME_LABEL = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const;

/**
 * The rows themselves. Render inside a `DropdownMenuContent`; the caller owns
 * the sign-out flow, because the confirmation must live OUTSIDE the menu.
 */
function AccountMenuItems({
  to,
  onSignOut,
}: {
  /** The My Account route for this app (`/profile` or `/hr/profile`). */
  to?: string | undefined;
  /** Opens the sign-out confirmation, rendered by `AccountMenu`. */
  onSignOut: () => void;
}) {
  const { preference, cycle } = useTheme();
  const themeLabel = THEME_LABEL[preference];
  const ThemeIcon = preference === "dark" ? Moon : preference === "system" ? Monitor : Sun;

  return (
    <>
      {/* Theme first, then the account entries: it cycles in place on select,
          no navigation, no nested menu. */}
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
        onSelect={onSignOut}
        className={cn(
          SIDEBAR_MENU_ITEM,
          "text-destructive focus:bg-destructive/15 focus:text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive dark:focus:bg-destructive/15 dark:focus:text-destructive dark:data-[highlighted]:bg-destructive/15 dark:data-[highlighted]:text-destructive",
        )}
      >
        <ArrowRightFromLine className="size-4" aria-hidden="true" />
        Sign out
      </DropdownMenuItem>
    </>
  );
}

/**
 * The whole account card: the caller's trigger, the four rows, and the
 * sign-out confirmation.
 *
 * The modal is rendered NEXT TO the dropdown, not inside it. Radix unmounts a
 * menu's content as soon as an item is selected, so a confirmation living in
 * there vanished with the card — Sign out just closed the menu and asked
 * nothing. The app chooser never had that bug because `SignOutButton` keeps
 * its modal outside the trigger; this gives the card the same guarantee.
 */
export function AccountMenu({
  trigger,
  side = "bottom",
  align = "end",
  contentClassName,
  to,
  accessName,
}: {
  /** The button that opens the card; rendered through `DropdownMenuTrigger asChild`. */
  trigger: ReactNode;
  /** Which way the card opens from the trigger. */
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Extra classes on the card, e.g. the sidebar's trigger-width. */
  contentClassName?: string;
  /** The My Account route for this app (`/profile` or `/hr/profile`). */
  to?: string | undefined;
  /** Named in the sign-out warning ("... sign in again to access <name>"). */
  accessName?: string | undefined;
}) {
  const { open, modal } = useSignOutFlow({ accessName });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          side={side}
          align={align}
          sideOffset={8}
          className={cn(
            "z-[80] min-w-56 rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-lg",
            contentClassName,
          )}
        >
          <AccountMenuItems to={to} onSignOut={open} />
        </DropdownMenuContent>
      </DropdownMenu>
      {modal}
    </>
  );
}
