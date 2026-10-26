import type { z } from "zod";

import { api, documentOf } from "@/lib/api-client";
import type { employeeProfileSchema } from "@swiftslip/shared/schemas";
import type { EmployeeProfile } from "@swiftslip/shared/types";

export const getMyProfile = async () => documentOf(await api.get<EmployeeProfile>("/profile/me"));

export const saveMyProfile = async ({ data }: { data: z.input<typeof employeeProfileSchema> }) =>
  documentOf(await api.put<EmployeeProfile>("/profile/me", data));
