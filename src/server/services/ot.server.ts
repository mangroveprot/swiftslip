import { getDb } from "@/server/db/client.server";
import { readOtherFiles } from "@/server/services/attachments.server";
import type { OtEntry, OtForm } from "@/shared/types";

export async function listOtForms(ownerId: string) {
  const { data } = await getDb()
    .from("ot_forms")
    // `attachment_approved` rides along so the list can badge approved forms.
    .select(
      "id,employee_name,id_number,department,position,date_filed,attachment_approved,updated_at",
    )
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getOtForm(id: string, ownerId: string) {
  const db = getDb();
  const { data: form } = await db
    .from("ot_forms")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!form) throw new Error("Form not found.");
  const { data: entries } = await db
    .from("ot_entries")
    .select("idx,date_of_ot,regular_from,regular_to,actual_from,actual_to,total_hours,validation")
    .eq("form_id", id)
    .order("idx");
  // The additional supporting files travel as a plain list (their bytes stay
  // in storage) — pulled out of the row so `form` remains an exact OtForm.
  const { other_attachments, ...rest } = form;
  return {
    form: rest as unknown as OtForm & { id: string },
    entries: (entries ?? []) as OtEntry[],
    // The approval-slip file itself stays in storage — only its name travels
    // here, and only when there is one (absent keeps every cache write of
    // `{ form, entries }` type-compatible).
    ...(form.attachment_name ? { attachment: { name: form.attachment_name } } : {}),
    others: readOtherFiles(other_attachments),
  };
}

export async function createOtForm(
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
    .from("ot_forms")
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

export async function saveOtForm(id: string, ownerId: string, form: OtForm, entries: OtEntry[]) {
  const db = getDb();
  const payload = {
    id_number: form.id_number,
    employee_name: form.employee_name,
    department: form.department,
    position: form.position,
    date_filed: form.date_filed,
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
    .from("ot_forms")
    .update(payload)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("Form not found.");

  // Replace the OT lines wholesale — the same approach ob_entries uses.
  await db.from("ot_entries").delete().eq("form_id", id);
  if (entries.length) {
    const { error: insertError } = await db
      .from("ot_entries")
      .insert(entries.map((entry) => ({ ...entry, form_id: id })));
    if (insertError) throw new Error(insertError.message);
  }
}

export async function deleteOtForm(id: string, ownerId: string) {
  const db = getDb();
  // Read the attachment first — deleting the row must take its file with it.
  // The subject fields ride along for the admin activity log.
  const { data: form } = await db
    .from("ot_forms")
    .select("attachment_path,employee_name,id_number")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const { data, error } = await db
    .from("ot_forms")
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
