import { createServerFn } from "@tanstack/react-start";

import { requireAdmin, requireUser } from "@/server/auth/session.server";
import { logActivity } from "@/server/services/activity-log.server";
import * as accessCodes from "@/server/services/access-codes.server";
import { changePasswordInput, idInput, upsertCodeInput } from "@/shared/schemas";

export const listCodes = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return await accessCodes.listAccessCodes();
});

export const upsertCode = createServerFn({ method: "POST" })
  .validator(upsertCodeInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    await accessCodes.upsertAccessCode(data);
    await logActivity({
      action: data.id ? "user.updated" : "user.created",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: data.idNumber,
      detail: `role: ${data.role}${data.id && data.password ? ", password reset" : ""}`,
    });
    return { ok: true as const };
  });

export const deleteCode = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const removed = await accessCodes.deleteAccessCode(data.id);
    await logActivity({
      action: "user.deleted",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: removed.idNumber,
    });
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
