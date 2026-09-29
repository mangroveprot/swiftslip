import { queryOptions } from "@tanstack/react-query";

import { getObForm, listObForms } from "@/api/official-business.functions";

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
