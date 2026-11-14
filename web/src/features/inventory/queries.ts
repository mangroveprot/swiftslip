import { queryOptions } from "@tanstack/react-query";

import { getInventoryData, getManagedOptions, getReportDocument } from "@/api/inventory.functions";
import { getShowrooms, getShowroomStock } from "@/api/showrooms.functions";

/** Everything the inventory shell + assets page need (loaded once, filtered client-side). */
export const inventoryQueryOptions = () =>
  queryOptions({
    queryKey: ["inventory"],
    queryFn: () => getInventoryData(),
    retry: false,
  });

/** Settings page: options with usage counts. */
export const managedOptionsQueryOptions = () =>
  queryOptions({
    queryKey: ["inventory", "options"],
    queryFn: () => getManagedOptions(),
    retry: false,
  });

/** Report preview: one document per branch (original `BuildDocumentAsync`). */
export const reportQueryOptions = (branchId: number) =>
  queryOptions({
    queryKey: ["inventory", "report", branchId],
    queryFn: () => getReportDocument({ data: { branchId } }),
    retry: false,
  });

/**
 * Showrooms board. Its key sits under `["inventory"]`, so the existing
 * settings/asset invalidations refresh it for free.
 */
export const showroomsQueryOptions = () =>
  queryOptions({
    queryKey: ["inventory", "showrooms"],
    queryFn: () => getShowrooms(),
    retry: false,
  });

/** The summary card's one editable number: total CCTV units owned. */
export const showroomStockQueryOptions = () =>
  queryOptions({
    queryKey: ["inventory", "showrooms", "stock"],
    queryFn: () => getShowroomStock(),
    retry: false,
  });
