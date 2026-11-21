/**
 * Client for the Showroom Updates API (`/showroom-updates/*`).
 *
 * Same separate RGC database as Inventory, but its own app grant: every route
 * needs `showroom-updates`, never `inventory`.
 */
import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type {
  ShowroomUpdate,
  ShowroomUpdateChange,
  ShowroomUpdateEvent,
  ShowroomUpdateSaveRequest,
} from "@swiftslip/shared/showroom-updates";

export const getShowroomUpdates = async () =>
  documentsOf(await api.get<ShowroomUpdate>("/showroom-updates"));

/** Add a showroom; the API assigns the next No. and returns the saved row. */
export const createShowroomUpdate = async ({ data }: { data: ShowroomUpdateSaveRequest }) =>
  documentOf(await api.post<ShowroomUpdate>("/showroom-updates", data));

export const saveShowroomUpdate = async ({
  updateId,
  data,
}: {
  updateId: number;
  data: ShowroomUpdateSaveRequest;
}) => documentOf(await api.put<ShowroomUpdate>(`/showroom-updates/${seg(updateId)}`, data));

/** Bulk delete the ticked rows; the API answers how many it removed. */
export const deleteShowroomUpdates = async ({ data }: { data: { ids: number[] } }) =>
  documentOf(await api.post<{ deleted: number }>("/showroom-updates/bulk-delete", data));

/** Newest first; the drawer's history section. */
export const getShowroomUpdateEvents = async ({ updateId }: { updateId: number }) => {
  const events = documentsOf(
    await api.get<Omit<ShowroomUpdateEvent, "changes"> & { changes: unknown }>(
      `/showroom-updates/${seg(updateId)}/events`,
    ),
  );
  return events.map((event) => ({
    ...event,
    changes: normalizeChanges(event.changes),
  }));
};

/**
 * The API normally answers an array, but an older deploy (or a row written by
 * the previous insert) can answer a JSON string. Never let that reach a
 * `.map()` and blank the whole app.
 */
function normalizeChanges(value: unknown): ShowroomUpdateChange[] {
  if (Array.isArray(value)) return value as ShowroomUpdateChange[];
  if (typeof value === "string") {
    try {
      return normalizeChanges(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}
