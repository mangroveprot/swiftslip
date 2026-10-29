/** Re-exported so the dashboard keeps importing labels from this module. */
export { ACTION_LABELS } from "@swiftslip/shared/activity";

/** Actions that failed or destroyed data (failed sign-ins, removals) — red. */
const DANGER_ACTIONS = new Set([
  "signin.failed",
  "user.deleted",
  "ob.deleted",
  "loa.deleted",
  "cos.deleted",
  "ot.deleted",
  "record.deleted",
  "attachment.removed",
  "cleanup.forms",
]);

/** Actions that changed something that already existed (edits) — amber, as a warning. */
const WARNING_ACTIONS = new Set(["user.updated", "asset.updated", "access.updated"]);

/**
 * Shared pill styling for a log action — red for failures/removals, amber
 * (warning) for edits, neutral gray for everything else (creations, sign-ins).
 */
export function actionPillClass(action: string) {
  if (DANGER_ACTIONS.has(action)) {
    return "inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive";
  }
  if (WARNING_ACTIONS.has(action)) {
    return "inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700";
  }
  return "inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";
}
