import {
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPasswordHash,
} from "@/server/auth/password.server";
import { getDb } from "@/server/db/client.server";
import type { Role, SessionUser } from "@/shared/types";

/** Returns the account for that ID number + password, or `null` if either is wrong. */
export async function verifyPassword(
  idNumber: string,
  password: string,
): Promise<SessionUser | null> {
  const normalized = idNumber.trim();
  if (!normalized) return null;

  // Exact match, deliberately. The unique index on `users.id_number` is
  // case-sensitive, so an ILIKE lookup could return two rows (and `.maybeSingle()`
  // would then throw, locking both accounts out). Sign-in has to use the same
  // comparison the index guarantees.
  const db = getDb();
  const { data, error } = await db
    .from("users")
    .select("id,role,id_number,password_hash")
    .eq("id_number", normalized)
    .maybeSingle();
  if (error) {
    // The id_number column arrives with a migration — fail with something the
    // admin can act on rather than a generic "wrong password".
    if (/id_number/i.test(error.message)) {
      throw new Error(
        "Sign-in needs a pending database update. Run drizzle/migrations/0007_account_id_number.sql first.",
      );
    }
    // The account table arrives with its rename migration too — PostgREST
    // reports unknown tables as a schema-cache miss (raw PG says "relation").
    if (/could not find the table .*users|relation .*users.* does not exist/i.test(error.message)) {
      throw new Error(
        "Sign-in needs a pending database update. Run drizzle/migrations/0010_users_rename.sql first.",
      );
    }
    throw new Error(error.message);
  }
  if (!data || !(await verifyPasswordHash(password, data.password_hash))) return null;

  // Transparent upgrade: a correct sign-in is the only moment the plaintext is
  // available, so it is also the moment to move a legacy (or older-iteration)
  // hash to the current scheme. A failure here must never block the login.
  if (passwordHashNeedsUpgrade(data.password_hash)) {
    try {
      const upgraded = await hashPassword(password);
      await db.from("users").update({ password_hash: upgraded }).eq("id", data.id);
    } catch (upgradeError) {
      console.error("[auth] Could not upgrade the password hash:", upgradeError);
    }
  }

  // The sidebar's "Signed in as …" uses the profile's real full name (the old
  // free-text label column is gone), falling back to the ID number when the
  // employee hasn't filled in their profile yet. A failed profile lookup must
  // never block signing in — the ID number always works.
  const { data: profile } = await db
    .from("profiles")
    .select("full_name")
    .eq("access_code_id", data.id)
    .maybeSingle();
  return {
    id: data.id,
    role: data.role as Role,
    label: profile?.full_name?.trim() || data.id_number,
    // The sidebar footer shows it under the full name.
    idNumber: data.id_number,
  };
}
