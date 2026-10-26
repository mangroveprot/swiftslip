import { queryOptions } from "@tanstack/react-query";

import {
  getLoaAttachmentUrl,
  getLoaForm,
  getLoaOtherAttachmentUrls,
  listLoaForms,
} from "@/api/loa.functions";

export const loaFormsQueryOptions = () =>
  queryOptions({
    queryKey: ["loa-forms"],
    queryFn: () => listLoaForms(),
    retry: false,
  });

export const loaFormQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["loa-form", id],
    queryFn: () => getLoaForm({ data: { id } }),
    retry: false,
  });

export const loaAttachmentUrlQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["loa-attachment", id],
    queryFn: () => getLoaAttachmentUrl({ data: { id } }),
    // Signed links stay valid for an hour — no need to churn them every 30 s.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

export const loaOtherUrlsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["loa-other-urls", id],
    queryFn: () => getLoaOtherAttachmentUrls({ data: { id } }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
