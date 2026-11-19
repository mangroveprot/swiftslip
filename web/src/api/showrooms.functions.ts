/**
 * Client for the Showrooms API (`/inventory/showrooms/*`), same separate RGC
 * database as the assets endpoints. Every route needs the `inventory` app.
 */
import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type {
  showroomPhotoUploadInput,
  Showroom,
  ShowroomPhotoSlot,
  ShowroomPhotoUploadResult,
  ShowroomPhotos,
  showroomSaveInput,
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

/* -------------------------------------------------------------- photos - */

/** Store one picture before its showroom is saved; the refs go into the save. */
export const stageShowroomPhoto = async ({
  data,
}: {
  data: z.input<typeof showroomPhotoUploadInput>;
}) =>
  documentOf(await api.post<ShowroomPhotoUploadResult>("/inventory/showrooms/photos/staged", data));

/** Drop a staged picture (drawer cancelled, or it was replaced). */
export const discardStagedShowroomPhoto = async ({ ref }: { ref: string }) => {
  await api.delete("/inventory/showrooms/photos/staged", { ref });
};

/**
 * Upload a picture and attach it to an existing showroom in one request, so
 * nothing waits for the form's Save. Answers with fresh links for all slots.
 */
export const uploadShowroomPhoto = async ({
  showroomId,
  slot,
  data,
}: {
  showroomId: number;
  slot: ShowroomPhotoSlot;
  data: z.input<typeof showroomPhotoUploadInput>;
}) =>
  documentOf(
    await api.post<ShowroomPhotos>(
      `/inventory/showrooms/${seg(showroomId)}/photos/${seg(slot)}`,
      data,
    ),
  );

/** Signed links for the three slots, fetched when the drawer opens. */
export const getShowroomPhotos = async ({ showroomId }: { showroomId: number }) =>
  documentOf(await api.get<ShowroomPhotos>(`/inventory/showrooms/${seg(showroomId)}/photos`));

/** Remove one slot immediately. */
export const deleteShowroomPhoto = async ({
  showroomId,
  slot,
}: {
  showroomId: number;
  slot: ShowroomPhotoSlot;
}) =>
  documentOf(
    await api.delete<{ deleted: number }>(
      `/inventory/showrooms/${seg(showroomId)}/photos/${seg(slot)}`,
    ),
  );
