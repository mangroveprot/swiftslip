import type { z } from "zod";

import { api, documentOf, seg } from "@/lib/api-client";
import type { AccessOverview } from "@swiftslip/shared/api-types";
import type { accessRuleInput, appDefaultInput, idInput } from "@swiftslip/shared/schemas";

/** Create or replace one rule (the API upserts). */
export const setAccessRule = async ({ data }: { data: z.input<typeof accessRuleInput> }) => {
  await api.put("/access/rules", data);
  return { ok: true as const };
};

/** Set (or clear) the default for one app across everyone no rule covers. */
export const setAppDefault = async ({ data }: { data: z.input<typeof appDefaultInput> }) => {
  await api.put("/access/defaults", data);
  return { ok: true as const };
};

export const deleteAccessRule = async ({ data }: { data: z.input<typeof idInput> }) => {
  await api.delete(`/access/rules/${seg(data.id)}`);
  return { ok: true as const };
};

export const getAccessOverview = async () =>
  documentOf(await api.get<AccessOverview>("/access/overview"));
