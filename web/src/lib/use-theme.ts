import { useCallback, useEffect, useState } from "react";

import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  setThemePreference,
  watchSystemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

/**
 * The theme switch as React state.
 *
 * Reads the saved preference once, stays subscribed to the OS setting while
 * the preference is `system`, and writes through `setThemePreference` so
 * storage and the DOM never disagree. Every consumer gets the same answer
 * because they all read the same key — no context provider needed for
 * something this small.
 *
 * The initial state is read lazily, and `applyTheme` runs in the effect
 * rather than during render: the class on <html> is already correct before
 * React mounts (see the pre-paint script in index.html), so rendering only
 * mirrors what is painted — no flash, and nothing to undo on the server side.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference));

  // Paint the current choice, and follow the OS while on `system`.
  useEffect(() => {
    const paint = (next: ResolvedTheme) => {
      setResolved(next);
      applyTheme(next);
    };

    paint(resolveTheme(preference));

    if (preference !== "system") return;
    return watchSystemTheme(paint);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setResolved(setThemePreference(next));
  }, []);

  /** Light → Dark → System → Light. One button, no menu to open. */
  const cycle = useCallback(() => {
    setPreference(preference === "light" ? "dark" : preference === "dark" ? "system" : "light");
  }, [preference, setPreference]);

  return { preference, resolved, setPreference, cycle };
}
