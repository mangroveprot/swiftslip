import { Download } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { promptInstall, showInstallHelp, useInstallPrompt } from "@/lib/pwa";
import { cn } from "@/lib/utils";

import { SIDEBAR_MENU_ITEM } from "./sidebar-classes";

/**
 * The account menu's "Install app" row, the one entry point for adding
 * SwiftSlip to a desktop or home screen.
 *
 * It stays visible on browsers that never offer the install prompt (Safari /
 * iOS / Firefox), where pressing it explains the manual "Add to Home Screen"
 * route instead of doing nothing. Once the app is running standalone the row
 * disappears: there is nothing left to install.
 */
export function InstallAppItem({ className }: { className?: string }) {
  const { installed, canInstall } = useInstallPrompt();

  if (installed) return null;

  async function install() {
    if (!canInstall) {
      showInstallHelp();
      return;
    }
    const outcome = await promptInstall();
    if (outcome === "unavailable") showInstallHelp();
  }

  return (
    <DropdownMenuItem
      onSelect={() => void install()}
      className={cn(SIDEBAR_MENU_ITEM, "flex items-center gap-2", className)}
      aria-label="Install SwiftSlip as an app"
    >
      <Download className="size-4" aria-hidden="true" />
      Install app
    </DropdownMenuItem>
  );
}
