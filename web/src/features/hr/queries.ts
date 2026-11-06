import { queryOptions, useQueryClient } from "@tanstack/react-query";

import {
  approveHrOb,
  getHrObAttachmentUrl,
  getHrObForm,
  listHrObForms,
  listNotifications,
  markNotificationsRead,
  rejectHrOb,
  signHrObArrival,
  signHrObDeparture,
} from "@/api/hr.functions";
import type { z } from "zod";
import type {
  idInput,
  rejectObInput,
  signArrivalInput,
  signDepartureInput,
} from "@swiftslip/shared/schemas";

type WithId<T extends z.ZodTypeAny> = z.input<T> & { id: string };

export const hrQueueQueryOptions = () =>
  queryOptions({
    queryKey: ["hr-ob-queue"],
    queryFn: () => listHrObForms(),
    // The bell polls every 30 s; the queue shares that rhythm so an approval
    // made by another reviewer shows up without a manual refresh.
    refetchInterval: 30_000,
    retry: false,
  });

export const hrObQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["hr-ob", id],
    queryFn: () => getHrObForm({ data: { id } }),
    refetchInterval: 30_000,
    retry: false,
  });

export const hrObAttachmentUrlQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["hr-ob-attachment", id],
    queryFn: () => getHrObAttachmentUrl({ data: { id } }),
    // B2 signs for five minutes (Supabase for an hour), so keep the link fresh
    // while the reviewer has the detail open instead of reusing a stale one.
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: false,
  });

export const notificationsQueryOptions = () =>
  queryOptions({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
    refetchInterval: 30_000,
    retry: false,
  });

/** Mutations and the cache writes they imply, shared by every HR screen. */
export function useHrActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["hr-ob-queue"] });
    void qc.invalidateQueries({ queryKey: ["ob-forms"] });
  };

  const change = async (action: () => Promise<unknown>, id: string): Promise<void> => {
    await action();
    refresh();
    void qc.invalidateQueries({ queryKey: ["hr-ob", id] });
    void qc.invalidateQueries({ queryKey: ["ob-form", id] });
  };

  return {
    approve: (data: z.input<typeof idInput>) => change(() => approveHrOb({ data }), data.id),
    reject: (data: WithId<typeof rejectObInput>) => change(() => rejectHrOb({ data }), data.id),
    signDeparture: (data: WithId<typeof signDepartureInput>) =>
      change(() => signHrObDeparture({ data }), data.id),
    signArrival: (data: WithId<typeof signArrivalInput>) =>
      change(() => signHrObArrival({ data }), data.id),
    markRead: () => {
      void markNotificationsRead().then(() => {
        void qc.invalidateQueries({ queryKey: ["notifications"] });
      });
    },
  };
}
