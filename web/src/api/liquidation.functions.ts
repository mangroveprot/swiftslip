import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type { AttachmentLink, LiqDetail, LiqSummary } from "@swiftslip/shared/api-types";
import type {
  attachmentUploadInput,
  createLiqFormInput,
  deleteRowInput,
  idInput,
  LiqChatReply,
  liqChatInput,
  saveLiqFormInput,
} from "@swiftslip/shared/schemas";

export const listLiqForms = async () => documentsOf(await api.get<LiqSummary>("/liquidation"));

export const getLiqForm = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<LiqDetail>(`/liquidation/${seg(data.id)}`));

export const createLiqForm = async ({ data }: { data: z.input<typeof createLiqFormInput> }) =>
  documentOf(await api.post<{ id: string }>("/liquidation", data));

export const saveLiqForm = async ({ data }: { data: z.input<typeof saveLiqFormInput> }) => {
  const { id, ...body } = data;
  await api.put(`/liquidation/${seg(id)}`, body);
  return { ok: true as const };
};

/** `quiet` = the app sweeping an untouched scaffold away; it stays out of the activity log. */
export const deleteLiqForm = async ({ data }: { data: z.input<typeof deleteRowInput> }) => {
  await api.delete(`/liquidation/${seg(data.id)}`, { quiet: data.quiet ? "true" : undefined });
  return { ok: true as const };
};

/** One assistant turn, carrying up to five receipt images with it. */
export const chatLiqAssistant = async ({ data }: { data: z.input<typeof liqChatInput> }) =>
  documentOf(await api.post<LiqChatReply>("/ai/liq/chat", data));

/** Upload the approval slip — the file that turns on "Approved via Viber". */
export const uploadLiqAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentUploadInput>;
}) => documentOf(await api.post<{ name: string }>(`/liquidation/${seg(data.id)}/attachment`, data));

/** Short-lived signed link to the attachment (`null` when there is none). */
export const getLiqAttachmentUrl = async ({ data }: { data: z.input<typeof idInput> }) =>
  (await api.get<AttachmentLink>(`/liquidation/${seg(data.id)}/attachment`)).document ?? null;

export const removeLiqAttachment = async ({ data }: { data: z.input<typeof idInput> }) => {
  const removed = documentOf(
    await api.delete<{ name: string }>(`/liquidation/${seg(data.id)}/attachment`),
  );
  return { ok: true as const, ...removed };
};
