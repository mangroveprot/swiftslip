import { api, documentOf } from "@/lib/api-client";
import type {
  StorageBackend,
  StorageOrphanDeleteResult,
  StorageOrphanPreview,
  StorageOrphanPreviewUrl,
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

/**
 * The orphan list behind the cleanup modal, read-only. Every entry says
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
 * Sign one image from the orphan list so the admin can see it before deleting
 * it. The API re-checks that the file is still unreferenced before signing.
 */
export const getStorageOrphanPreviewUrl = async ({
  key,
  backend,
}: {
  key: string;
  backend: StorageBackend;
}) =>
  documentOf(
    await api.get<StorageOrphanPreviewUrl>("/admin/storage/orphans/preview-url", {
      key,
      backend,
    }),
  );

/**
 * Delete exactly the orphaned files the admin ticked in the modal. The API
 * re-checks each key (still orphaned? still past the grace period?) so a
 * stale row can never take a live file.
 */
export const deleteStorageOrphans = async ({ data }: { data: StorageOrphansDeleteInput }) =>
  documentOf(await api.post<StorageOrphanDeleteResult[]>("/admin/storage/orphans/delete", data));
