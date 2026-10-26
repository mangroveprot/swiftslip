import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type { AttachmentLink, CosDetail, CosSummary } from "@swiftslip/shared/api-types";
import type {
  attachmentUploadInput,
  cosChatInput,
  cosReasonInput,
  createCosFormInput,
  deleteRowInput,
  idInput,
  saveCosFormInput,
} from "@swiftslip/shared/schemas";
import type { CosForm, CosSchedule } from "@swiftslip/shared/types";

export const listCosForms = async () => documentsOf(await api.get<CosSummary>("/cos"));

export const getCosForm = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<CosDetail>(`/cos/${seg(data.id)}`));

export const createCosForm = async ({ data }: { data: z.input<typeof createCosFormInput> }) =>
  documentOf(await api.post<{ id: string }>("/cos", data));

export const saveCosForm = async ({ data }: { data: z.input<typeof saveCosFormInput> }) => {
  const { id, ...body } = data;
  await api.put(`/cos/${seg(id)}`, body);
  return { ok: true as const };
};

/** `quiet` = the app sweeping an untouched scaffold away; it stays out of the activity log. */
export const deleteCosForm = async ({ data }: { data: z.input<typeof deleteRowInput> }) => {
  await api.delete(`/cos/${seg(data.id)}`, { quiet: data.quiet ? "true" : undefined });
  return { ok: true as const };
};

export const uploadCosAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentUploadInput>;
}) => documentOf(await api.post<{ name: string }>(`/cos/${seg(data.id)}/attachment`, data));

/** Short-lived signed link to the attachment (`null` when there is none). */
export const getCosAttachmentUrl = async ({ data }: { data: z.input<typeof idInput> }) =>
  (await api.get<AttachmentLink>(`/cos/${seg(data.id)}/attachment`)).document ?? null;

export const removeCosAttachment = async ({ data }: { data: z.input<typeof idInput> }) => {
  const removed = documentOf(await api.delete<{ name: string }>(`/cos/${seg(data.id)}/attachment`));
  return { ok: true as const, ...removed };
};

export const writeCosReason = async ({ data }: { data: z.input<typeof cosReasonInput> }) =>
  documentOf(await api.post<{ reason: string }>("/ai/cos/reason", data));

export const chatCosAssistant = async ({ data }: { data: z.input<typeof cosChatInput> }) =>
  documentOf(
    await api.post<{ reply: string; form?: Partial<CosForm>; schedules?: CosSchedule[] }>(
      "/ai/cos/chat",
      data,
    ),
  );
