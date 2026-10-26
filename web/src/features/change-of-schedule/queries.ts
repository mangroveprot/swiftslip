import { queryOptions } from "@tanstack/react-query";

import { getCosAttachmentUrl, getCosForm, listCosForms } from "@/api/cos.functions";

export const cosFormsQueryOptions = () =>
  queryOptions({
    queryKey: ["cos-forms"],
    queryFn: () => listCosForms(),
    retry: false,
  });

export const cosFormQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["cos-form", id],
    queryFn: () => getCosForm({ data: { id } }),
    retry: false,
  });

export const cosAttachmentUrlQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["cos-attachment", id],
    queryFn: () => getCosAttachmentUrl({ data: { id } }),
    // Signed links stay valid for an hour — no need to churn them every 30 s.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
