import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import { importBiometricFile as parseBiometricFile } from "@/server/services/biometric-import.server";
import { importBiometricInput } from "@/shared/schemas";

export const importBiometricFile = createServerFn({ method: "POST" })
  .validator(importBiometricInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await parseBiometricFile(data);
  });
