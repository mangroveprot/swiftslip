import { queryOptions } from "@tanstack/react-query";

import { getObAttachmentUrl, getObForm, listObForms } from "@/api/official-business.functions";

export const obFormsQueryOptions = () =>
  queryOptions({
    queryKey: ["ob-forms"],
    queryFn: () => listObForms(),
    retry: false,
  });

export const obFormQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["ob-form", id],
    queryFn: () => getObForm({ data: { id } }),
    retry: false,
  });

export const obAttachmentUrlQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["ob-attachment", id],
    queryFn: () => getObAttachmentUrl({ data: { id } }),
    // Signed links stay valid for an hour — no need to churn them every 30 s.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
