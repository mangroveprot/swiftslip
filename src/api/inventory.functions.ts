/**
 * Server functions for the RGC asset-inventory module.
 *
 * The `/rgc-asset-inventory` route is admin-gated, so every call here requires
 * an admin session (`requireAdmin`) — same access rule as the original app.
 * All of these talk to the SEPARATE RGC database; nothing touches SwiftSlip's
 * Supabase tables.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/server/auth/session.server";
import * as assets from "@/server/inventory/assets.server";
import * as options from "@/server/inventory/options.server";
import * as reports from "@/server/inventory/reports.server";
import {
  assetSaveInput,
  createOptionInput,
  deleteAssetsInput,
  deleteOptionInput,
  renameOptionInput,
  reportBranchInput,
} from "@/shared/inventory";

export const getInventoryData = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return assets.listInventory();
});

export const saveAsset = createServerFn({ method: "POST" })
  .validator(assetSaveInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return assets.saveAsset(data);
  });

export const deleteAssets = createServerFn({ method: "POST" })
  .validator(deleteAssetsInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return assets.deleteAssets(data.ids);
  });

export const getManagedOptions = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return options.listManagedOptions();
});

/** Settings `+ Add` — returns warnings/errors instead of throwing so the page can toast. */
export const createOption = createServerFn({ method: "POST" })
  .validator(createOptionInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return options.createManagedOption(data.kind, data.name, data.category);
  });

export const renameOption = createServerFn({ method: "POST" })
  .validator(renameOptionInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return options.renameManagedOption(data.kind, data.id, data.name);
  });

export const deleteOption = createServerFn({ method: "POST" })
  .validator(deleteOptionInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return options.deleteManagedOption(data.kind, data.id);
  });

/** Drawer flow: create a missing option inline and return the new row (throws on failure). */
export const quickCreateOption = createServerFn({ method: "POST" })
  .validator(createOptionInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return options.quickCreateOption(data.kind, data.name, data.category);
  });

/** Report preview/download both start from this document (see reports.server.ts). */
export const getReportDocument = createServerFn({ method: "POST" })
  .validator(reportBranchInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return reports.buildReportDocument(data.branchId);
  });
