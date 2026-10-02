/** Plain-English label for every activity-log action — shared by the admin
 *  dashboard's side panels and the full activity-logs table. */
export const ACTION_LABELS: Record<string, string> = {
  "signin.success": "Signed in",
  "signin.failed": "Sign-in failed",
  "ob.created": "OB created",
  "ob.deleted": "OB removed",
  "record.created": "DTR record created",
  "record.deleted": "DTR record removed",
  "attachment.uploaded": "Approval slip uploaded",
  "attachment.removed": "Approval slip removed",
  "user.created": "Account created",
  "user.updated": "Account updated",
  "user.deleted": "Account removed",
  "asset.created": "Asset created",
  "asset.updated": "Asset edited",
  "report.downloaded": "Report downloaded",
};

/** Actions that failed or destroyed data (failed sign-ins, removals) — red. */
const DANGER_ACTIONS = new Set([
  "signin.failed",
  "user.deleted",
  "ob.deleted",
  "record.deleted",
  "attachment.removed",
]);

/** Actions that changed something that already existed (edits) — amber, as a warning. */
const WARNING_ACTIONS = new Set(["user.updated", "asset.updated"]);

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
