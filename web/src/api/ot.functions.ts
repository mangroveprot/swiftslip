import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type { AttachmentLink, OtDetail, OtSummary } from "@swiftslip/shared/api-types";
import type {
  attachmentPathInput,
  attachmentUploadInput,
  createOtFormInput,
  deleteRowInput,
  idInput,
  otChatInput,
  otReasonInput,
  saveOtFormInput,
} from "@swiftslip/shared/schemas";
import type { OtEntry, OtForm } from "@swiftslip/shared/types";

export const listOtForms = async () => documentsOf(await api.get<OtSummary>("/ot"));

export const getOtForm = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<OtDetail>(`/ot/${seg(data.id)}`));

export const createOtForm = async ({ data }: { data: z.input<typeof createOtFormInput> }) =>
  documentOf(await api.post<{ id: string }>("/ot", data));

export const saveOtForm = async ({ data }: { data: z.input<typeof saveOtFormInput> }) => {
  const { id, ...body } = data;
  await api.put(`/ot/${seg(id)}`, body);
  return { ok: true as const };
};

/** `quiet` = the app sweeping an untouched scaffold away; it stays out of the activity log. */
export const deleteOtForm = async ({ data }: { data: z.input<typeof deleteRowInput> }) => {
  await api.delete(`/ot/${seg(data.id)}`, { quiet: data.quiet ? "true" : undefined });
  return { ok: true as const };
};

export const uploadOtAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentUploadInput>;
}) => documentOf(await api.post<{ name: string }>(`/ot/${seg(data.id)}/attachment`, data));

/** Short-lived signed link to the attachment (`null` when there is none). */
export const getOtAttachmentUrl = async ({ data }: { data: z.input<typeof idInput> }) =>
  (await api.get<AttachmentLink>(`/ot/${seg(data.id)}/attachment`)).document ?? null;

export const removeOtAttachment = async ({ data }: { data: z.input<typeof idInput> }) => {
  const removed = documentOf(await api.delete<{ name: string }>(`/ot/${seg(data.id)}/attachment`));
  return { ok: true as const, ...removed };
};

/** One more supporting file — up to 8, 10 MB each. */
export const uploadOtOtherAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentUploadInput>;
}) => documentOf(await api.post<{ name: string }>(`/ot/${seg(data.id)}/other-attachments`, data));

/** Signed links for every additional file, keyed by storage path. */
export const getOtOtherAttachmentUrls = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<Record<string, string>>(`/ot/${seg(data.id)}/other-attachments`));

export const removeOtOtherAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentPathInput>;
}) =>
  documentOf(
    await api.delete<{ name: string }>(`/ot/${seg(data.id)}/other-attachments`, {
      path: data.path,
    }),
  );

export const writeOtReason = async ({ data }: { data: z.input<typeof otReasonInput> }) =>
  documentOf(await api.post<{ reason: string }>("/ai/ot/reason", data));

export const chatOtAssistant = async ({ data }: { data: z.input<typeof otChatInput> }) =>
  documentOf(
    await api.post<{ reply: string; form?: Partial<OtForm>; entries?: OtEntry[] }>(
      "/ai/ot/chat",
      data,
    ),
  );
