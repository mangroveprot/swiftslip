import { queryOptions } from "@tanstack/react-query";

import { getInventoryData, getManagedOptions, getReportDocument } from "@/api/inventory.functions";

/** Everything the inventory shell + assets page need (loaded once, filtered client-side). */
export const inventoryQueryOptions = () =>
  queryOptions({
    queryKey: ["inventory"],
    queryFn: () => getInventoryData(),
    retry: false,
  });

/** Admin Settings section: options with usage counts. */
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
