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
    .from("access_codes")
    .select("id,role,label,password_hash")
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
    throw new Error(error.message);
  }
  if (!data || !verifyPasswordHash(password, data.password_hash)) return null;
  return { id: data.id as string, role: data.role as Role, label: data.label };
}
