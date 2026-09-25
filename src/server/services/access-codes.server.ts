import { getDb } from "@/server/db/client.server";
import { hashPassword, verifyPasswordHash } from "@/server/auth/password.server";
import type { Role } from "@/shared/types";

async function countAdmins(excludingId?: string) {
  const db = getDb();
  let query = db
    .from("access_codes")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (excludingId) query = query.neq("id", excludingId);
  const { count } = await query;
  return count ?? 0;
}

export async function listAccessCodes() {
  const { data } = await getDb()
    .from("access_codes")
    .select("id,label,role,created_at")
    .order("created_at");
  return data ?? [];
}

export async function upsertAccessCode(input: {
  id?: string | undefined;
  label: string;
  role: Role;
  /** Blank/omitted on an edit keeps the existing password. Required when creating. */
  password?: string | undefined;
}) {
  const db = getDb();

  if (input.id) {
    const { data: existing } = await db
      .from("access_codes")
      .select("role")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing) throw new Error("That password no longer exists.");

    // Don't let the last administrator get demoted — that would lock everyone out.
    if (
      existing.role === "admin" &&
      input.role !== "admin" &&
      (await countAdmins(input.id)) === 0
    ) {
      throw new Error("Keep at least one administrator password.");
    }

    if (input.password && input.password.length < 4) {
      throw new Error("Password must be at least 4 characters.");
    }
    const updatePayload = {
      label: input.label,
      role: input.role,
      ...(input.password ? { password_hash: hashPassword(input.password) } : {}),
    };

    const { error } = await db.from("access_codes").update(updatePayload).eq("id", input.id);
    if (error) throw new Error(error.message);
    return;
  }

  if (!input.password || input.password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  const insertPayload = {
    label: input.label,
    role: input.role,
    password_hash: hashPassword(input.password),
  };
  const { error } = await db.from("access_codes").insert(insertPayload);
  if (error) throw new Error(error.message);
}

export async function deleteAccessCode(id: string) {
  const db = getDb();
  const { data: row } = await db.from("access_codes").select("role").eq("id", id).maybeSingle();
  if (row?.role === "admin" && (await countAdmins(id)) === 0) {
    throw new Error("Keep at least one administrator password.");
  }
  await db.from("access_codes").delete().eq("id", id);
}

/** Change the password behind the currently signed-in access code, after checking the old one. */
export async function changeOwnPassword(
  accessCodeId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (newPassword.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  const db = getDb();
  const { data: row } = await db
    .from("access_codes")
    .select("password_hash")
    .eq("id", accessCodeId)
    .maybeSingle();
  if (!row || !verifyPasswordHash(currentPassword, row.password_hash)) {
    throw new Error("Current password is incorrect.");
  }
  const { error } = await db
    .from("access_codes")
    .update({ password_hash: hashPassword(newPassword) })
    .eq("id", accessCodeId);
  if (error) throw new Error(error.message);
}
