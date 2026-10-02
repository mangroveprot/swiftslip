import { getDb } from "@/server/db/client.server";
import { hashPassword, verifyPasswordHash } from "@/server/auth/password.server";
import type { Role } from "@/shared/types";

async function countAdmins(excludingId?: string) {
  const db = getDb();
  let query = db.from("users").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (excludingId) query = query.neq("id", excludingId);
  const { count } = await query;
  return count ?? 0;
}

/** True when another account already signs in with this ID number. */
async function idNumberInUse(idNumber: string, excludingId?: string) {
  const db = getDb();
  let query = db
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("id_number", idNumber);
  if (excludingId) query = query.neq("id", excludingId);
  const { count, error } = await query;
  if (error) throw migrationOrThrow(error.message);
  return (count ?? 0) > 0;
}

/** Friendly wording for "the id_number / users migration hasn't been applied yet". */
function migrationOrThrow(message: string) {
  if (/id_number/i.test(message)) {
    return new Error(
      "This needs a pending database update — run drizzle/migrations/0007_account_id_number.sql first.",
    );
  }
  // PostgREST reports unknown tables as a schema-cache miss; raw PG says
  // "relation … does not exist" — cover both wordings.
  if (/could not find the table .*users|relation .*users.* does not exist/i.test(message)) {
    return new Error(
      "This needs a pending database update — run drizzle/migrations/0010_users_rename.sql first.",
    );
  }
  return new Error(message);
}

export async function listAccessCodes() {
  const db = getDb();
  const [{ data, error }, { data: profiles, error: profilesError }] = await Promise.all([
    db.from("users").select("id,id_number,role,created_at").order("created_at"),
    db.from("profiles").select("access_code_id,full_name"),
  ]);
  if (error) throw migrationOrThrow(error.message);
  if (profilesError) throw new Error(profilesError.message);
  // The real name lives on the profile (filled in under "My Account"), not on
  // the account row — join it in so user management shows actual full names.
  const names = new Map<string, string>();
  for (const profile of profiles ?? []) {
    names.set(profile.access_code_id, profile.full_name);
  }
  return (data ?? []).map((code) => ({ ...code, full_name: names.get(code.id) ?? "" }));
}

export async function upsertAccessCode(input: {
  id?: string | undefined;
  /** Unique sign-in ID for the account — required on create. */
  idNumber: string;
  role: Role;
  /** Blank/omitted on an edit keeps the existing password. Required when creating. */
  password?: string | undefined;
}) {
  const db = getDb();
  const idNumber = input.idNumber.trim();

  if (input.id) {
    const { data: existing } = await db
      .from("users")
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
      id_number: idNumber,
      role: input.role,
      ...(input.password ? { password_hash: hashPassword(input.password) } : {}),
    };

    const { error } = await db.from("users").update(updatePayload).eq("id", input.id);
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
    id_number: idNumber,
    role: input.role,
    password_hash: hashPassword(input.password),
  };
  const { data: created, error } = await db
    .from("users")
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
  const { data: row } = await db.from("users").select("role,id_number").eq("id", id).maybeSingle();
  if (row?.role === "admin" && (await countAdmins(id)) === 0) {
    throw new Error("Keep at least one administrator account.");
  }
  await db.from("users").delete().eq("id", id);
  // Which sign-in ID went with it — for the admin activity log.
  return { idNumber: row?.id_number ?? id };
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
    .from("users")
    .select("password_hash")
    .eq("id", accessCodeId)
    .maybeSingle();
  if (!row || !verifyPasswordHash(currentPassword, row.password_hash)) {
    throw new Error("Current password is incorrect.");
  }
  const { error } = await db
    .from("users")
    .update({ password_hash: hashPassword(newPassword) })
    .eq("id", accessCodeId);
  if (error) throw new Error(error.message);
}
