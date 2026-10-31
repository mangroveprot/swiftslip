import type { z } from "zod";

import { api, documentOf } from "@/lib/api-client";
import type { employeeProfileSchema, profilePhotoInput } from "@swiftslip/shared/schemas";
import type { EmployeeProfile } from "@swiftslip/shared/types";

export const getMyProfile = async () => documentOf(await api.get<EmployeeProfile>("/profile/me"));

export const saveMyProfile = async ({ data }: { data: z.input<typeof employeeProfileSchema> }) =>
  documentOf(await api.put<EmployeeProfile>("/profile/me", data));

/**
 * Save the photo alone — the profile page calls this as soon as the cropper is
 * confirmed, so nothing else on the form is committed with it.
 */
export const saveMyPhoto = async ({ data }: { data: z.input<typeof profilePhotoInput> }) =>
  documentOf(await api.put<EmployeeProfile>("/profile/me/photo", data));
