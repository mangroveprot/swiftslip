import type { z } from "zod";

import { api, documentOf } from "@/lib/api-client";
import type { importBiometricInput } from "@swiftslip/shared/schemas";
import type { ImportedLog } from "@swiftslip/shared/types";

export const importBiometricFile = async ({
  data,
}: {
  data: z.input<typeof importBiometricInput>;
}) => documentOf(await api.post<ImportedLog>("/biometric-import", data));
