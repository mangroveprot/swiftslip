import { queryOptions } from "@tanstack/react-query";

import {
  getOtAttachmentUrl,
  getOtForm,
  getOtOtherAttachmentUrls,
  listOtForms,
} from "@/api/ot.functions";

export const otFormsQueryOptions = () =>
  queryOptions({
    queryKey: ["ot-forms"],
    queryFn: () => listOtForms(),
    retry: false,
  });

export const otFormQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["ot-form", id],
    queryFn: () => getOtForm({ data: { id } }),
    retry: false,
  });

export const otAttachmentUrlQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["ot-attachment", id],
    queryFn: () => getOtAttachmentUrl({ data: { id } }),
    // Signed links stay valid for an hour — no need to churn them every 30 s.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

export const otOtherUrlsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["ot-other-urls", id],
    queryFn: () => getOtOtherAttachmentUrls({ data: { id } }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
