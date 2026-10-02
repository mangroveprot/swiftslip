import { getDb } from "@/server/db/client.server";
import { hashPassword, verifyPasswordHash } from "@/server/auth/password.server";
import type { Role, SessionUser } from "@/shared/types";

/**
 * Escape a value so it can be matched verbatim with ILIKE — case-insensitive
 * equality without turning `%` / `_` in the ID number into wildcards.
 */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Returns the account for that ID number + password, or `null` if either is wrong. */
export async function verifyPassword(
  idNumber: string,
  password: string,
): Promise<SessionUser | null> {
  const normalized = idNumber.trim();
  if (!normalized) return null;
  const { data, error } = await getDb()
    .from("users")
    .select("id,role,id_number,password_hash")
    .ilike("id_number", escapeLike(normalized))
    .maybeSingle();
  if (error) {
    // The id_number column arrives with a migration — fail with something the
    // admin can act on rather than a generic "wrong password".
    if (/id_number/i.test(error.message)) {
      throw new Error(
        "Sign-in needs a pending database update — run drizzle/migrations/0007_account_id_number.sql first.",
      );
    }
    // The account table arrives with its rename migration too — PostgREST
    // reports unknown tables as a schema-cache miss (raw PG says "relation").
    if (/could not find the table .*users|relation .*users.* does not exist/i.test(error.message)) {
      throw new Error(
        "Sign-in needs a pending database update — run drizzle/migrations/0010_users_rename.sql first.",
      );
    }
    throw new Error(error.message);
  }
  if (!data || !verifyPasswordHash(password, data.password_hash)) return null;
  // The sidebar's "Signed in as …" uses the profile's real full name (the old
  // free-text label column is gone), falling back to the ID number when the
  // employee hasn't filled in their profile yet. A failed profile lookup must
  // never block signing in — the ID number always works.
  const { data: profile } = await getDb()
    .from("profiles")
    .select("full_name")
    .eq("access_code_id", data.id)
    .maybeSingle();
  return {
    id: data.id,
    role: data.role as Role,
    label: profile?.full_name?.trim() || data.id_number,
  };
}
