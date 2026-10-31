import type { z } from "zod";

import { api, documentsOf, seg } from "@/lib/api-client";
import type { AccountListItem } from "@swiftslip/shared/api-types";
import type { changePasswordInput, idInput, upsertCodeInput } from "@swiftslip/shared/schemas";
import type { AccountPhoto } from "@swiftslip/shared/types";

export const listCodes = async () => documentsOf(await api.get<AccountListItem>("/users"));

/**
 * Profile photos for a batch of account ids, as `{ id, photo }` pairs.
 *
 * Ids without a photo are simply absent from the answer — the caller draws
 * initials for those, so an empty list is the normal case for a new company,
 * not an error.
 */
export const getUserPhotos = async (ids: string[]) =>
  ids.length === 0
    ? []
    : documentsOf(await api.get<AccountPhoto>("/users/photos", { ids: ids.join(",") }));

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
