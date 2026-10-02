import { getDb } from "@/server/db/client.server";
import type { ObEntry, ObForm } from "@/shared/types";

export async function listObForms(ownerId: string) {
  const { data } = await getDb()
    .from("ob_forms")
    .select("id,employee_name,id_number,department,position,date_of_ob,updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getObForm(id: string, ownerId: string) {
  const db = getDb();
  const { data: form } = await db
    .from("ob_forms")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!form) throw new Error("Form not found.");
  const { data: entries } = await db
    .from("ob_entries")
    .select("idx,from_place,to_place,purpose,time_departure,time_return")
    .eq("form_id", id)
    .order("idx");
  return {
    form: form as unknown as ObForm & { id: string },
    entries: (entries ?? []) as ObEntry[],
    // The approval-slip file itself stays in storage — only its name travels
    // here, and only when there is one (absent keeps every cache write of
    // `{ form, entries }` type-compatible).
    ...(form.attachment_name ? { attachment: { name: form.attachment_name } } : {}),
  };
}

export async function createObForm(
  ownerId: string,
  input: {
    id_number?: string;
    employee_name?: string;
    department?: string;
    position?: string;
    date_filed?: string;
  },
) {
  const { data: row, error } = await getDb()
    .from("ob_forms")
    .insert({
      owner_id: ownerId,
      id_number: input.id_number ?? "",
      employee_name: input.employee_name ?? "",
      department: input.department ?? "",
      position: input.position ?? "",
      date_filed: input.date_filed ?? "",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string };
}

export async function saveObForm(id: string, ownerId: string, form: ObForm, entries: ObEntry[]) {
  const db = getDb();
  const payload = {
    id_number: form.id_number,
    employee_name: form.employee_name,
    department: form.department,
    position: form.position,
    date_filed: form.date_filed,
    date_of_ob: form.date_of_ob,
    approved_by: form.approved_by,
    approved_via_viber: form.approved_via_viber,
    employee_signature: form.employee_signature ?? "",
    attachment_approved: form.attachment_approved ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error } = await db
    .from("ob_forms")
    .update(payload)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("Form not found.");

  await db.from("ob_entries").delete().eq("form_id", id);
  if (entries.length) {
    const { error: insertError } = await db
      .from("ob_entries")
      .insert(entries.map((entry) => ({ ...entry, form_id: id })));
    if (insertError) throw new Error(insertError.message);
  }
}

export async function deleteObForm(id: string, ownerId: string) {
  const db = getDb();
  // Read the attachment first — deleting the row must take its file with it.
  // The subject fields ride along for the admin activity log.
  const { data: form } = await db
    .from("ob_forms")
    .select("attachment_path,employee_name,id_number")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const { data, error } = await db
    .from("ob_forms")
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
