import { queryOptions } from "@tanstack/react-query";

import { getAdminStatsFn } from "@/api/admin.functions";
import { listCodes } from "@/api/access-codes.functions";

export const accessCodesQueryOptions = () =>
  queryOptions({
    queryKey: ["codes"],
    queryFn: () => listCodes(),
  });

export const adminStatsQueryOptions = () =>
  queryOptions({
    queryKey: ["admin-stats"],
    queryFn: () => getAdminStatsFn(),
  });
