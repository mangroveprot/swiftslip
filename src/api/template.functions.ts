import { createServerFn } from "@tanstack/react-start";

import { requireAdmin, requireUser } from "@/server/auth/session.server";
import * as template from "@/server/services/template.server";
import { dtrTemplateSchema } from "@/shared/schemas";

export const getTemplate = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  return await template.getTemplate();
});

export const saveTemplate = createServerFn({ method: "POST" })
  .validator(dtrTemplateSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    await template.saveTemplate(data);
    return { ok: true as const };
  });
