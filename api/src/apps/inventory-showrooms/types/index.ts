import type {
  Showroom,
  ShowroomCctvConnection,
  ShowroomCctvInstalled,
  ShowroomInternet,
  ShowroomPhotoSlot,
} from '@swiftslip/shared/showrooms';

/**
 * One row of the seed written when the `showrooms` table is first created.
 * Keeping it typed (instead of inline SQL strings) means a typo in a status
 * key fails `typecheck` rather than a CHECK constraint at runtime.
 */
export type ShowroomSeedRow = {
  showroomName: string;
  cctvInstalled: ShowroomCctvInstalled;
  cctvConnection: ShowroomCctvConnection;
  cctvNote: string | null;
  internet: ShowroomInternet;
};

/** One stored picture row; the refs point into the shared object bucket. */
export type ShowroomPhotoRow = {
  slot: ShowroomPhotoSlot;
  photo_ref: string;
  thumb_ref: string | null;
  /** Display-only facts (the storage key is a UUID, not the filename). */
  original_name: string | null;
  byte_size: number | null;
};

/** A change a save carries for one slot; `photoRef: null` removes it. */
export type ShowroomPhotoChange = {
  slot: ShowroomPhotoSlot;
  photoRef: string | null;
  thumbRef: string | null;
  filename: string | null;
  byteSize: number | null;
};

/** `showrooms` plus the join's raw thumbnail ref (signed into a URL later). */
export type ShowroomListRow = Omit<Showroom, 'photo_thumb'> & {
  photo_thumb_ref: string | null;
};
