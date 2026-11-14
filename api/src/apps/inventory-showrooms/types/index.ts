import type {
  ShowroomCctvConnection,
  ShowroomCctvInstalled,
  ShowroomInternet,
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
