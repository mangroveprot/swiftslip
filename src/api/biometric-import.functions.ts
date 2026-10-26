import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import { assertAiQuota, recordAiRequest } from "@/server/services/ai-quota.server";
import { importBiometricFile as parseBiometricFile } from "@/server/services/biometric-import.server";
import { importBiometricInput } from "@/shared/schemas";

export const importBiometricFile = createServerFn({ method: "POST" })
  .validator(importBiometricInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertAiQuota(user);
    const result = await parseBiometricFile(data);
    await recordAiRequest(user, "Biometric import");
    return result;
  });
