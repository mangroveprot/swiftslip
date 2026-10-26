/**
 * Client for the inventory API (`/inventory/*`, served from the separate RGC
 * database). Every route needs access to the `inventory` app; the API enforces it.
 */
import type { z } from "zod";

import { api, ApiError, documentOf, seg } from "@/lib/api-client";
import type {
  assetSaveInput,
  CreatedOption,
  createOptionInput,
  deleteAssetsInput,
  deleteOptionInput,
  InventoryData,
  InventoryReportDocument,
  ManagedOptions,
  OptionMutationResult,
  renameOptionInput,
  reportBranchInput,
  reportDownloadInput,
} from "@swiftslip/shared/inventory";

export const getInventoryData = async () =>
  documentOf(await api.get<InventoryData>("/inventory/data"));

/** Create (no `assetId`) or edit (with it) one asset. */
export const saveAsset = async ({ data }: { data: z.input<typeof assetSaveInput> }) => {
  const { assetId, ...body } = data;
  const saved =
    assetId == null
      ? documentOf(await api.post<{ assetId: number }>("/inventory/assets", body))
      : documentOf(await api.put<{ assetId: number }>(`/inventory/assets/${seg(assetId)}`, body));
  return { ok: true as const, ...saved };
};

export const deleteAssets = async ({ data }: { data: z.input<typeof deleteAssetsInput> }) => {
  const result = documentOf(
    await api.post<{ deleted: number }>("/inventory/assets/bulk-delete", data),
  );
  return { ok: true as const, ...result };
};

export const getManagedOptions = async () =>
  documentOf(await api.get<ManagedOptions>("/inventory/options"));

/**
 * Settings mutations used to answer `{ ok:false, level, message }`; the API now
 * fails with the standard error shape and the toast level comes from the code:
 * a duplicate or an in-use option is a warning, everything else an error.
 * Lost connection / signed-out still throw, as before.
 */
const WARNING_CODES = new Set(["UNIQUE_FIELD_ERROR", "IN_USE_ERROR"]);

async function asMutationResult(run: () => Promise<unknown>): Promise<OptionMutationResult> {
  try {
    await run();
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status !== 0 && err.status !== 401 && err.status !== 403) {
      return {
        ok: false,
        level: WARNING_CODES.has(err.code) ? "warning" : "error",
        message: err.message,
      };
    }
    throw err;
  }
}

/** Settings `+ Add` — resolves to a warning/error result instead of throwing so the page can toast. */
export const createOption = ({ data }: { data: z.input<typeof createOptionInput> }) =>
  asMutationResult(() => api.post("/inventory/options", data));

export const renameOption = ({ data }: { data: z.input<typeof renameOptionInput> }) =>
  asMutationResult(() => api.patch("/inventory/options", data));

export const deleteOption = ({ data }: { data: z.input<typeof deleteOptionInput> }) =>
  asMutationResult(() => api.delete("/inventory/options", { kind: data.kind, id: data.id }));

/** Drawer flow: create a missing option inline and return the new row (throws on failure). */
export const quickCreateOption = async ({ data }: { data: z.input<typeof createOptionInput> }) =>
  documentOf(await api.post<CreatedOption>("/inventory/options/quick", data));

/** Report preview/download both start from this document. */
export const getReportDocument = async ({ data }: { data: z.input<typeof reportBranchInput> }) =>
  documentOf(await api.get<InventoryReportDocument>(`/inventory/reports/${seg(data.branchId)}`));

/** Reports page: records who downloaded the Excel report (built client-side). */
export const logReportDownload = async ({
  data,
}: {
  data: z.input<typeof reportDownloadInput>;
}) => {
  await api.post("/inventory/reports/downloads", data);
};
