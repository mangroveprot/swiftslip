import { getDb } from "@/server/db/client.server";
import { hashPassword } from "@/server/auth/password.server";
import type { Role } from "@/shared/types";

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
  password: string;
}) {
  if (!input.password || input.password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  const db = getDb();
  const payload = {
    label: input.label,
    role: input.role,
    password_hash: hashPassword(input.password),
  };
  const { error } = input.id
    ? await db.from("access_codes").update(payload).eq("id", input.id)
    : await db.from("access_codes").insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteAccessCode(id: string) {
  const db = getDb();
  const { count } = await db
    .from("access_codes")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  const { data: row } = await db.from("access_codes").select("role").eq("id", id).maybeSingle();
  if (row?.role === "admin" && (count ?? 0) <= 1) {
    throw new Error("Keep at least one administrator password.");
  }
  await db.from("access_codes").delete().eq("id", id);
}
