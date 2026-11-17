import { api, documentOf } from "@/lib/api-client";
import type { BackupOverview, BackupRun, BackupSettingsInput } from "@swiftslip/shared/schemas";

/**
 * Settings → Backup: the Drive connection, the schedule switch, the trigger
 * link and the run history. Every call here is admin-only on the API side
 * (`/admin/backup`, behind `authorizeAdmin`).
 *
 * The Google handshake is not here on purpose: it is a real browser redirect
 * (`GET /admin/backup/google/start`), so the page asks for the URL and sends
 * the window to it.
 */

/** The whole page in one read. */
export const getBackupOverview = async () =>
  documentOf(await api.get<BackupOverview>("/admin/backup"));

/** The two editable settings. Everything else has its own action. */
export const saveBackupSettings = async ({ data }: { data: BackupSettingsInput }) =>
  documentOf(await api.put<BackupOverview>("/admin/backup", data));

/** Where to send the browser to grant Drive access. */
export const startGoogleDriveConnect = async () =>
  documentOf(await api.get<{ url: string }>("/admin/backup/google/start"));

/** Forget the connection (and revoke it on Google's side). */
export const disconnectGoogleDrive = async () =>
  documentOf(await api.post<BackupOverview>("/admin/backup/google/disconnect"));

/** Replace the trigger token. The old link stops working immediately. */
export const rotateBackupLink = async () =>
  documentOf(await api.post<BackupOverview>("/admin/backup/link"));

/** "Back up now" — waits for the dumps, so the toast can report every file. */
export const runBackupNow = async () =>
  documentOf(await api.post<BackupRun[]>("/admin/backup/run"));
