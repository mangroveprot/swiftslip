/**
 * Pure display/filter helpers for the RGC Asset Inventory — ports of the
 * original C# `AssetDisplayHelpers` plus the small inline helpers that lived
 * in `Home.razor` / `AssetRow.razor`.
 */
import type { InventoryStatusOption } from "@/shared/inventory";

/** Maps `status_options.color_tag` (green/amber/red/blue/slate…) to badge classes. */
export function statusBadgeClasses(status: InventoryStatusOption | null): string {
  switch (status?.color_tag?.trim().toLowerCase()) {
    case "green":
      return "text-emerald-700 border-emerald-200/70 bg-emerald-50/70";
    case "amber":
    case "yellow":
      return "text-amber-800 border-amber-200/70 bg-amber-50/70";
    case "red":
      return "text-rose-700 border-rose-200/70 bg-rose-50/70";
    case "blue":
      return "text-sky-700 border-sky-200/70 bg-sky-50/70";
    default:
      return "text-slate-600 border-slate-200/70 bg-slate-50/80";
  }
}

/** Soft condition chips (Good / Unstable / Broken…). */
export function conditionBadgeClasses(conditionName: string | null | undefined): string {
  const key = conditionName?.trim().toLowerCase() ?? "";
  if (key.includes("good") || key.includes("excellent") || key.includes("new"))
    return "text-emerald-700 border-emerald-200/70 bg-emerald-50/70";
  if (key.includes("unstable") || key.includes("fair") || key.includes("worn"))
    return "text-amber-800 border-amber-200/70 bg-amber-50/70";
  if (
    key.includes("broken") ||
    key.includes("damaged") ||
    key.includes("poor") ||
    key.includes("fault")
  )
    return "text-rose-700 border-rose-200/70 bg-rose-50/70";
  return "text-slate-600 border-slate-200/70 bg-slate-50/80";
}

/** True when the asset type's category marks it as desktop-class. */
export function isDesktopCategory(type: { category: string } | null | undefined): boolean {
  return type != null && type.category.trim().toLowerCase() === "desktop";
}

/** "1st" → "1st Floor"; values already ending in "Floor" stay unchanged. */
export function formatFloorDisplay(floorLabel: string | null | undefined): string {
  if (floorLabel == null || floorLabel.trim() === "") return "";
  const value = floorLabel.trim();
  return /floor$/i.test(value) ? value : `${value} Floor`;
}

export function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/** OrdinalIgnoreCase string comparison (matches `StringComparer.OrdinalIgnoreCase`). */
export function compareOrdinalIgnoreCase(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  return 0;
}

/**
 * Distinct (case-insensitive, first occurrence wins) + ordered, for the floor
 * tab strip and the drawer's floor options — mirrors
 * `Distinct(OrdinalIgnoreCase).OrderBy(f, OrdinalIgnoreCase)`.
 */
export function distinctSortedFloorLabels(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    if (raw == null || raw.trim() === "") continue;
    const trimmed = raw.trim();
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort(compareOrdinalIgnoreCase);
}
