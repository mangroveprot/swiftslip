/**
 * The drawer's photo changes, kept out of the component so the rule is
 * testable: `undefined` means "no photo fields travelled at all", `null` means
 * "remove this slot", and a ref pair means "store this staged upload".
 */
import type { ShowroomPhotoSlot, ShowroomSaveRequest } from "@swiftslip/shared/showrooms";

/** One uploaded picture, before the record owns it. */
export type PhotoRefDraft = {
  ref: string;
  thumbRef: string | null;
  /** Display-only facts, repeated under the preview. */
  filename: string | null;
  byteSize: number | null;
};

export const SHOWROOM_PHOTO_SLOT_ORDER: ShowroomPhotoSlot[] = [
  "showroom",
  "cctv",
  "acknowledge_form",
];

/**
 * A removal wins over a draft (the drawer discards the draft as soon as a slot
 * is removed), and an untouched slot is simply omitted so the server leaves
 * that picture alone.
 */
export function buildShowroomPhotoChanges(
  drafts: Partial<Record<ShowroomPhotoSlot, PhotoRefDraft>>,
  removals: ReadonlySet<ShowroomPhotoSlot>,
): ShowroomSaveRequest["photos"] | undefined {
  const changes: NonNullable<ShowroomSaveRequest["photos"]> = {};

  for (const slot of SHOWROOM_PHOTO_SLOT_ORDER) {
    if (removals.has(slot)) {
      changes[slot] = null;
      continue;
    }
    const draft = drafts[slot];
    if (draft) {
      changes[slot] = {
        ref: draft.ref,
        thumbRef: draft.thumbRef,
        filename: draft.filename,
        byteSize: draft.byteSize,
      };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
