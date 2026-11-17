import type { BackupRun, BackupTrigger } from '@swiftslip/shared/schemas';

/**
 * Settings → Backup, as the service holds it.
 *
 * The wire shapes live in `shared/src/schemas.ts`; these stay inside the module
 * so a controller never reads a database row and the web app never sees the
 * sealed refresh token. `sealedRefreshToken` is ciphertext, never the token.
 */
export type BackupConfig = {
  enabled: boolean;
  keepCount: number;
  folderId: string | null;
  folderName: string;
  /** AES-256-GCM ciphertext, opened only to call Google. */
  sealedRefreshToken: string | null;
  accountEmail: string | null;
  connectedAt: string | null;
  cronToken: string | null;
  oauthState: string | null;
  oauthStateAt: string | null;
  updatedAt: string;
  updatedByName: string | null;
  lastRunAt: string | null;
};

/** One finished dump, in the shape the page lists. */
export type { BackupRun, BackupTrigger };
