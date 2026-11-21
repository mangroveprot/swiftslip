/**
 * The board's semantic marks: a status pill and a person cell. Colours come
 * from `board-colors.ts` so the chips in the toolbar and the pills here always
 * agree about what "open" or "Jonnah" looks like.
 */
import type {
  ShowroomUpdateResponsible,
  ShowroomUpdateStatus,
  ShowroomUpdateVehicle,
} from "@swiftslip/shared/showroom-updates";
import {
  showroomUpdateResponsibleMeta,
  showroomUpdateStatusMeta,
  showroomUpdateVehicleMeta,
} from "@swiftslip/shared/showroom-updates";

import { initialsOf } from "@/lib/photo";

import { PERSON_BOARD, STATUS_BOARD } from "../board-colors";

export function StatusPill({ status }: { status: ShowroomUpdateStatus | null }) {
  const meta = showroomUpdateStatusMeta(status);
  if (!meta || !status) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const colors = STATUS_BOARD[status];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.ink }}
    >
      {meta.chipLabel}
    </span>
  );
}

/** Initials disc + name, muted when nobody is assigned. */
export function PersonCell({ person }: { person: ShowroomUpdateResponsible | null }) {
  const meta = showroomUpdateResponsibleMeta(person);
  if (!meta || !person) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const colors = PERSON_BOARD[person];
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
        style={{ backgroundColor: colors.bg, color: colors.ink }}
        aria-hidden="true"
      >
        {initialsOf(meta.label)}
      </span>
      <span className="truncate text-[13px] text-foreground" title={meta.label}>
        {meta.label}
      </span>
    </span>
  );
}

/**
 * The sheet's Vehicle cell, on screen. Unlike the statement badges this keeps
 * the export's exact fills and ink: it is the one column the owner recognises
 * by colour (peach sidecar, blue requested, purple none), so a soft tint would
 * stop it reading as the same sheet.
 */
export function VehicleTag({ vehicle }: { vehicle: ShowroomUpdateVehicle | null }) {
  const meta = showroomUpdateVehicleMeta(vehicle);
  if (!meta) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase"
      style={{ backgroundColor: meta.fill, color: meta.ink }}
      title={meta.label}
    >
      {meta.chipLabel}
    </span>
  );
}
