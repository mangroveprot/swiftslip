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
};

/** Shared pill styling for a log action — red only for rejected sign-ins. */
export function actionPillClass(action: string) {
  return action === "signin.failed"
    ? "inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
    : "inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";
}
