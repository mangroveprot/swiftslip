import type { ObSigner, ObSigners } from "@swiftslip/shared/api-types";
import type { ObHrFields } from "@swiftslip/shared/hr";
import { formatMonthDayYear } from "@swiftslip/shared/period";
import { formatTime12h } from "@swiftslip/shared/time";

/**
 * What the paper form's exit-clearance rows and "VERIFIED BY: HRD" cell print,
 * resolved from the HR-owned columns plus the signer profiles.
 *
 * One helper feeds both places that draw the sheet, the on-screen preview
 * (`ObPreview`) and the Word download, so the two can never disagree about
 * whether a box counts as signed or what format its date reads. A box fills
 * only when its own `_at` timestamp exists: an unsigned step must never look
 * signed, even if a signer id is already stored.
 */

/** Local date/time parts from an ISO timestamp, for rows signed before 0036. */
export function stampDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local clock part of an ISO timestamp, see `stampDate` for why it exists. */
export function stampTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** One exit-clearance leg: whether it is signed, what it prints, who signed it. */
export type ExitLeg = {
  signed: boolean;
  /**
   * The same two values split apart, because the signature cell prints them in
   * the other order, time first, then date, beside the guard's signature,
   * exactly like the paper form.
   */
  time: string;
  date: string;
  signer?: ObSigner | undefined;
};

export type ExitSignoff = {
  /** The HRD box, only set once HR has actually approved. */
  verified?: ObSigner | undefined;
  departure: ExitLeg;
  arrival: ExitLeg;
};

/** Resolve the HR sign-off columns into exactly what the sheet prints. */
export function resolveExitSignoff(
  hr?: Partial<ObHrFields> | null,
  signers?: ObSigners | null,
): ExitSignoff {
  const details = hr ?? {};
  const departureSigned = details.departure_signed_at != null;
  const arrivalSigned = details.arrival_signed_at != null;

  const departureDate = details.departure_date ?? "";
  const departureTime = details.departure_time ?? "";
  // The typed date/time is authoritative (migration 0036). A row signed before
  // that migration falls back to the audit timestamp, so it still fills.
  const arrivalDate = details.arrival_date || stampDate(details.arrival_signed_at);
  const arrivalTime = details.arrival_time || stampTime(details.arrival_signed_at);

  const leg = (date: string, time: string, signed: boolean, signer?: ObSigner): ExitLeg => ({
    signed,
    time: formatTime12h(time),
    date: formatMonthDayYear(date),
    signer: signed ? signer : undefined,
  });

  return {
    verified: details.hr_approved_at ? signers?.approved : undefined,
    departure: leg(departureDate, departureTime, departureSigned, signers?.departure),
    arrival: leg(arrivalDate, arrivalTime, arrivalSigned, signers?.arrival),
  };
}
