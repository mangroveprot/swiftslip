import { cn } from "@/lib/utils";

/**
 * Class helpers for the shared sidebar (`sidebar-ui.tsx`). Kept in a
 * plain `.ts` module so that file exports components only and stays
 * fast-refresh friendly.
 */

/**
 * Row styling for every nav entry, active rows get the tinted pill, inert
 * ("soon") rows stay dimmed and can't take hover. Shared so the SwiftSlip
 * portal and the Admin Panel highlight identically.
 */
export function sidebarRowClass({
  active = false,
  disabled = false,
}: { active?: boolean; disabled?: boolean } = {}) {
  return cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
    disabled
      ? "cursor-not-allowed text-muted-foreground/70"
      : active
        ? "bg-accent-tint font-medium text-accent-tint-foreground dark:bg-white/10 dark:text-foreground"
        : "text-foreground/75 hover:bg-card/60 hover:text-foreground",
  );
}

/**
 * Plain icon + label row for a sidebar footer action (Notifications / Switch
 * app), deliberately NOT a `btn btn-outline` like the old sidebar used: the
 * portal mock keeps these quiet, so both sidebars' footers share this one
 * class.
 */
export const SIDEBAR_ACTION_CLASS =
  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground/75 transition-colors hover:bg-card/60 hover:text-foreground";

/**
 * Quiet row highlight inside the account menu. The shared menu item uses the
 * orange accent, which reads as a solid bar on the dark card.
 */
export const SIDEBAR_MENU_ITEM =
  "rounded-lg px-2 py-2 focus:bg-muted focus:text-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground dark:focus:bg-white/10 dark:focus:text-foreground dark:data-[highlighted]:bg-white/10 dark:data-[highlighted]:text-foreground";
