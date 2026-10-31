import { api, documentOf } from "@/lib/api-client";
import type {
  StorageBackend,
  StorageCleanupResult,
  StorageOrphanDeleteResult,
  StorageOrphanPreview,
  StorageOverview,
  StorageSettings,
  StorageSettingsDoc,
  StorageOrphansDeleteInput,
} from "@swiftslip/shared/schemas";

/**
 * Settings → Storage: the admin's view of both backends (usage, the rule that
 * picks where new uploads go, and the manual orphan cleanup). Everything here
 * is admin-only on the API side, every route behind `authorizeAdmin`.
 */

/** The overview the Storage page renders. `refresh` skips the server cache. */
export const getStorageOverview = async ({ refresh }: { refresh?: boolean } = {}) =>
  documentOf(
    await api.get<StorageOverview>("/admin/storage", { refresh: refresh ? "true" : undefined }),
  );

/** Save the rule (which backend gets new uploads, and the overflow threshold). */
export const saveStorageSettings = async ({ data }: { data: StorageSettings }) =>
  documentOf(await api.put<StorageSettingsDoc>("/admin/storage", data));

/** Delete the unreferenced files of one backend. Permanent — confirm first. */
export const cleanupStorageOrphans = async ({ data }: { data: { backend: StorageBackend } }) =>
  documentOf(await api.post<StorageCleanupResult>("/admin/storage/orphans", data));

/** Delete the unreferenced files of BOTH backends. Permanent — confirm first. */
export const cleanupStorageOrphansEverywhere = async () =>
  documentOf(
    await api.post<{ supabase: StorageCleanupResult; b2: StorageCleanupResult }>(
      "/admin/storage/orphans/everywhere",
    ),
  );

/**
 * The orphan list behind the cleanup modal — read-only. Every entry says
 * which backend holds it, why it is orphaned, when it was last touched and
 * how big it is; nothing is deleted here.
 */
export const previewStorageOrphans = async ({
  data,
}: { data?: { backend?: StorageBackend | "everywhere" } } = {}) =>
  documentOf(
    await api.get<StorageOrphanPreview>("/admin/storage/orphans/preview", {
      backend: data?.backend ?? "everywhere",
    }),
  );

/**
 * Delete exactly the orphaned files the admin ticked in the modal. The API
 * re-checks each key (still orphaned? still past the grace period?) so a
 * stale row can never take a live file.
 */
export const deleteStorageOrphans = async ({ data }: { data: StorageOrphansDeleteInput }) =>
  documentOf(await api.post<StorageOrphanDeleteResult[]>("/admin/storage/orphans/delete", data));
