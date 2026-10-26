import { getDb } from "@/server/db/client.server";
import { escapeLike } from "@/server/db/filters";
import { hashPassword, verifyPasswordHash } from "@/server/auth/password.server";
import { PASSWORD_MIN_LENGTH } from "@/shared/schemas";
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
    // Case-insensitive so "jd123" can't be created beside "JD123". The unique
    // index itself is case-sensitive, so this check is what keeps the two
    // spellings from colliding at sign-in (which is an exact match).
    .ilike("id_number", escapeLike(idNumber));
  if (excludingId) query = query.neq("id", excludingId);
  const { count, error } = await query;
  if (error) throw migrationOrThrow(error.message);
  return (count ?? 0) > 0;
}

/** Friendly wording for "the id_number / users migration hasn't been applied yet". */
function migrationOrThrow(message: string) {
  if (/id_number/i.test(message)) {
    return new Error(
      "This needs a pending database update. Run drizzle/migrations/0007_account_id_number.sql first.",
    );
  }
  // PostgREST reports unknown tables as a schema-cache miss; raw PG says
  // "relation … does not exist" — cover both wordings.
  if (/could not find the table .*users|relation .*users.* does not exist/i.test(message)) {
    return new Error(
      "This needs a pending database update. Run drizzle/migrations/0010_users_rename.sql first.",
    );
  }
  return new Error(message);
}

export async function listAccessCodes() {
  const db = getDb();
  const [{ data, error }, { data: profiles, error: profilesError }] = await Promise.all([
    db.from("users").select("id,id_number,role,created_at").order("created_at"),
    // `area` / `department` / `designation` are what the employee sees as
    // Designation (office), Department and Position (job title) — pulled here
    // so user management can show and edit them.
    db.from("profiles").select("access_code_id,full_name,area,department,designation"),
  ]);
  if (error) throw migrationOrThrow(error.message);
  // Databases that haven't run migration 0023 don't have `department` yet —
  // retry without it so the page still loads (the column then reads empty and
  // the UI falls back to the department derived from the position).
  let profileRows = profiles;
  if (profilesError?.message?.includes("department")) {
    const retry = await db.from("profiles").select("access_code_id,full_name,area,designation");
    // Retried rows predate migration 0023, so they have no department at all.
    profileRows = (retry.data ?? []).map((p) => ({ ...p, department: "" }));
    if (retry.error) throw new Error(retry.error.message);
  } else if (profilesError) {
    throw new Error(profilesError.message);
  }
  // The real name lives on the profile (filled in under "My Account"), not on
  // the account row — join it in so user management shows actual full names.
  const details = new Map<
    string,
    { full_name: string; designation: string; department: string; position: string }
  >();
  for (const profile of profileRows ?? []) {
    details.set(profile.access_code_id, {
      full_name: profile.full_name ?? "",
      designation: profile.area ?? "",
      department: profile.department ?? "",
      position: profile.designation ?? "",
    });
  }
  return (data ?? []).map((code) => {
    const d = details.get(code.id);
    return {
      ...code,
      // Supabase returns `role` as text; the DB constrains it to the two
      // values in `Role`. Narrow here so the admin screen gets `Role` rather
      // than a bare `string` it has to re-cast at every use.
      role: code.role as Role,
      full_name: d?.full_name ?? "",
      designation: d?.designation ?? "",
      department: d?.department ?? "",
      position: d?.position ?? "",
    };
  });
}

/**
 * Write the org fields an admin can set from user management.
 *
 * Only the fields actually supplied are changed — an edit that touches just
 * the role must not wipe a Designation the employee typed under "My Account".
 * Reads before writing so a partial edit still lands on a row that does not
 * exist yet (a brand-new account has no profile until it is first created).
 */
