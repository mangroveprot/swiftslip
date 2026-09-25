import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import * as profiles from "@/server/services/profiles.server";
import { employeeProfileSchema } from "@/shared/schemas";

export const getMyProfile = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return await profiles.getProfile(user.id);
});

export const saveMyProfile = createServerFn({ method: "POST" })
  .validator(employeeProfileSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await profiles.saveProfile(user.id, data);
  });
