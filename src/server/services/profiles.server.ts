import { getDb } from "@/server/db/client.server";
import type { EmployeeProfile } from "@/shared/types";

const emptyProfile = (): EmployeeProfile => ({
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
  department: "",
  signature: "",
  supervisor: "",
});

export async function getProfile(accessCodeId: string): Promise<EmployeeProfile> {
  const db = getDb();
  let { data, error } = await db
    .from("profiles")
    .select("emp_no,full_name,designation,area,department,signature,supervisor")
    .eq("access_code_id", accessCodeId)
    .maybeSingle();
  // Databases that haven't run migration 0012 / 0021 / 0023 don't have these
  // columns yet. Step back one column-set at a time rather than failing the
  // whole page: the field then simply reads empty until the migration is applied.
  if (error?.message?.includes("department")) {
    ({ data, error } = await db
      .from("profiles")
      .select("emp_no,full_name,designation,area,signature,supervisor")
      .eq("access_code_id", accessCodeId)
      .maybeSingle());
  } else if (error?.message?.includes("signature")) {
    ({ data, error } = await db
      .from("profiles")
      .select("emp_no,full_name,designation,area")
      .eq("access_code_id", accessCodeId)
      .maybeSingle());
  } else if (error?.message?.includes("supervisor")) {
    ({ data, error } = await db
      .from("profiles")
      .select("emp_no,full_name,designation,area,department,signature")
      .eq("access_code_id", accessCodeId)
      .maybeSingle());
  }
  if (error) throw new Error(error.message);
  if (!data) return emptyProfile();
  return {
    emp_no: data.emp_no ?? "",
    full_name: data.full_name ?? "",
    designation: data.designation ?? "",
    area: data.area ?? "",
    department: data.department ?? "",
    signature: data.signature ?? "",
    supervisor: data.supervisor ?? "",
  };
}

export async function saveProfile(
  accessCodeId: string,
  profile: EmployeeProfile,
): Promise<EmployeeProfile> {
  const payload = {
    access_code_id: accessCodeId,
    emp_no: profile.emp_no,
    full_name: profile.full_name,
    designation: profile.designation,
    area: profile.area,
    department: profile.department,
    signature: profile.signature,
    supervisor: profile.supervisor,
    updated_at: new Date().toISOString(),
  };
  const db = getDb();
  let { data, error } = await db
    .from("profiles")
    .upsert(payload, { onConflict: "access_code_id" })
    .select("emp_no,full_name,designation,area,department,signature,supervisor")
    .single();
  // Databases that haven't run migration 0012 / 0021 / 0023 don't have these columns yet.
  if (error?.message?.includes("department")) {
    const { department: _dept, ...withoutDept } = payload;
    ({ data, error } = await db
      .from("profiles")
      .upsert(withoutDept, { onConflict: "access_code_id" })
      .select("emp_no,full_name,designation,area,signature,supervisor")
      .single());
  } else if (error?.message?.includes("signature")) {
    const { signature: _sig, supervisor: _sup, ...withoutBoth } = payload;
    ({ data, error } = await db
      .from("profiles")
      .upsert(withoutBoth, { onConflict: "access_code_id" })
      .select("emp_no,full_name,designation,area")
      .single());
  } else if (error?.message?.includes("supervisor")) {
    const { supervisor: _sup, ...withoutSupervisor } = payload;
    ({ data, error } = await db
      .from("profiles")
      .upsert(withoutSupervisor, { onConflict: "access_code_id" })
      .select("emp_no,full_name,designation,area,department,signature")
      .single());
  }
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Profile not found.");
  return {
    emp_no: data.emp_no ?? "",
    full_name: data.full_name ?? "",
    designation: data.designation ?? "",
    area: data.area ?? "",
    department: data.department ?? "",
    signature: data.signature ?? "",
    supervisor: data.supervisor ?? "",
  };
}
