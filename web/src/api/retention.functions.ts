import { api, documentOf } from "@/lib/api-client";
import type {
  CleanupRunSummary,
  RetentionPreview,
  RetentionSettings,
  RetentionSettingsDoc,
} from "@swiftslip/shared/schemas";

/** The saved retention setting (defaults when none was saved yet). */
export const getRetentionSettings = async () =>
  documentOf(await api.get<RetentionSettingsDoc>("/admin/retention"));

export const saveRetentionSettings = async ({ data }: { data: RetentionSettings }) => {
  await api.put("/admin/retention", data);
  return { ok: true as const };
};

/**
 * Count what a draft of the settings would delete. The draft travels in the
 * body so an admin can preview changes without saving them first; an empty
 * body previews the saved settings.
 */
export const previewRetentionCleanup = async ({
  data,
}: {
  data?: { settings?: RetentionSettings };
} = {}) => documentOf(await api.post<RetentionPreview>("/admin/retention/preview", data ?? {}));

/** Run the cleanup with the SAVED settings. Permanent — always confirm first. */
export const runRetentionCleanup = async () =>
  documentOf(await api.post<CleanupRunSummary>("/admin/retention/run"));

/** The newest row of `cleanup_runs`, or null when nothing has run yet. */
export const getLastCleanupRun = async () =>
  documentOf(await api.get<CleanupRunSummary | null>("/admin/retention/runs/last"));
