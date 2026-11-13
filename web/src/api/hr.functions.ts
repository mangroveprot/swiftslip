import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type {
  AttachmentLink,
  HrObDetail,
  HrObSummary,
  NotificationRow,
} from "@swiftslip/shared/api-types";
import type {
  idInput,
  rejectObInput,
  signArrivalInput,
  signDepartureInput,
} from "@swiftslip/shared/schemas";

export const listHrObForms = async () => documentsOf(await api.get<HrObSummary>("/hr/ob"));

export const getHrObForm = async ({ data }: { data: z.input<typeof idInput> }) =>
  documentOf(await api.get<HrObDetail>(`/hr/ob/${seg(data.id)}`));

/** HR-scoped signed link to the supervisor's approval slip. */
export const getHrObAttachmentUrl = async ({ data }: { data: z.input<typeof idInput> }) =>
  (await api.get<AttachmentLink>(`/hr/ob/${seg(data.id)}/attachment`)).document ?? null;

export const approveHrOb = async ({ data }: { data: z.input<typeof idInput> }) => {
  await api.post(`/hr/ob/${seg(data.id)}/approve`);
  return { ok: true as const };
};

export const rejectHrOb = async ({
  data,
}: {
  data: z.input<typeof rejectObInput> & { id: string };
}) => {
  await api.post(`/hr/ob/${seg(data.id)}/reject`, { reason: data.reason });
  return { ok: true as const };
};

export const signHrObDeparture = async ({
  data,
}: {
  data: z.input<typeof signDepartureInput> & { id: string };
}) => {
  await api.post(`/hr/ob/${seg(data.id)}/sign-departure`, {
    date: data.date,
    time: data.time,
    residence: data.residence ?? "",
    destination: data.destination ?? "",
  });
  return { ok: true as const };
};

export const signHrObArrival = async ({
  data,
}: {
  data: z.input<typeof signArrivalInput> & { id: string };
}) => {
  await api.post(`/hr/ob/${seg(data.id)}/sign-arrival`, {
    date: data.date,
    time: data.time,
  });
  return { ok: true as const };
};

/**
 * One signed-in account's bell feed. The API answers `document: { unread }`
 * plus `documents: rows`; `Envelope<T>` types both from one shape, so the
 * mixed envelope is narrowed here rather than leaking the cast to the UI.
 */
export type NotificationFeed = { unread: number; rows: NotificationRow[] };

export const listNotifications = async (): Promise<NotificationFeed> => {
  const envelope = await api.get<{ unread: number }>("/notifications");
  return {
    unread: envelope.document?.unread ?? 0,
    rows: (envelope.documents ?? []) as unknown as NotificationRow[],
  };
};

export const markNotificationsRead = async () => {
  await api.post("/notifications/read", {});
  return { ok: true as const };
};

/** Remove the caller's own notifications; ids never leave that account's rows. */
export const deleteNotifications = async (ids: string[]) => {
  await api.post("/notifications/delete", { ids });
  return { ok: true as const };
};
