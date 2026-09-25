import { getDb } from "@/server/db/client.server";
import { hashPassword } from "@/server/auth/password.server";
import type { Role, SessionUser } from "@/shared/types";

/** Returns who the password belongs to, or `null` if it matches no access code. */
export async function verifyPassword(password: string): Promise<SessionUser | null> {
  const { data: row } = await getDb()
    .from("access_codes")
    .select("id,role,label")
    .eq("password_hash", hashPassword(password))
    .maybeSingle();
  if (!row) return null;
  return { id: row.id as string, role: row.role as Role, label: row.label };
}
