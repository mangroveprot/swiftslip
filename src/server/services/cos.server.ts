import { getDb } from "@/server/db/client.server";
import type { CosForm, CosSchedule } from "@/shared/types";

export async function listCosForms(ownerId: string) {
  const { data } = await getDb()
    .from("cos_forms")
    // `attachment_approved` rides along so the list can badge approved forms.
    .select(
      "id,employee_name,id_number,plant_location,position,change_type,attachment_approved,updated_at",
    )
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getCosForm(id: string, ownerId: string) {
  const db = getDb();
  const { data: form } = await db
    .from("cos_forms")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!form) throw new Error("Form not found.");
  const { data: schedules } = await db
    .from("cos_schedules")
    .select("idx,effectivity_date,from_date,from_start,from_end,to_date,to_start,to_end")
    .eq("form_id", id)
    .order("idx");
  return {
    form: form as unknown as CosForm & { id: string },
    schedules: (schedules ?? []) as CosSchedule[],
    // The approval-slip file itself stays in storage — only its name travels
    // here, and only when there is one (absent keeps every cache write of
    // `{ form, schedules }` type-compatible).
    ...(form.attachment_name ? { attachment: { name: form.attachment_name } } : {}),
  };
}

export async function createCosForm(
  ownerId: string,
  input: {
    id_number?: string;
    employee_name?: string;
    plant_location?: string;
    position?: string;
    employee_signature?: string;
    date_filed?: string;
  },
) {
  const { data: row, error } = await getDb()
    .from("cos_forms")
    .insert({
      owner_id: ownerId,
      id_number: input.id_number ?? "",
      employee_name: input.employee_name ?? "",
      plant_location: input.plant_location ?? "",
      position: input.position ?? "",
      employee_signature: input.employee_signature ?? "",
      date_filed: input.date_filed ?? "",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string };
}

export async function saveCosForm(
  id: string,
  ownerId: string,
  form: CosForm,
  schedules: CosSchedule[],
) {
  const db = getDb();
  const payload = {
    id_number: form.id_number,
    employee_name: form.employee_name,
    plant_location: form.plant_location,
    position: form.position,
    date_filed: form.date_filed,
    change_type: form.change_type,
    employee_signature: form.employee_signature ?? "",
    reasons: form.reasons,
    approved_by: form.approved_by,
    received_by: form.received_by,
    processed_by: form.processed_by,
    approved_via_viber: form.approved_via_viber,
    attachment_approved: form.attachment_approved ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error } = await db
    .from("cos_forms")
    .update(payload)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("Form not found.");

  // Replace the schedule lines wholesale — the same approach ob_entries uses.
  await db.from("cos_schedules").delete().eq("form_id", id);
  if (schedules.length) {
    const { error: insertError } = await db
      .from("cos_schedules")
      .insert(schedules.map((row) => ({ ...row, form_id: id })));
    if (insertError) throw new Error(insertError.message);
  }
}

export async function deleteCosForm(id: string, ownerId: string) {
  const db = getDb();
  // Read the attachment first — deleting the row must take its file with it.
  // The subject fields ride along for the admin activity log.
  const { data: form } = await db
    .from("cos_forms")
    .select("attachment_path,employee_name,id_number")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const { data, error } = await db
    .from("cos_forms")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Form not found.");
  if (form?.attachment_path) {
    // Best effort: an orphaned file is harmless, a lost form is not.
    await db.storage.from("swiftslip").remove([form.attachment_path]);
  }
  return {
    id,
    employee_name: form?.employee_name ?? "",
    id_number: form?.id_number ?? "",
  };
}
