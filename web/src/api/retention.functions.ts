import { api, documentOf } from "@/lib/api-client";
import type {
  CleanupRunResult,
  CleanupRunSummary,
  RetentionPreview,
  RetentionRunForm,
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
 * body previews the saved settings. `includeItems` adds the per-form list the
 * review window shows.
 */
export const previewRetentionCleanup = async ({
  data,
}: {
  data?: { settings?: RetentionSettings; includeItems?: boolean };
} = {}) => documentOf(await api.post<RetentionPreview>("/admin/retention/preview", data ?? {}));

/**
 * Run the cleanup with the SAVED settings. `forms` is the selection the review
 * window left ticked, so the run deletes exactly what was shown and approved;
 * omitted, it sweeps everything the rule covers. Permanent, always confirm
 * first. The answer lists the forms that actually went (`deleted`), which is
 * what the page reports back to the admin.
 */
export const runRetentionCleanup = async (forms?: RetentionRunForm[]) =>
  documentOf(await api.post<CleanupRunResult>("/admin/retention/run", forms ? { forms } : {}));

/** The newest row of `cleanup_runs`, or null when nothing has run yet. */
export const getLastCleanupRun = async () =>
  documentOf(await api.get<CleanupRunSummary | null>("/admin/retention/runs/last"));
