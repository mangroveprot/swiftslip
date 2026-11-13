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

// No refetchInterval here (or on the detail / bell queries below): the shared
// SSE stream in lib/live-updates.tsx invalidates these when data actually
// changes, on either the HR or the employee side. Polling every 30 s per tab
// was three DB reads every 30 s per reviewer whether or not anything changed.
export const hrQueueQueryOptions = () =>
  queryOptions({
    queryKey: ["hr-ob-queue"],
    queryFn: () => listHrObForms(),
    retry: false,
  });

export const hrObQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["hr-ob", id],
    queryFn: () => getHrObForm({ data: { id } }),
    retry: false,
  });

export const hrObAttachmentUrlQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["hr-ob-attachment", id],
    queryFn: () => getHrObAttachmentUrl({ data: { id } }),
    // B2 signs for five minutes (Supabase for an hour), so keep the link fresh
    // while the reviewer has the detail open instead of reusing a stale one.
    // This is a signed-URL TTL refresh, not a data-change poll, the stream
    // deliberately skips `*-attachment` keys.
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: false,
  });

export const notificationsQueryOptions = () =>
  queryOptions({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
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