async function writeProfileDetails(
  accessCodeId: string,
  fields: {
    designation?: string | undefined;
    department?: string | undefined;
    position?: string | undefined;
  },
) {
  const db = getDb();
  const { data: existing } = await db
    .from("profiles")
    .select("area,department,designation")
    .eq("access_code_id", accessCodeId)
    .maybeSingle();
  const { error } = await db.from("profiles").upsert(
    {
      access_code_id: accessCodeId,
      area: fields.designation !== undefined ? fields.designation : (existing?.area ?? ""),
      // `department` only exists after migration 0023 — an upsert that names a
      // missing column fails outright, so retry without it rather than lose the
      // Designation / Position the admin also set on this same save.
      department:
        fields.department !== undefined ? fields.department : (existing?.department ?? ""),
      designation: fields.position !== undefined ? fields.position : (existing?.designation ?? ""),
    },
    { onConflict: "access_code_id" },
  );
  if (error?.message?.includes("department")) {
    const retry = await db.from("profiles").upsert(
      {
        access_code_id: accessCodeId,
        area: fields.designation !== undefined ? fields.designation : (existing?.area ?? ""),
        designation:
          fields.position !== undefined ? fields.position : (existing?.designation ?? ""),
      },
      { onConflict: "access_code_id" },
    );
    if (retry.error) throw new Error(retry.error.message);
    return;
  }
  if (error) throw new Error(error.message);
}

export async function upsertAccessCode(input: {
  id?: string | undefined;
  /** Unique sign-in ID for the account — required on create. */
  idNumber: string;
  role: Role;
  /** Blank/omitted on an edit keeps the existing password. Required when creating. */
  password?: string | undefined;
  /** Employee Designation / Department / Position. Omitted (not blank) leaves them unchanged. */
  designation?: string | undefined;
  department?: string | undefined;
  position?: string | undefined;
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

    if (input.password && input.password.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (await idNumberInUse(idNumber, input.id)) {
      throw new Error("That ID number is already in use.");
    }
    // Hashing is async (PBKDF2); only run it when a new password was supplied,
    // so an edit that only changes the role leaves the hash untouched.
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    const updatePayload = {
      id_number: idNumber,
      role: input.role,
      ...(passwordHash ? { password_hash: passwordHash } : {}),
    };

    const { error } = await db.from("users").update(updatePayload).eq("id", input.id);
    if (error) throw migrationOrThrow(error.message);

    if (
      input.designation !== undefined ||
      input.department !== undefined ||
      input.position !== undefined
    ) {
      await writeProfileDetails(input.id, {
        designation: input.designation,
        department: input.department,
        position: input.position,
      });
    }
    return;
  }

  if (!input.password || input.password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (await idNumberInUse(idNumber)) {
    throw new Error("That ID number is already in use.");
  }
  const insertPayload = {
    id_number: idNumber,
    role: input.role,
    password_hash: await hashPassword(input.password),
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
  // its employee number on DTR / OB forms — one fewer thing to retype. The
  // admin-supplied Designation / Department / Position land here too.
  const { error: profileError } = await db.from("profiles").upsert(
    {
      access_code_id: created.id as string,
      emp_no: idNumber,
      area: input.designation ?? "",
      department: input.department ?? "",
      designation: input.position ?? "",
    },
    { onConflict: "access_code_id" },
  );
  // Migration 0023 not applied yet: retry without the department column so the
  // account itself isn't lost — the field just stays empty until it runs.
  if (profileError?.message?.includes("department")) {
    const { error: retryError } = await db.from("profiles").upsert(
      {
        access_code_id: created.id as string,
        emp_no: idNumber,
        area: input.designation ?? "",
        designation: input.position ?? "",
      },
      { onConflict: "access_code_id" },
    );
    if (retryError) throw new Error(retryError.message);
    return;
  }
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
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  const db = getDb();
  const { data: row } = await db
    .from("users")
    .select("password_hash")
    .eq("id", accessCodeId)
    .maybeSingle();
  if (!row || !(await verifyPasswordHash(currentPassword, row.password_hash))) {
    throw new Error("Current password is incorrect.");
  }
  const { error } = await db
    .from("users")
    .update({ password_hash: await hashPassword(newPassword) })
    .eq("id", accessCodeId);
  if (error) throw new Error(error.message);
}
