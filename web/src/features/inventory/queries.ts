import { queryOptions } from "@tanstack/react-query";

import { getInventoryData, getManagedOptions, getReportDocument } from "@/api/inventory.functions";
import { getShowroomLinkOptions, getShowrooms } from "@/api/showrooms.functions";

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
 * settings/asset invalidations refresh it for free. No staleTime: Status and
 * Action required are another app's rows, so every visit re-reads them rather
 * than showing what SwiftSlip said half a minute ago.
 */
export const showroomsQueryOptions = () =>
  queryOptions({
    queryKey: ["inventory", "showrooms"],
    queryFn: () => getShowrooms(),
    retry: false,
    staleTime: 0,
  });

/** The drawer's "Linked SwiftSlip showroom" picker: every Summary row. */
export const showroomLinkOptionsQueryOptions = () =>
  queryOptions({
    queryKey: ["inventory", "showrooms", "link-options"],
    queryFn: () => getShowroomLinkOptions(),
    retry: false,
    staleTime: 0,
  });
