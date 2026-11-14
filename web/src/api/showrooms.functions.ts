/**
 * Client for the Showrooms API (`/inventory/showrooms/*`), same separate RGC
 * database as the assets endpoints. Every route needs the `inventory` app.
 */
import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type {
  showroomSaveInput,
  Showroom,
  ShowroomStock,
  ShowroomStockRequest,
} from "@swiftslip/shared/showrooms";

export const getShowrooms = async () =>
  documentsOf(await api.get<Showroom>("/inventory/showrooms"));

/** Create (`showroomId` null) or edit one showroom. */
export const saveShowroom = async ({
  showroomId,
  data,
}: {
  showroomId: number | null;
  data: z.input<typeof showroomSaveInput>;
}) => {
  const saved =
    showroomId == null
      ? documentOf(await api.post<{ showroomId: number }>("/inventory/showrooms", data))
      : documentOf(
          await api.put<{ showroomId: number }>(`/inventory/showrooms/${seg(showroomId)}`, data),
        );
  return { ok: true as const, ...saved };
};

export const deleteShowroom = async ({ showroomId }: { showroomId: number }) => {
  const result = documentOf(
    await api.delete<{ deleted: number }>(`/inventory/showrooms/${seg(showroomId)}`),
  );
  return { ok: true as const, ...result };
};

/** The owner's total CCTV units, shown as "available" on the summary card. */
export const getShowroomStock = async () =>
  documentOf(await api.get<ShowroomStock>("/inventory/showrooms/stock"));

export const saveShowroomStock = async ({ cctvTotalUnits }: ShowroomStockRequest) =>
  documentOf(await api.put<ShowroomStock>("/inventory/showrooms/stock", { cctvTotalUnits }));
