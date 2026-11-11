import { queryOptions } from "@tanstack/react-query";

import { getLiqAttachmentUrl, getLiqForm, listLiqForms } from "@/api/liquidation.functions";

export const liqFormsQueryOptions = () =>
  queryOptions({
    queryKey: ["liq-forms"],
    queryFn: () => listLiqForms(),
    retry: false,
  });

export const liqFormQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["liq-form", id],
    queryFn: () => getLiqForm({ data: { id } }),
    retry: false,
  });

/** Signed link for the uploaded approval slip (absent when none). */
export const liqAttachmentUrlQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["liq-attachment", id],
    queryFn: () => getLiqAttachmentUrl({ data: { id } }),
    retry: false,
  });
