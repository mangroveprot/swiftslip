import { queryOptions } from "@tanstack/react-query";

import { listCodes } from "@/api/access-codes.functions";

export const accessCodesQueryOptions = () =>
  queryOptions({
    queryKey: ["codes"],
    queryFn: () => listCodes(),
  });
