import { queryOptions } from "@tanstack/react-query";

import { getTemplate } from "@/api/template.functions";

export const templateQueryOptions = () =>
  queryOptions({
    queryKey: ["template"],
    queryFn: () => getTemplate(),
    retry: false,
  });
