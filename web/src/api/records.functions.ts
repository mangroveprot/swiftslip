import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type { AttachmentLink, RecordDetail, RecordSummary } from "@swiftslip/shared/api-types";
import type {
  attachmentUploadInput,
  createRecordInput,
  deleteRowInput,
  idInput,
  saveRecordInput,
} from "@swiftslip/shared/schemas";

export const listRecords = async () => documentsOf(await api.get<RecordSummary>("/records"));

export const getRecord = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<RecordDetail>(`/records/${seg(data.id)}`));

export const createRecord = async ({ data }: { data: z.input<typeof createRecordInput> }) =>
  documentOf(await api.post<{ id: string }>("/records", data));

export const saveRecord = async ({ data }: { data: z.input<typeof saveRecordInput> }) => {
  const { id, ...body } = data;
  await api.put(`/records/${seg(id)}`, body);
  return { ok: true as const };
};

/** `quiet` = the app sweeping an untouched scaffold away; it stays out of the activity log. */
export const deleteRecord = async ({ data }: { data: z.input<typeof deleteRowInput> }) => {
  await api.delete(`/records/${seg(data.id)}`, { quiet: data.quiet ? "true" : undefined });
  return { ok: true as const };
};

export const uploadRecordAttachment = async ({
  data,
}: {
  data: z.input<typeof attachmentUploadInput>;
}) => documentOf(await api.post<{ name: string }>(`/records/${seg(data.id)}/attachment`, data));

/** Short-lived signed link to the attachment (`null` when there is none). */
export const getRecordAttachmentUrl = async ({ data }: { data: z.input<typeof idInput> }) =>
  (await api.get<AttachmentLink>(`/records/${seg(data.id)}/attachment`)).document ?? null;

export const removeRecordAttachment = async ({ data }: { data: z.input<typeof idInput> }) => {
  const removed = documentOf(
    await api.delete<{ name: string }>(`/records/${seg(data.id)}/attachment`),
  );
  return { ok: true as const, ...removed };
};
