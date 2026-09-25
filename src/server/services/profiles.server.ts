import { getDb } from "@/server/db/client.server";
import type { EmployeeProfile } from "@/shared/types";

const emptyProfile = (): EmployeeProfile => ({
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
});

export async function getProfile(accessCodeId: string): Promise<EmployeeProfile> {
  const { data, error } = await getDb()
    .from("profiles")
    .select("emp_no,full_name,designation,area")
    .eq("access_code_id", accessCodeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return emptyProfile();
  return {
    emp_no: data.emp_no ?? "",
    full_name: data.full_name ?? "",
    designation: data.designation ?? "",
    area: data.area ?? "",
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
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getDb()
    .from("profiles")
    .upsert(payload, { onConflict: "access_code_id" })
    .select("emp_no,full_name,designation,area")
    .single();
  if (error) throw new Error(error.message);
  return {
    emp_no: data.emp_no ?? "",
    full_name: data.full_name ?? "",
    designation: data.designation ?? "",
    area: data.area ?? "",
  };
}
