import type { z } from "zod";

import { api, documentOf } from "@/lib/api-client";
import type { OrgLists } from "@swiftslip/shared/api-types";
import type {
  addOrgOptionInput,
  orgKindInput,
  renameOrgOptionInput,
} from "@swiftslip/shared/schemas";

/** Any signed-in account may read the lists; changing them is admin-only. */
export const listOrgOptions = async () => documentOf(await api.get<OrgLists>("/org-options"));

export const renameOrgOption = async ({ data }: { data: z.input<typeof renameOrgOptionInput> }) => {
  await api.patch("/org-options", data);
  return { ok: true as const };
};

export const deleteOrgOption = async ({ data }: { data: z.input<typeof orgKindInput> }) => {
  await api.delete("/org-options", { kind: data.kind, value: data.value });
  return { ok: true as const };
};

export const addOrgOption = async ({ data }: { data: z.input<typeof addOrgOptionInput> }) => {
  await api.post("/org-options", data);
  return { ok: true as const };
};
