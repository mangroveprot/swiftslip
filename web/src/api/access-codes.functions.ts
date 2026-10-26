import type { z } from "zod";

import { api, documentsOf, seg } from "@/lib/api-client";
import type { AccountListItem } from "@swiftslip/shared/api-types";
import type { changePasswordInput, idInput, upsertCodeInput } from "@swiftslip/shared/schemas";

export const listCodes = async () => documentsOf(await api.get<AccountListItem>("/users"));

/** Create (no `id`) or edit (with `id`) an account. Blank password keeps the current one. */
export const upsertCode = async ({ data }: { data: z.input<typeof upsertCodeInput> }) => {
  const { id, ...body } = data;
  if (id) await api.patch(`/users/${seg(id)}`, body);
  else await api.post("/users", body);
  return { ok: true as const };
};

export const deleteCode = async ({ data }: { data: z.input<typeof idInput> }) => {
  await api.delete(`/users/${seg(data.id)}`);
  return { ok: true as const };
};

/** Any signed-in user changes the password of the account they're using. */
export const changeMyPassword = async ({ data }: { data: z.input<typeof changePasswordInput> }) => {
  await api.post("/auth/change-password", data);
  return { ok: true as const };
};
