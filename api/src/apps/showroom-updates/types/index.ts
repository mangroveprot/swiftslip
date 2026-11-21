import type {
  ShowroomUpdateRemarks,
  ShowroomUpdateResponsible,
  ShowroomUpdateStatus,
  ShowroomUpdateVehicle,
} from '@swiftslip/shared/showroom-updates';

/**
 * One row of the owner's sheet, written when the table is first created.
 * Typed (instead of inline SQL strings) so a typo in a status key fails
 * `typecheck` rather than a CHECK constraint at runtime.
 *
 * `srNo` is the sheet's own "No." column, preserved verbatim: it skips 19.
 */
export type ShowroomUpdateSeedRow = {
  srNo: number;
  showroomName: string;
  location: string;
  status: ShowroomUpdateStatus | null;
  requirements: string | null;
  actionRequired: string | null;
  responsiblePerson: ShowroomUpdateResponsible | null;
  remarks: ShowroomUpdateRemarks | null;
  /** `YYYY-MM-DD`; null while the showroom is not open yet. */
  openDate: string | null;
  vehicle: ShowroomUpdateVehicle | null;
};

/** `changes` comes back from jsonb as a JSON string; the repo parses it. */
export type ShowroomUpdateEventRow = {
  event_id: number;
  update_id: number;
  actor_id: string | null;
  actor_label: string;
  changes: string;
  created_at: string;
};
