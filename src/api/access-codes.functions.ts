import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/server/auth/session.server";
import * as accessCodes from "@/server/services/access-codes.server";
import { idInput, upsertCodeInput } from "@/shared/schemas";

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
