import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/lib/theme";

/** Icon + wording per preference, so the tooltip and the icon never disagree. */
const LABELS: Record<ThemePreference, { label: string; hint: string }> = {
  light: { label: "Light", hint: "Switch to dark" },
  dark: { label: "Dark", hint: "Follow the system setting" },
  system: { label: "System", hint: "Switch to light" },
};

/**
 * Light → Dark → System in one press.
 *
 * A cycle rather than a menu: three states are few enough that a menu would be
 * more clicks than the button itself, and the icon always shows the state in
 * effect (a sun, a moon, or a monitor for "follow the system").
 *
 * The choice is remembered in this browser only — see `lib/theme.ts`.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, cycle } = useTheme();
  const { label, hint } = LABELS[preference];

  const Icon = preference === "dark" ? Moon : preference === "system" ? Monitor : Sun;

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      // Screen readers hear the state and the next stop; sighted users get the
      // same thing as a tooltip.
      aria-label={`Theme: ${label}. ${hint}.`}
      title={`Theme: ${label} — ${hint}`}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
