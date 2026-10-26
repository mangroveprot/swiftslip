import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type { AttachmentLink, LoaDetail, LoaSummary } from "@swiftslip/shared/api-types";
import type {
  attachmentPathInput,
  attachmentUploadInput,
  createLoaFormInput,
  deleteRowInput,
  idInput,
  loaChatInput,
  loaReasonInput,
  saveLoaFormInput,
} from "@swiftslip/shared/schemas";
import type { LoaForm } from "@swiftslip/shared/types";

export const listLoaForms = async () => documentsOf(await api.get<LoaSummary>("/loa"));

export const getLoaForm = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<LoaDetail>(`/loa/${seg(data.id)}`));

export const createLoaForm = async ({ data }: { data: z.input<typeof createLoaFormInput> }) =>
  documentOf(await api.post<{ id: string }>("/loa", data));

export const saveLoaForm = async ({ data }: { data: z.input<typeof saveLoaFormInput> }) => {
  const { id, ...body } = data;
  await api.put(`/loa/${seg(id)}`, body);
  return { ok: true as const };
};

/** `quiet` = the app sweeping an untouched scaffold away; it stays out of the activity log. */
export const deleteLoaForm = async ({ data }: { data: z.input<typeof deleteRowInput> }) => {
  await api.delete(`/loa/${seg(data.id)}`, { quiet: data.quiet ? "true" : undefined });
  return { ok: true as const };
};

export const uploadLoaAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentUploadInput>;
}) => documentOf(await api.post<{ name: string }>(`/loa/${seg(data.id)}/attachment`, data));

/** Short-lived signed link to the attachment (`null` when there is none). */
export const getLoaAttachmentUrl = async ({ data }: { data: z.input<typeof idInput> }) =>
  (await api.get<AttachmentLink>(`/loa/${seg(data.id)}/attachment`)).document ?? null;

export const removeLoaAttachment = async ({ data }: { data: z.input<typeof idInput> }) => {
  const removed = documentOf(await api.delete<{ name: string }>(`/loa/${seg(data.id)}/attachment`));
  return { ok: true as const, ...removed };
};

/** One more supporting file — up to 8, 10 MB each. */
export const uploadLoaOtherAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentUploadInput>;
}) => documentOf(await api.post<{ name: string }>(`/loa/${seg(data.id)}/other-attachments`, data));

/** Signed links for every additional file, keyed by storage path. */
export const getLoaOtherAttachmentUrls = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<Record<string, string>>(`/loa/${seg(data.id)}/other-attachments`));

export const removeLoaOtherAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentPathInput>;
}) =>
  documentOf(
    await api.delete<{ name: string }>(`/loa/${seg(data.id)}/other-attachments`, {
      path: data.path,
    }),
  );

export const writeLoaReason = async ({ data }: { data: z.input<typeof loaReasonInput> }) =>
  documentOf(await api.post<{ reason: string }>("/ai/loa/reason", data));

export const chatLoaAssistant = async ({ data }: { data: z.input<typeof loaChatInput> }) =>
  documentOf(await api.post<{ reply: string; form?: Partial<LoaForm> }>("/ai/loa/chat", data));
