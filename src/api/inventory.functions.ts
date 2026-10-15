/**
 * Server functions for the RGC asset-inventory module.
 *
 * Every call here requires access to the `inventory` application — granted
 * automatically to admins, and grantable to a non-admin account through the
 * Admin Panel → App access rules (by user, Department or Position). The check
 * is `requireApp`, not the old blanket `requireAdmin`, so a granted staff
 * account can now use the module.
 *
 * SECURITY NOTE: this is a deliberate loosening. Previously only an admin could
 * reach any of this; now a rule can hand these powers to a non-admin. The
 * rules themselves are authored under the Admin Panel, which is role-gated.
 *
 * All of these talk to the SEPARATE RGC database; nothing touches SwiftSlip's
 * Supabase tables.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireApp } from "@/server/auth/access.server";
import * as assets from "@/server/inventory/assets.server";
import * as options from "@/server/inventory/options.server";
import * as reports from "@/server/inventory/reports.server";
import { logActivity } from "@/server/services/activity-log.server";
import {
  assetSaveInput,
  createOptionInput,
  deleteAssetsInput,
  deleteOptionInput,
  renameOptionInput,
  reportBranchInput,
  reportDownloadInput,
} from "@/shared/inventory";

export const getInventoryData = createServerFn({ method: "GET" }).handler(async () => {
  await requireApp("inventory");
  return assets.listInventory();
});

export const saveAsset = createServerFn({ method: "POST" })
  .validator(assetSaveInput)
  .handler(async ({ data }) => {
    const admin = await requireApp("inventory");
    const saved = await assets.saveAsset(data);
    await logActivity({
      action: data.assetId == null ? "asset.created" : "asset.updated",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: data.itemId ? `Asset ${data.itemId}` : `Asset #${saved.assetId}`,
      detail: data.assignedTo || null,
    });
    return saved;
  });

export const deleteAssets = createServerFn({ method: "POST" })
  .validator(deleteAssetsInput)
  .handler(async ({ data }) => {
    await requireApp("inventory");
    return assets.deleteAssets(data.ids);
  });

export const getManagedOptions = createServerFn({ method: "GET" }).handler(async () => {
  await requireApp("inventory");
  return options.listManagedOptions();
});

/** Settings `+ Add` — returns warnings/errors instead of throwing so the page can toast. */
export const createOption = createServerFn({ method: "POST" })
  .validator(createOptionInput)
  .handler(async ({ data }) => {
    await requireApp("inventory");
    return options.createManagedOption(data.kind, data.name, data.category);
  });

export const renameOption = createServerFn({ method: "POST" })
  .validator(renameOptionInput)
  .handler(async ({ data }) => {
    await requireApp("inventory");
    return options.renameManagedOption(data.kind, data.id, data.name);
  });

export const deleteOption = createServerFn({ method: "POST" })
  .validator(deleteOptionInput)
  .handler(async ({ data }) => {
    await requireApp("inventory");
    return options.deleteManagedOption(data.kind, data.id);
  });

/** Drawer flow: create a missing option inline and return the new row (throws on failure). */
export const quickCreateOption = createServerFn({ method: "POST" })
  .validator(createOptionInput)
  .handler(async ({ data }) => {
    await requireApp("inventory");
    return options.quickCreateOption(data.kind, data.name, data.category);
  });

/** Report preview/download both start from this document (see reports.server.ts). */
export const getReportDocument = createServerFn({ method: "POST" })
  .validator(reportBranchInput)
  .handler(async ({ data }) => {
    await requireApp("inventory");
    return reports.buildReportDocument(data.branchId);
  });

/** Reports page: records who downloaded the Excel report (built client-side). */
export const logReportDownload = createServerFn({ method: "POST" })
  .validator(reportDownloadInput)
  .handler(async ({ data }) => {
    const admin = await requireApp("inventory");
    await logActivity({
      action: "report.downloaded",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: `Report for ${data.branchName}`,
    });
  });
