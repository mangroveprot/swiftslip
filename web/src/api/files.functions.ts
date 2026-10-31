import type { z } from "zod";

import { api, documentOf } from "@/lib/api-client";
import type { FileLink, StoredFile } from "@swiftslip/shared/api-types";
import type { fileKeyQuery, fileUploadInput } from "@swiftslip/shared/schemas";

/**
 * The optional B2 file store for future features. The existing form
 * attachments keep using their own `/…/attachment` endpoints — nothing here
 * replaces them, and nothing calls this yet.
 *
 *   const { key } = await uploadFile({ data: { filename, contentType, base64 } });
 *   const { url } = await getFileUrl({ data: { key } });  // 5-minute link
 *   await removeFile({ data: { key } });
 */
export const uploadFile = async ({ data }: { data: z.input<typeof fileUploadInput> }) =>
  documentOf(await api.post<StoredFile>("/files", data));

export const getFileUrl = async ({ data }: { data: z.input<typeof fileKeyQuery> }) =>
  documentOf(await api.get<FileLink>("/files/url", { key: data.key }));

export const removeFile = async ({ data }: { data: z.input<typeof fileKeyQuery> }) =>
  documentOf(await api.delete<StoredFile>("/files", { key: data.key }));
