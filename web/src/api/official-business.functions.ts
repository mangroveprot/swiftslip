import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type { AttachmentLink, ObDetail, ObSummary } from "@swiftslip/shared/api-types";
import type {
  attachmentUploadInput,
  createObFormInput,
  deleteRowInput,
  idInput,
  obChatInput,
  obPurposeInput,
  saveObFormInput,
} from "@swiftslip/shared/schemas";
import type { ObEntry, ObForm } from "@swiftslip/shared/types";

export const listObForms = async () => documentsOf(await api.get<ObSummary>("/official-business"));

export const getObForm = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<ObDetail>(`/official-business/${seg(data.id)}`));

export const createObForm = async ({ data }: { data: z.input<typeof createObFormInput> }) =>
  documentOf(await api.post<{ id: string }>("/official-business", data));

export const saveObForm = async ({ data }: { data: z.input<typeof saveObFormInput> }) => {
  const { id, ...body } = data;
  await api.put(`/official-business/${seg(id)}`, body);
  return { ok: true as const };
};

/** `quiet` = the app sweeping an untouched scaffold away; it stays out of the activity log. */
export const deleteObForm = async ({ data }: { data: z.input<typeof deleteRowInput> }) => {
  await api.delete(`/official-business/${seg(data.id)}`, {
    quiet: data.quiet ? "true" : undefined,
  });
  return { ok: true as const };
};

export const uploadObAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentUploadInput>;
}) =>
  documentOf(
    await api.post<{ name: string }>(`/official-business/${seg(data.id)}/attachment`, data),
  );

/** Short-lived signed link to the attachment (`null` when there is none). */
export const getObAttachmentUrl = async ({ data }: { data: z.input<typeof idInput> }) =>
  (await api.get<AttachmentLink>(`/official-business/${seg(data.id)}/attachment`)).document ?? null;

export const removeObAttachment = async ({ data }: { data: z.input<typeof idInput> }) => {
  const removed = documentOf(
    await api.delete<{ name: string }>(`/official-business/${seg(data.id)}/attachment`),
  );
  return { ok: true as const, ...removed };
};

export const writeObPurpose = async ({ data }: { data: z.input<typeof obPurposeInput> }) =>
  documentOf(await api.post<{ purpose: string }>("/ai/ob/purpose", data));

export const chatObAssistant = async ({ data }: { data: z.input<typeof obChatInput> }) =>
  documentOf(
    await api.post<{ reply: string; form?: Partial<ObForm>; entries?: ObEntry[] }>(
      "/ai/ob/chat",
      data,
    ),
  );
