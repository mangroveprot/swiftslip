import { getDb } from "@/server/db/client.server";
import { readOtherFiles } from "@/server/services/attachments.server";
import type { LoaForm } from "@/shared/types";

export async function listLoaForms(ownerId: string) {
  const { data } = await getDb()
    .from("loa_forms")
    // `attachment_approved` rides along so the list can badge approved forms.
    .select(
      "id,employee_name,id_number,department,position,date_from,date_to,attachment_approved,updated_at",
    )
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getLoaForm(id: string, ownerId: string) {
  const { data: row } = await getDb()
    .from("loa_forms")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!row) throw new Error("Form not found.");
  // The additional supporting files travel as a plain list (their bytes stay
  // in storage) — pulled out of the row so `form` remains an exact LoaForm.
  const { other_attachments, ...form } = row;
  return {
    form: form as unknown as LoaForm & { id: string },
    // The medical-certificate file itself stays in storage — only its name
    // travels here, and only when there is one (absent keeps every cache write
    // of `form` type-compatible).
    ...(row.attachment_name ? { attachment: { name: row.attachment_name } } : {}),
    others: readOtherFiles(other_attachments),
  };
}

export async function createLoaForm(
  ownerId: string,
  input: {
    id_number?: string;
    employee_name?: string;
    department?: string;
    position?: string;
    employee_signature?: string;
    date_filed?: string;
  },
) {
  const { data: row, error } = await getDb()
    .from("loa_forms")
    .insert({
      owner_id: ownerId,
      id_number: input.id_number ?? "",
      employee_name: input.employee_name ?? "",
      department: input.department ?? "",
      position: input.position ?? "",
      employee_signature: input.employee_signature ?? "",
      date_filed: input.date_filed ?? "",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string };
}

export async function saveLoaForm(id: string, ownerId: string, form: LoaForm) {
  const payload = {
    id_number: form.id_number,
    employee_name: form.employee_name,
    department: form.department,
    position: form.position,
    date_filed: form.date_filed,
    date_from: form.date_from,
    date_to: form.date_to,
    days_applied: form.days_applied,
    leave_type: form.leave_type,
    leave_type_other: form.leave_type_other,
    pay_status: form.pay_status,
    reasons: form.reasons,
    report_back_date: form.report_back_date,
    approved_by: form.approved_by,
    approved_via_viber: form.approved_via_viber,
    employee_signature: form.employee_signature ?? "",
    attachment_approved: form.attachment_approved ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error } = await getDb()
    .from("loa_forms")
    .update(payload)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("Form not found.");
}

export async function deleteLoaForm(id: string, ownerId: string) {
  const db = getDb();
  // Read the attachments first — deleting the row must take its files with it.
  // The subject fields ride along for the admin activity log.
  const { data: form } = await db
    .from("loa_forms")
    .select("attachment_path,other_attachments,employee_name,id_number")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const { data, error } = await db
    .from("loa_forms")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Form not found.");
  const paths = [
    form?.attachment_path,
    ...(form ? readOtherFiles(form.other_attachments).map((file) => file.path) : []),
  ].filter((path): path is string => Boolean(path));
  if (paths.length) {
    // Best effort: an orphaned file is harmless, a lost form is not.
    await db.storage.from("swiftslip").remove(paths);
  }
  return {
    id,
    employee_name: form?.employee_name ?? "",
    id_number: form?.id_number ?? "",
  };
}
