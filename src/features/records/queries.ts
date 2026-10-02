import { queryOptions } from "@tanstack/react-query";

import { getRecord, getRecordAttachmentUrl, listRecords } from "@/api/records.functions";

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

export const recordAttachmentUrlQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["record-attachment", id],
    queryFn: () => getRecordAttachmentUrl({ data: { id } }),
    // Signed links stay valid for an hour — no need to churn them every 30 s.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
