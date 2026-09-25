import { createServerFn } from "@tanstack/react-start";

import { requireAdmin, requireUser } from "@/server/auth/session.server";
import * as accessCodes from "@/server/services/access-codes.server";
import { changePasswordInput, idInput, upsertCodeInput } from "@/shared/schemas";

export const listCodes = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return await accessCodes.listAccessCodes();
});

export const upsertCode = createServerFn({ method: "POST" })
  .validator(upsertCodeInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    await accessCodes.upsertAccessCode(data);
    return { ok: true as const };
  });

export const deleteCode = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    await accessCodes.deleteAccessCode(data.id);
    return { ok: true as const };
  });

/** Any signed-in user changes the password of the access code they're using. */
export const changeMyPassword = createServerFn({ method: "POST" })
  .validator(changePasswordInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await accessCodes.changeOwnPassword(user.id, data.currentPassword, data.newPassword);
    return { ok: true as const };
  });
