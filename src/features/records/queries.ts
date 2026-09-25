import { queryOptions } from "@tanstack/react-query";

import { getRecord, listRecords } from "@/api/records.functions";

export const recordsQueryOptions = () =>
  queryOptions({
    queryKey: ["records"],
    queryFn: () => listRecords(),
    retry: false,
  });

export const recordQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["record", id],
    queryFn: () => getRecord({ data: { id } }),
    retry: false,
  });
