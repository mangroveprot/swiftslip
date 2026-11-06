import type { ObSigner, ObSigners } from '@swiftslip/shared/api-types';
import { ProfileRepository } from '../../profile/repositories';

/**
 * The `ob_forms` columns that say who signed each box. The `_at` timestamps
 * are checked too: an id without a timestamp is not a completed signature, so
 * the sheet must not print it.
 */
type ObSignerRow = {
  hr_approved_by: string | null;
  hr_approved_at: string | null;
  hr_rejected_by: string | null;
  hr_rejected_at: string | null;
  departure_signed_by: string | null;
  departure_signed_at: string | null;
  arrival_signed_by: string | null;
  arrival_signed_at: string | null;
};

/**
 * Resolve the four stored signer ids into the name, designation and saved
 * e-signature the OB sheet prints. `ob_forms` only keeps uuids, so the paper
 * form needs the printed name, the position line under it and the signature —
 * they are joined here on read (one query for all four, like the notification
 * bell resolves its actors).
 *
 * Only signatures that actually happened are returned. A missing profile is
 * still returned with empty name/signature/position rather than dropped — the
 * box is signed, and the UI can decide how to fall back.
 */
export async function resolveObSigners(row: ObSignerRow): Promise<ObSigners> {
  const targets: Array<[keyof ObSigners, string | null, boolean]> = [
    ['approved', row.hr_approved_by, Boolean(row.hr_approved_at)],
    ['rejected', row.hr_rejected_by, Boolean(row.hr_rejected_at)],
    ['departure', row.departure_signed_by, Boolean(row.departure_signed_at)],
    ['arrival', row.arrival_signed_by, Boolean(row.arrival_signed_at)],
  ];

  const ids = [
    ...new Set(
      targets
        .filter(([, id, signed]) => signed && id)
        .map(([, id]) => id as string),
    ),
  ];
  if (!ids.length) return {};

  const profiles = await new ProfileRepository().findAll(
    { access_code_id: ids },
    { select: 'access_code_id,full_name,signature,designation' },
  );
  const byId = new Map(
    profiles.map((profile) => [profile.access_code_id, profile] as const),
  );

  const signers: ObSigners = {};
  for (const [key, id, signed] of targets) {
    if (!signed || !id) continue;
    const profile = byId.get(id);
    const signer: ObSigner = {
      name: profile?.full_name ?? '',
      signature: profile?.signature ?? '',
      position: profile?.designation ?? '',
    };
    signers[key] = signer;
  }
  return signers;
}
