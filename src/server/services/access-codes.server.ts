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

/** True when another account already signs in with this ID number. */
async function idNumberInUse(idNumber: string, excludingId?: string) {
  const db = getDb();
  let query = db
    .from("access_codes")
    .select("id", { count: "exact", head: true })
    .eq("id_number", idNumber);
  if (excludingId) query = query.neq("id", excludingId);
  const { count, error } = await query;
  if (error) throw migrationOrThrow(error.message);
  return (count ?? 0) > 0;
}

/** Friendly wording for "the id_number migration hasn't been applied yet". */
function migrationOrThrow(message: string) {
  if (/id_number/i.test(message)) {
    return new Error(
      "This needs a pending database update — run drizzle/migrations/0007_account_id_number.sql first.",
    );
  }
  return new Error(message);
}

export async function listAccessCodes() {
  const { data, error } = await getDb()
    .from("access_codes")
    .select("id,label,id_number,role,created_at")
    .order("created_at");
  if (error) throw migrationOrThrow(error.message);
  return data ?? [];
}

export async function upsertAccessCode(input: {
  id?: string | undefined;
  /** Unique sign-in ID for the account — required on create. */
  idNumber: string;
  /** Display name (sidebar); falls back to the ID number when blank. */
  label?: string | undefined;
  role: Role;
  /** Blank/omitted on an edit keeps the existing password. Required when creating. */
  password?: string | undefined;
}) {
  const db = getDb();
  const idNumber = input.idNumber.trim();
  const label = (input.label ?? "").trim() || idNumber;

  if (input.id) {
    const { data: existing } = await db
      .from("access_codes")
      .select("role")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing) throw new Error("That account no longer exists.");

    // Don't let the last administrator get demoted — that would lock everyone out.
    if (
      existing.role === "admin" &&
      input.role !== "admin" &&
      (await countAdmins(input.id)) === 0
    ) {
      throw new Error("Keep at least one administrator account.");
    }

    if (input.password && input.password.length < 4) {
      throw new Error("Password must be at least 4 characters.");
    }
    if (await idNumberInUse(idNumber, input.id)) {
      throw new Error("That ID number is already in use.");
    }
    const updatePayload = {
      label,
      id_number: idNumber,
      role: input.role,
      ...(input.password ? { password_hash: hashPassword(input.password) } : {}),
    };

    const { error } = await db.from("access_codes").update(updatePayload).eq("id", input.id);
    if (error) throw migrationOrThrow(error.message);
    return;
  }

  if (!input.password || input.password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  if (await idNumberInUse(idNumber)) {
    throw new Error("That ID number is already in use.");
  }
  const insertPayload = {
    label,
    id_number: idNumber,
    role: input.role,
    password_hash: hashPassword(input.password),
  };
  const { data: created, error } = await db
    .from("access_codes")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) {
    // The unique index is the final word on duplicates (a race the check above
    // can't see) — turn it into the same friendly message.
    if (/id_number/i.test(error.message)) throw new Error("That ID number is already in use.");
    throw new Error(error.message);
  }

  // Seed the new account's profile so the ID number it signed up with is also
  // its employee number on DTR / OB forms — one fewer thing to retype.
  const { error: profileError } = await db
    .from("profiles")
    .upsert(
      { access_code_id: created.id as string, emp_no: idNumber },
      { onConflict: "access_code_id" },
    );
  if (profileError) throw new Error(profileError.message);
}

export async function deleteAccessCode(id: string) {
  const db = getDb();
  const { data: row } = await db.from("access_codes").select("role").eq("id", id).maybeSingle();
  if (row?.role === "admin" && (await countAdmins(id)) === 0) {
    throw new Error("Keep at least one administrator account.");
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
