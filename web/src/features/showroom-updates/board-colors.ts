/**
 * Board-only colours.
 *
 * The PDF/Excel exports keep the owner's sheet palette verbatim (dark cells,
 * white ink) in `shared/src/showroom-updates.ts`. A screen is not a printout,
 * so the board uses a soft tint of the same hue plus a saturated dot: status
 * reads instantly without six saturated blocks per row.
 */
import type {
  ShowroomUpdateResponsible,
  ShowroomUpdateStatus,
} from "@swiftslip/shared/showroom-updates";

export type BoardColors = { bg: string; ink: string; dot: string };

/** Light pill + saturated dot, one entry per status. */
export const STATUS_BOARD: Record<ShowroomUpdateStatus, BoardColors> = {
  open: { bg: "#e8f6ee", ink: "#227a51", dot: "#2f9e6e" },
  ready: { bg: "#eaf2fd", ink: "#2f6fbf", dot: "#3b82f6" },
  in_progress: { bg: "#f1ecfd", ink: "#6a4fc0", dot: "#8b6ce0" },
  pending: { bg: "#fdf2e3", ink: "#a2691c", dot: "#f0a33a" },
};

/** Initials disc tints: pale fill, deep ink, one per responsible person. */
export const PERSON_BOARD: Record<ShowroomUpdateResponsible, { bg: string; ink: string }> = {
  jimmy: { bg: "#eef0f2", ink: "#4b5563" },
  jonnah: { bg: "#fbe9e7", ink: "#b3584f" },
  maynard: { bg: "#e6f4ec", ink: "#2f7d5b" },
  jeanette: { bg: "#fdf0d8", ink: "#9a6a12" },
  marvin: { bg: "#ece7fa", ink: "#6a4fc0" },
  ivanray: { bg: "#e8e8ea", ink: "#3f3f46" },
};
